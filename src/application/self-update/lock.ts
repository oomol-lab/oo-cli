import { unlinkSync } from "node:fs";
import { open, readdir, readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import process from "node:process";
import { z } from "zod";
import {
    isDirectoryReadError,
    isFileAlreadyExistsError,
    isFileMissingError,
    isProcessMissingError,
} from "../shared/fs-errors.ts";

const versionLockSchema = z.object({
    acquiredAt: z.string().trim().min(1),
    execPath: z.string().trim().min(1),
    pid: z.number().int().positive(),
    version: z.string().trim().min(1),
});

const ownedVersionLocks = new Map<string, {
    lock: VersionLockData;
    referenceCount: number;
}>();

export type VersionLockData = z.infer<typeof versionLockSchema>;

export interface VersionLockHandle {
    close: () => Promise<void>;
    closeSync: () => void;
    data: VersionLockData;
}

export type VersionLockAcquisitionResult
    = | {
        handle: VersionLockHandle;
        status: "acquired";
    }
    | {
        ownerPid?: number;
        status: "busy";
    };

export async function acquireVersionLock(options: {
    execPath: string;
    lockFilePath: string;
    now?: () => number;
    platform: NodeJS.Platform;
    processId: number;
    sleep?: (ms: number) => Promise<void>;
    version: string;
}): Promise<VersionLockAcquisitionResult> {
    const sleep = options.sleep ?? Bun.sleep;
    const now = options.now ?? Date.now;

    if (ownedVersionLocks.has(options.lockFilePath)) {
        incrementOwnedVersionLockReferenceCount(options.lockFilePath);

        return {
            handle: createVersionLockHandle(options.lockFilePath),
            status: "acquired",
        };
    }

    const lockData: VersionLockData = {
        acquiredAt: new Date(now()).toISOString(),
        execPath: options.execPath,
        pid: options.processId,
        version: options.version,
    };

    for (let attempt = 0; attempt <= 3; attempt += 1) {
        const result = await tryAcquireVersionLock(
            options.lockFilePath,
            lockData,
            options.platform,
        );

        if (result.status === "acquired") {
            return result;
        }

        if (attempt === 3) {
            return result;
        }

        const delayMs = Math.min(1000 * (2 ** attempt), 5000);
        await sleep(delayMs);
    }

    return {
        ownerPid: undefined,
        status: "busy",
    };
}

export async function acquireProcessLifetimeVersionLock(options: {
    execPath: string;
    lockFilePath: string;
    now?: () => number;
    platform: NodeJS.Platform;
    processId: number;
    version: string;
}): Promise<VersionLockHandle | undefined> {
    const result = await acquireVersionLock(options);

    return result.status === "acquired"
        ? result.handle
        : undefined;
}

export async function cleanupStaleVersionLocks(options: {
    locksDirectory: string;
    platform: NodeJS.Platform;
}): Promise<void> {
    const entries = await readDirectoryEntries(options.locksDirectory);

    await Promise.all(entries.map(async (entry) => {
        const entryPath = join(options.locksDirectory, entry);

        if (!entry.endsWith(".lock")) {
            await rm(entryPath, {
                force: true,
                recursive: true,
            });
            return;
        }

        const lockData = await readVersionLockData(entryPath);

        if (!lockData || !isVersionLockActive(lockData, options.platform)) {
            await rm(entryPath, {
                force: true,
                recursive: true,
            });
        }
    }));
}

export async function listActiveVersionLocks(options: {
    locksDirectory: string;
    platform: NodeJS.Platform;
}): Promise<Set<string>> {
    const versions = new Set<string>();
    const entries = await readDirectoryEntries(options.locksDirectory);

    for (const entry of entries) {
        if (!entry.endsWith(".lock")) {
            continue;
        }

        const lockData = await readVersionLockData(
            join(options.locksDirectory, entry),
        );

        if (!lockData || !isVersionLockActive(lockData, options.platform)) {
            continue;
        }

        versions.add(lockData.version);
    }

    return versions;
}

function createVersionLockHandle(lockFilePath: string): VersionLockHandle {
    const ownedLock = ownedVersionLocks.get(lockFilePath);

    if (!ownedLock) {
        throw new Error(`Expected to own version lock: ${lockFilePath}`);
    }

    return {
        close: async () => {
            await releaseVersionLock(lockFilePath);
        },
        closeSync: () => {
            releaseVersionLockSync(lockFilePath);
        },
        data: ownedLock.lock,
    };
}

async function tryAcquireVersionLock(
    lockFilePath: string,
    lockData: VersionLockData,
    platform: NodeJS.Platform,
): Promise<VersionLockAcquisitionResult> {
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

        const existingLockData = await readVersionLockData(lockFilePath);

        if (existingLockData?.pid === lockData.pid) {
            incrementOwnedVersionLockReferenceCount(
                lockFilePath,
                existingLockData,
            );

            return {
                handle: createVersionLockHandle(lockFilePath),
                status: "acquired",
            };
        }

        if (existingLockData && isVersionLockActive(existingLockData, platform)) {
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

    const confirmedLockData = await readVersionLockData(lockFilePath);

    if (confirmedLockData?.pid !== lockData.pid) {
        await rm(lockFilePath, { force: true });

        return {
            ownerPid: confirmedLockData?.pid,
            status: "busy",
        };
    }

    ownedVersionLocks.set(lockFilePath, {
        lock: confirmedLockData,
        referenceCount: 1,
    });

    return {
        handle: createVersionLockHandle(lockFilePath),
        status: "acquired",
    };
}

async function releaseVersionLock(lockFilePath: string): Promise<void> {
    const ownedLock = ownedVersionLocks.get(lockFilePath);

    if (!ownedLock) {
        return;
    }

    if (ownedLock.referenceCount > 1) {
        ownedLock.referenceCount -= 1;
        return;
    }

    ownedVersionLocks.delete(lockFilePath);
    await rm(lockFilePath, { force: true });
}

function releaseVersionLockSync(lockFilePath: string): void {
    const ownedLock = ownedVersionLocks.get(lockFilePath);

    if (!ownedLock) {
        return;
    }

    if (ownedLock.referenceCount > 1) {
        ownedLock.referenceCount -= 1;
        return;
    }

    ownedVersionLocks.delete(lockFilePath);

    try {
        unlinkSync(lockFilePath);
    }
    catch {}
}

function incrementOwnedVersionLockReferenceCount(
    lockFilePath: string,
    lockData?: VersionLockData,
): void {
    const ownedLock = ownedVersionLocks.get(lockFilePath);

    if (ownedLock) {
        ownedLock.referenceCount += 1;
        return;
    }

    if (!lockData) {
        throw new Error(`Expected existing version lock data: ${lockFilePath}`);
    }

    ownedVersionLocks.set(lockFilePath, {
        lock: lockData,
        referenceCount: 1,
    });
}

async function readVersionLockData(
    lockFilePath: string,
): Promise<VersionLockData | undefined> {
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

    const result = versionLockSchema.safeParse(parsedContent);

    return result.success ? result.data : undefined;
}

function isVersionLockActive(
    lockData: VersionLockData,
    platform: NodeJS.Platform,
): boolean {
    if (!isProcessAlive(lockData.pid)) {
        return false;
    }

    const commandLine = readProcessCommandLine(lockData.pid, platform);

    if (commandLine === null) {
        return true;
    }

    const normalizedCommandLine = commandLine.toLowerCase();
    const normalizedExecPath = lockData.execPath.toLowerCase();
    const executableName = basename(lockData.execPath).toLowerCase();

    return normalizedCommandLine.includes(normalizedExecPath)
        || normalizedCommandLine.includes(executableName);
}

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return !isProcessMissingError(error);
    }
}

function readProcessCommandLine(
    pid: number,
    platform: NodeJS.Platform,
): string | null {
    if (platform === "win32") {
        return null;
    }

    try {
        const result = Bun.spawnSync(
            [
                "ps",
                "-p",
                String(pid),
                "-o",
                "command=",
            ],
            {
                stderr: "pipe",
                stdin: "ignore",
                stdout: "pipe",
            },
        );

        if (result.exitCode !== 0) {
            return null;
        }

        const commandLine = new TextDecoder().decode(result.stdout).trim();

        return commandLine === "" ? null : commandLine;
    }
    catch {
        return null;
    }
}

async function readDirectoryEntries(path: string): Promise<string[]> {
    try {
        return await readdir(path);
    }
    catch (error) {
        if (isFileMissingError(error)) {
            return [];
        }

        throw error;
    }
}
