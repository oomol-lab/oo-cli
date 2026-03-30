import type { CliExecutionContext } from "../../../contracts/cli.ts";
import type {
    FileDownloadSessionKey,
    FileDownloadSessionRecord,
} from "../../../contracts/file-download-session-store.ts";
import type { ResolvedDownloadFileName } from "../file-name-utils.ts";
import type { ExistingDownloadSession, ParsedContentRange, WriteDownloadPlan } from "./types.ts";

import { stat } from "node:fs/promises";
import { join } from "node:path";

import { resolveDownloadFileName, splitFileNameParts } from "../file-name-utils.ts";
import { createDownloadFailedError, isErrorCode } from "./errors.ts";
import {
    deleteDownloadSessionArtifacts,
    resolveAvailableFileName,
    resolveTemporaryDownloadFileName,
} from "./file-system.ts";

type DownloadSessionLookupStore = Pick<
    CliExecutionContext["fileDownloadSessionStore"],
    "deleteDownloadSession" | "findDownloadSession"
>;

type DownloadSessionSaveStore = Pick<
    CliExecutionContext["fileDownloadSessionStore"],
    "saveDownloadSession"
>;

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
    sessionStore: DownloadSessionSaveStore,
    reservedTempFileNames: readonly string[] = [],
): Promise<WriteDownloadPlan> {
    const session = await createDownloadSessionRecord(
        requestUrl,
        sessionKey,
        response,
        reservedTempFileNames,
    );

    sessionStore.saveDownloadSession(session);

    return {
        initialBytes: 0,
        kind: "write-response",
        mode: "fresh",
        resolvedFileName: readResolvedFileName(session),
        response,
        session,
        tempFilePath: join(session.outDirPath, session.tempFileName),
        totalBytes: session.totalBytes,
    };
}

export async function loadExistingDownloadSession(
    sessionKey: FileDownloadSessionKey,
    sessionStore: DownloadSessionLookupStore,
): Promise<ExistingDownloadSession | undefined> {
    const session = sessionStore.findDownloadSession(sessionKey);

    if (session === undefined) {
        return undefined;
    }

    const tempFilePath = join(session.outDirPath, session.tempFileName);
    let metadata: Awaited<ReturnType<typeof stat>>;

    try {
        metadata = await stat(tempFilePath);
    }
    catch (error) {
        if (isErrorCode(error, "ENOENT")) {
            sessionStore.deleteDownloadSession(session.id);
            return undefined;
        }

        throw createDownloadFailedError(
            tempFilePath,
            error instanceof Error ? error.message : String(error),
        );
    }

    const isInvalid
        = !metadata.isFile()
            || metadata.size === 0
            || (session.totalBytes !== undefined && metadata.size > session.totalBytes);

    if (isInvalid) {
        await deleteDownloadSessionArtifacts(
            { localBytes: metadata.size, session, tempFilePath },
            sessionStore,
        );

        return undefined;
    }

    return {
        localBytes: metadata.size,
        session,
        tempFilePath,
    };
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
    const plannedFinalFileName = await resolveAvailableFileName(
        sessionKey.outDirPath,
        resolvedFileName.baseName,
        resolvedFileName.extension,
    );
    const plannedFileParts = splitFileNameParts(plannedFinalFileName);

    return {
        entityTag: response.headers.get("ETag") ?? "",
        finalUrl,
        id: Bun.randomUUIDv7(),
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
