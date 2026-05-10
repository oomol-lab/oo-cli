import type { Stats } from "node:fs";
import type { CliExecutionContext } from "../../../contracts/cli.ts";
import type {
    FileDownloadSessionKey,
    FileDownloadSessionRecord,
} from "../../../contracts/file-download-session-store.ts";
import type { ResolvedDownloadFileName } from "../file-name-utils.ts";
import type { ExistingDownloadSession, ParsedContentRange, WriteDownloadPlan } from "./types.ts";

import { stat } from "node:fs/promises";
import { join } from "node:path";

import { isFileMissingError } from "../../../shared/fs-errors.ts";
import { resolveDownloadFileName, splitFileNameParts } from "../file-name-utils.ts";
import { createDownloadFailedError } from "./errors.ts";
import {
    deleteDownloadSessionArtifacts,
    reserveTemporaryDownloadFile,
    resolveTemporaryDownloadFileName,
} from "./file-system.ts";
import {
    acquireDownloadTempLock,
    resolveDownloadTempLockFilePath,
} from "./lock.ts";

type DownloadSessionLookupStore = Pick<
    CliExecutionContext["fileDownloadSessionStore"],
    "deleteDownloadSession" | "findDownloadSessions"
>;

type DownloadSessionSaveStore = Pick<
    CliExecutionContext["fileDownloadSessionStore"],
    "saveDownloadSession"
>;

interface DownloadSessionLookupContext {
    execPath: string;
    fileDownloadSessionStore: DownloadSessionLookupStore;
    logger?: CliExecutionContext["logger"];
}

export function createDownloadSessionKey(options: {
    outDirPath: string;
    requestUrl: string;
    requestedExtension?: string;
    requestedName?: string;
}): FileDownloadSessionKey {
    return {
        outDirPath: options.outDirPath,
        requestUrl: options.requestUrl,
        requestedExtension: options.requestedExtension ?? "",
        requestedName: options.requestedName ?? "",
    };
}

export async function createWriteDownloadPlanFromResponse(
    requestUrl: URL,
    sessionKey: FileDownloadSessionKey,
    response: Response,
    context: {
        execPath: string;
        logger?: CliExecutionContext["logger"];
        sessionStore: DownloadSessionSaveStore;
    },
    reservedTempFileNames: readonly string[] = [],
): Promise<WriteDownloadPlan> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const session = await createDownloadSessionRecord(
            requestUrl,
            sessionKey,
            response,
            reservedTempFileNames,
        );
        const tempFilePath = join(session.outDirPath, session.tempFileName);
        const tempLock = await acquireDownloadTempLock({
            execPath: context.execPath,
            lockFilePath: resolveDownloadTempLockFilePath(tempFilePath),
            sessionId: session.id,
            tempFileName: session.tempFileName,
        });

        if (tempLock.status !== "acquired") {
            continue;
        }

        const reserved = await reserveTemporaryDownloadFile(tempFilePath);

        if (!reserved) {
            await tempLock.handle.close();
            continue;
        }

        await saveDownloadSessionBestEffort(
            session,
            context.sessionStore,
            context.logger,
        );

        return {
            initialBytes: 0,
            kind: "write-response",
            mode: "fresh",
            resolvedFileName: readResolvedFileName(session),
            response,
            session,
            tempLock: tempLock.handle,
            tempFilePath,
            totalBytes: session.totalBytes,
        };
    }

    throw createDownloadFailedError(
        sessionKey.outDirPath,
        "Unable to reserve a unique temporary download file.",
    );
}

export async function loadExistingDownloadSession(
    sessionKey: FileDownloadSessionKey,
    context: DownloadSessionLookupContext,
): Promise<ExistingDownloadSession | undefined> {
    const sessions = await context.fileDownloadSessionStore.findDownloadSessions(sessionKey);

    if (sessions.length === 0) {
        return undefined;
    }

    for (const session of sessions) {
        const tempFilePath = join(session.outDirPath, session.tempFileName);
        let metadata: Stats;

        try {
            metadata = await stat(tempFilePath);
        }
        catch (error) {
            if (isFileMissingError(error)) {
                await deleteDownloadSessionBestEffort(
                    session.id,
                    context.fileDownloadSessionStore,
                    context.logger,
                );
                continue;
            }

            throw createDownloadFailedError(
                tempFilePath,
                error instanceof Error ? error.message : String(error),
            );
        }

        const tempLock = await acquireDownloadTempLock({
            execPath: context.execPath,
            lockFilePath: resolveDownloadTempLockFilePath(tempFilePath),
            sessionId: session.id,
            tempFileName: session.tempFileName,
        });

        if (tempLock.status !== "acquired") {
            continue;
        }

        const isInvalid
            = !metadata.isFile()
                || metadata.size === 0
                || (session.totalBytes !== undefined && metadata.size > session.totalBytes);

        if (isInvalid) {
            await deleteDownloadSessionArtifacts(
                {
                    localBytes: metadata.size,
                    session,
                    tempLock: tempLock.handle,
                    tempFilePath,
                },
                context.fileDownloadSessionStore,
            );
            await tempLock.handle.close();
            continue;
        }

        return {
            localBytes: metadata.size,
            session,
            tempLock: tempLock.handle,
            tempFilePath,
        };
    }

    return undefined;
}

