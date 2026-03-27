import type { PathLike } from "node:fs";
import type { CliExecutionContext } from "../../../contracts/cli.ts";
import type { DownloadProgressReporter } from "./progress.ts";
import type { ExistingDownloadSession, WriteDownloadPlan } from "./types.ts";

import { link, lstat, open, rm, unlink } from "node:fs/promises";
import { join } from "node:path";

import { CliUserError } from "../../../contracts/cli.ts";
import { createDownloadFailedError, isErrorCode } from "./errors.ts";

type DownloadFileHandle = Awaited<ReturnType<typeof open>>;

export async function deleteDownloadSessionArtifacts(
    session: ExistingDownloadSession,
    sessionStore: Pick<CliExecutionContext["fileDownloadSessionStore"], "deleteDownloadSession">,
): Promise<void> {
    sessionStore.deleteDownloadSession(session.session.id);
    await rm(session.tempFilePath, {
        force: true,
    }).catch(() => undefined);
}

export async function resolveAvailableFileName(
    directoryPath: string,
    baseName: string,
    extension?: string,
): Promise<string> {
    for (let index = 0; ; index += 1) {
        const candidateBaseName = appendNumericSuffix(baseName, index);
        const candidateFileName = buildFileName(candidateBaseName, extension);
        const candidatePath = join(directoryPath, candidateFileName);

        if (!(await pathExists(candidatePath))) {
            return candidateFileName;
        }
    }
}

export async function resolveTemporaryDownloadFileName(
    directoryPath: string,
    finalBaseName: string,
    reservedFileNames: readonly string[] = [],
): Promise<string> {
    const reservedFileNameSet = new Set(reservedFileNames);

    for (let index = 0; ; index += 1) {
        const temporaryBaseName = appendNumericSuffix(finalBaseName, index);
        const temporaryFileName = `${temporaryBaseName}.oodownload`;

        if (reservedFileNameSet.has(temporaryFileName)) {
            continue;
        }

        if (!(await pathExists(join(directoryPath, temporaryFileName)))) {
            return temporaryFileName;
        }
    }
}

export async function openTemporaryDownloadFile(
    temporaryFilePath: string,
    mode: WriteDownloadPlan["mode"],
    expectedExistingBytes: number,
): Promise<DownloadFileHandle> {
    try {
        const fileHandle = await open(temporaryFilePath, mode === "append" ? "a" : "wx");

        if (mode === "append") {
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
    fileHandle: DownloadFileHandle,
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
    const resolvedFileName = await resolveAvailableFileName(
        directoryPath,
        baseName,
        extension,
    );
    const candidateFilePath = join(directoryPath, resolvedFileName);

    try {
        await link(temporaryFilePath, candidateFilePath);
        await unlink(temporaryFilePath);
        return candidateFilePath;
    }
    catch (error) {
        throw createDownloadFailedError(
            candidateFilePath,
            error instanceof Error ? error.message : String(error),
        );
    }
}

async function writeChunk(
    fileHandle: DownloadFileHandle,
    chunk: Uint8Array,
): Promise<void> {
    let offset = 0;

    while (offset < chunk.byteLength) {
        const writeResult = await fileHandle.write(chunk.subarray(offset));

        offset += writeResult.bytesWritten;
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

async function pathExists(path: PathLike): Promise<boolean> {
    try {
        await lstat(path);
        return true;
    }
    catch (error) {
        if (isErrorCode(error, "ENOENT")) {
            return false;
        }

        throw error;
    }
}
