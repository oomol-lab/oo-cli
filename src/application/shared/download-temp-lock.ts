import { open, readFile, rm } from "node:fs/promises";
import process from "node:process";

import { z } from "zod";

import {
    isDirectoryReadError,
    isFileAlreadyExistsError,
    isFileMissingError,
} from "./fs-errors.ts";
import { isProcessLockOwnerActive } from "./process-owner.ts";

const downloadTempLockSchema = z.object({
    acquiredAt: z.string().trim().min(1),
    execPath: z.string().trim().min(1),
    pid: z.number().int().positive(),
    sessionId: z.string().trim().min(1),
    tempFileName: z.string().trim().min(1),
});

export type DownloadTempLockData = z.infer<typeof downloadTempLockSchema>;

export interface DownloadTempLockHandle {
    close: () => Promise<void>;
    data: DownloadTempLockData;
    lockFilePath: string;
}

export type DownloadTempLockAcquisitionResult
    = | {
        handle: DownloadTempLockHandle;
        status: "acquired";
    }
    | {
        ownerPid?: number;
        status: "busy";
    };

export function resolveDownloadTempLockFilePath(tempFilePath: string): string {
    return `${tempFilePath}.lock`;
}

export async function acquireDownloadTempLock(options: {
    execPath: string;
    lockFilePath: string;
    now?: () => number;
    platform?: NodeJS.Platform;
    processId?: number;
    sessionId: string;
    tempFileName: string;
}): Promise<DownloadTempLockAcquisitionResult> {
    const lockData: DownloadTempLockData = {
        acquiredAt: new Date(options.now?.() ?? Date.now()).toISOString(),
        execPath: options.execPath,
        pid: options.processId ?? process.pid,
        sessionId: options.sessionId,
        tempFileName: options.tempFileName,
    };
    const platform = options.platform ?? process.platform;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await tryAcquireDownloadTempLock(
            options.lockFilePath,
            lockData,
            platform,
        );

        if (result.status === "acquired") {
            return result;
        }

        if (result.ownerPid !== undefined) {
            return result;
        }
    }

    return {
        ownerPid: undefined,
        status: "busy",
    };
}

export async function readDownloadTempLockData(
    lockFilePath: string,
): Promise<DownloadTempLockData | undefined> {
    let content: string;

    try {
        content = await readFile(lockFilePath, "utf8");
    }
    catch (error) {
        if (isFileMissingError(error) || isDirectoryReadError(error)) {
            return undefined;
        }

        throw error;
    }

    let parsedContent: unknown;

    try {
        parsedContent = JSON.parse(content);
    }
    catch {
        return undefined;
    }

    const result = downloadTempLockSchema.safeParse(parsedContent);

    return result.success ? result.data : undefined;
}

export function isDownloadTempLockActive(
    lockData: DownloadTempLockData,
    platform: NodeJS.Platform = process.platform,
): boolean {
    return isProcessLockOwnerActive(lockData.pid, lockData.execPath, platform);
}

async function tryAcquireDownloadTempLock(
    lockFilePath: string,
    lockData: DownloadTempLockData,
    platform: NodeJS.Platform,
): Promise<DownloadTempLockAcquisitionResult> {
    try {
        const fileHandle = await open(lockFilePath, "wx");

        try {
            await fileHandle.writeFile(`${JSON.stringify(lockData)}\n`, "utf8");
        }
        finally {
            await fileHandle.close();
        }
    }
    catch (error) {
        if (!isFileAlreadyExistsError(error)) {
            throw error;
        }

        const existingLockData = await readDownloadTempLockData(lockFilePath);

        if (existingLockData && isDownloadTempLockActive(existingLockData, platform)) {
            return {
                ownerPid: existingLockData.pid,
                status: "busy",
            };
        }

        await rm(lockFilePath, { force: true });

        return {
            ownerPid: undefined,
            status: "busy",
        };
    }

    const confirmedLockData = await readDownloadTempLockData(lockFilePath);

    if (confirmedLockData?.sessionId !== lockData.sessionId) {
        await rm(lockFilePath, { force: true });

        return {
            ownerPid: confirmedLockData?.pid,
            status: "busy",
        };
    }

    return {
        handle: {
            close: async () => {
                await rm(lockFilePath, { force: true });
            },
            data: confirmedLockData,
            lockFilePath,
        },
        status: "acquired",
    };
}