export function updateDownloadSessionFromResumeResponse(
    session: FileDownloadSessionRecord,
    response: Response,
    totalBytes: number,
): FileDownloadSessionRecord {
    const finalUrl = response.url === "" ? session.finalUrl : response.url;

    return {
        ...session,
        entityTag: response.headers.get("ETag") ?? session.entityTag,
        finalUrl,
        lastModified: response.headers.get("Last-Modified") ?? session.lastModified,
        totalBytes,
        updatedAtMs: Date.now(),
    };
}

export function readResolvedFileName(
    session: FileDownloadSessionRecord,
): ResolvedDownloadFileName {
    return {
        baseName: session.resolvedBaseName,
        extension: emptyStringToUndefined(session.resolvedExtension),
    };
}

export async function saveDownloadSessionBestEffort(
    record: FileDownloadSessionRecord,
    sessionStore: DownloadSessionSaveStore,
    logger?: CliExecutionContext["logger"],
): Promise<void> {
    try {
        await sessionStore.saveDownloadSession(record);
    }
    catch (error) {
        logger?.debug(
            {
                error,
                id: record.id,
            },
            "File download resume session save failed.",
        );
    }
}

export async function deleteDownloadSessionBestEffort(
    id: string,
    sessionStore: Pick<CliExecutionContext["fileDownloadSessionStore"], "deleteDownloadSession">,
    logger?: CliExecutionContext["logger"],
): Promise<void> {
    try {
        await sessionStore.deleteDownloadSession(id);
    }
    catch (error) {
        logger?.debug(
            {
                error,
                id,
            },
            "File download resume session delete failed.",
        );
    }
}

export function parseContentRange(value: string | null): ParsedContentRange | undefined {
    if (value === null) {
        return undefined;
    }

    const trimmedValue = value.trim();
    const spaceIndex = trimmedValue.indexOf(" ");

    if (spaceIndex <= 0 || trimmedValue.slice(0, spaceIndex).toLowerCase() !== "bytes") {
        return undefined;
    }

    const rangeValue = trimmedValue.slice(spaceIndex + 1);
    const slashIndex = rangeValue.indexOf("/");

    if (slashIndex <= 0) {
        return undefined;
    }

    const startEndValue = rangeValue.slice(0, slashIndex);
    const totalValue = rangeValue.slice(slashIndex + 1);
    const dashIndex = startEndValue.indexOf("-");

    if (dashIndex <= 0 || dashIndex === startEndValue.length - 1) {
        return undefined;
    }

    const start = parseSafeInteger(startEndValue.slice(0, dashIndex));
    const end = parseSafeInteger(startEndValue.slice(dashIndex + 1));
    const totalBytes = totalValue === "*" ? undefined : parseSafeInteger(totalValue);

    if (
        start === undefined
        || end === undefined
        || end < start
        || (totalBytes !== undefined && totalBytes <= end)
    ) {
        return undefined;
    }

    return {
        end,
        start,
        totalBytes,
    };
}

async function createDownloadSessionRecord(
    requestUrl: URL,
    sessionKey: FileDownloadSessionKey,
    response: Response,
    reservedTempFileNames: readonly string[] = [],
): Promise<FileDownloadSessionRecord> {
    const finalUrl = response.url === "" ? requestUrl.toString() : response.url;
    const resolvedFileName = resolveDownloadFileName({
        contentDisposition: response.headers.get("Content-Disposition"),
        contentType: response.headers.get("Content-Type"),
        requestedExtension: emptyStringToUndefined(sessionKey.requestedExtension),
        requestedName: emptyStringToUndefined(sessionKey.requestedName),
        responseUrl: finalUrl,
    });
    const sessionId = Bun.randomUUIDv7();
    const plannedFileParts = splitFileNameParts(
        resolvedFileName.extension === undefined
            ? resolvedFileName.baseName
            : `${resolvedFileName.baseName}.${resolvedFileName.extension}`,
    );

    return {
        entityTag: response.headers.get("ETag") ?? "",
        finalUrl,
        id: sessionId,
        lastModified: response.headers.get("Last-Modified") ?? "",
        outDirPath: sessionKey.outDirPath,
        requestUrl: sessionKey.requestUrl,
        requestedExtension: sessionKey.requestedExtension,
        requestedName: sessionKey.requestedName,
        resolvedBaseName: resolvedFileName.baseName,
        resolvedExtension: resolvedFileName.extension ?? "",
        tempFileName: await resolveTemporaryDownloadFileName(
            sessionKey.outDirPath,
            plannedFileParts.baseName,
            sessionId,
            reservedTempFileNames,
        ),
        totalBytes: parseSafeInteger(response.headers.get("Content-Length") ?? ""),
        updatedAtMs: Date.now(),
    };
}

function parseSafeInteger(value: string): number | undefined {
    if (value === "") {
        return undefined;
    }

    const parsedValue = Number(value);

    if (!Number.isSafeInteger(parsedValue) || parsedValue < 0) {
        return undefined;
    }

    return parsedValue;
}

function emptyStringToUndefined(value: string): string | undefined {
    return value === "" ? undefined : value;
}
