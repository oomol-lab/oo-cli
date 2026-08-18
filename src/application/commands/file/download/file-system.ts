import type { FileHandle } from "node:fs/promises";
import type { CliExecutionContext } from "../../../contracts/cli.ts";
import type { DownloadProgressReporter } from "../../shared/download-progress.ts";
import type { ExistingDownloadSession, WriteDownloadPlan } from "./types.ts";

import { link, lstat, open, rm, unlink } from "node:fs/promises";
import { join } from "node:path";

import { CliUserError } from "../../../contracts/cli.ts";
import { resolveDownloadTempLockFilePath } from "../../../shared/download-temp-lock.ts";
import { isFileAlreadyExistsError } from "../../../shared/fs-errors.ts";
import { pathExists, writeChunk } from "../../../shared/fs-utils.ts";
import { createDownloadFailedError } from "./errors.ts";

export async function deleteDownloadSessionArtifacts(
    session: ExistingDownloadSession,
    sessionStore: Pick<CliExecutionContext["fileDownloadSessionStore"], "deleteDownloadSession">,
): Promise<void> {
    try {
        await sessionStore.deleteDownloadSession(session.session.id);
    }
    catch {}

    await rm(session.tempFilePath, {
        force: true,
    }).catch(() => undefined);
    await rm(resolveDownloadTempLockFilePath(session.tempFilePath), {
        force: true,
    }).catch(() => undefined);
}

export async function resolveTemporaryDownloadFileName(
    directoryPath: string,
    finalBaseName: string,
    sessionId: string,
    reservedFileNames: readonly string[] = [],
): Promise<string> {
    const reservedFileNameSet = new Set(reservedFileNames);
    const sessionIdSuffix = createSessionIdFileSuffix(sessionId);

    for (let index = 0; ; index += 1) {
        const temporaryBaseName = appendNumericSuffix(
            `${finalBaseName}.${sessionIdSuffix}`,
            index,
        );
        const temporaryFileName = `${temporaryBaseName}.oodownload`;

        if (reservedFileNameSet.has(temporaryFileName)) {
            continue;
        }

        if (!(await pathExists(join(directoryPath, temporaryFileName), lstat))) {
            return temporaryFileName;
        }
    }
}

export async function reserveTemporaryDownloadFile(
    temporaryFilePath: string,
): Promise<boolean> {
    try {
        const fileHandle = await open(temporaryFilePath, "wx");

        await fileHandle.close();

        return true;
    }
    catch (error) {
        if (isFileAlreadyExistsError(error)) {
            return false;
        }

        throw createDownloadFailedError(
            temporaryFilePath,
            error instanceof Error ? error.message : String(error),
        );
    }
}

export async function openTemporaryDownloadFile(
    temporaryFilePath: string,
    mode: WriteDownloadPlan["mode"],
    expectedExistingBytes: number,
): Promise<FileHandle> {
    try {
        const fileHandle = await openTemporaryFileForMode(temporaryFilePath, mode);

        if (mode === "append" || mode === "fresh") {
            const metadata = await fileHandle.stat();

            if (metadata.size !== expectedExistingBytes) {
                await fileHandle.close().catch(() => undefined);

                throw createDownloadFailedError(
                    temporaryFilePath,
                    "The partial download changed before resume could continue.",
                );
            }
        }

        return fileHandle;
    }
    catch (error) {
        if (error instanceof CliUserError) {
            throw error;
        }

        throw createDownloadFailedError(
            temporaryFilePath,
            error instanceof Error ? error.message : String(error),
        );
    }
}

export async function writeDownloadToTemporaryFile(
    response: Response,
    fileHandle: FileHandle,
    temporaryFilePath: string,
    progressReporter: DownloadProgressReporter | undefined,
    initialDownloadedBytes: number,
): Promise<number> {
    const reader = response.body?.getReader();
    let downloadedBytes = initialDownloadedBytes;

    try {
        progressReporter?.render(downloadedBytes);

        if (reader !== undefined) {
            while (true) {
                const chunk = await reader.read();

                if (chunk.done) {
                    break;
                }

                if (chunk.value.byteLength === 0) {
                    continue;
                }

                await writeChunk(fileHandle, chunk.value);
                downloadedBytes += chunk.value.byteLength;
                progressReporter?.render(downloadedBytes);
            }
        }

        await fileHandle.close();
        progressReporter?.complete(downloadedBytes);

        return downloadedBytes;
    }
    catch (error) {
        progressReporter?.finish(downloadedBytes);
        await fileHandle.close().catch(() => undefined);

        throw createDownloadFailedError(
            temporaryFilePath,
            error instanceof Error ? error.message : String(error),
        );
    }
    finally {
        reader?.releaseLock();
    }
}

export async function finalizeDownloadedFile(
    temporaryFilePath: string,
    directoryPath: string,
    baseName: string,
    extension?: string,
): Promise<string> {
    for (let index = 0; ; index += 1) {
        const candidateBaseName = appendNumericSuffix(baseName, index);
        const candidateFileName = buildFileName(candidateBaseName, extension);
        const candidateFilePath = join(directoryPath, candidateFileName);

        try {
            await link(temporaryFilePath, candidateFilePath);
            await unlink(temporaryFilePath);
            return candidateFilePath;
        }
        catch (error) {
            if (isFileAlreadyExistsError(error)) {
                continue;
            }

            throw createDownloadFailedError(
                candidateFilePath,
                error instanceof Error ? error.message : String(error),
            );
        }
    }
}

async function openTemporaryFileForMode(
    temporaryFilePath: string,
    mode: WriteDownloadPlan["mode"],
): Promise<FileHandle> {
    if (mode === "append") {
        return await open(temporaryFilePath, "a");
    }

    try {
        return await open(temporaryFilePath, "wx");
    }
    catch (error) {
        if (!isFileAlreadyExistsError(error)) {
            throw error;
        }

        return await open(temporaryFilePath, "r+");
    }
}

function buildFileName(baseName: string, extension?: string): string {
    return extension === undefined || extension === ""
        ? baseName
        : `${baseName}.${extension}`;
}

function appendNumericSuffix(value: string, index: number): string {
    return index === 0 ? value : `${value}_${index}`;
}

function createSessionIdFileSuffix(sessionId: string): string {
    const compactSessionId = sessionId.replaceAll("-", "");

    return compactSessionId.slice(Math.max(0, compactSessionId.length - 12));
}
