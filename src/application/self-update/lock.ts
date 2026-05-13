import { unlinkSync } from "node:fs";
import { mkdir, open, readdir, readFile, rm, rmdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
    isDirectoryReadError,
    isFileAlreadyExistsError,
    isPathMissingError,
} from "../shared/fs-errors.ts";
import { isProcessLockOwnerActive } from "../shared/process-owner.ts";
import { resolveLegacyVersionLockPath } from "./paths.ts";

const versionOwnerSchema = z.object({
    acquiredAt: z.string().trim().min(1),
    execPath: z.string().trim().min(1),
    pid: z.number().int().positive(),
    version: z.string().trim().min(1),
});

const activeVersionMarkerSchema = versionOwnerSchema.extend({
    markerId: z.string().trim().min(1),
});

const ownedInstallVersionLocks = new Map<string, {
    lock: VersionOwner;
    referenceCount: number;
}>();

export type ActiveVersionMarker = z.infer<typeof activeVersionMarkerSchema>;
export type VersionOwner = z.infer<typeof versionOwnerSchema>;

export interface ActiveVersionMarkerHandle {
    close: () => Promise<void>;
    closeSync: () => void;
    data: ActiveVersionMarker;
}

export interface InstallVersionLockHandle {
    close: () => Promise<void>;
    closeSync: () => void;
    data: VersionOwner;
}

export type InstallVersionLockAcquisitionResult
    = | {
        handle: InstallVersionLockHandle;
        status: "acquired";
    }
    | {
        ownerPid?: number;
        status: "busy";
    };

export async function acquireActiveVersionMarker(options: {
    execPath: string;
    markerFilePath: string;
    markerId: string;
    now?: () => number;
    processId: number;
    version: string;
}): Promise<ActiveVersionMarkerHandle | undefined> {
    const marker: ActiveVersionMarker = {
        acquiredAt: new Date((options.now ?? Date.now)()).toISOString(),
        execPath: options.execPath,
        markerId: options.markerId,
        pid: options.processId,
        version: options.version,
    };

    await mkdir(dirname(options.markerFilePath), { recursive: true });

    try {
        const fileHandle = await open(options.markerFilePath, "wx");

        try {
            await fileHandle.writeFile(`${JSON.stringify(marker)}\n`, "utf8");
        }
        finally {
            await fileHandle.close();
        }
    }
    catch (error) {
        if (isFileAlreadyExistsError(error)) {
            return undefined;
        }

        throw error;
    }

    return createActiveVersionMarkerHandle(options.markerFilePath, marker);
}

export async function acquireInstallVersionLock(options: {
    execPath: string;
    lockFilePath: string;
    now?: () => number;
    platform: NodeJS.Platform;
    processId: number;
    sleep?: (ms: number) => Promise<void>;
    version: string;
}): Promise<InstallVersionLockAcquisitionResult> {
    const sleep = options.sleep ?? Bun.sleep;
    const now = options.now ?? Date.now;

    await mkdir(dirname(options.lockFilePath), { recursive: true });

    if (ownedInstallVersionLocks.has(options.lockFilePath)) {
        incrementOwnedInstallVersionLockReferenceCount(options.lockFilePath);

        return {
            handle: createInstallVersionLockHandle(options.lockFilePath),
            status: "acquired",
        };
    }

    const lockData: VersionOwner = {
        acquiredAt: new Date(now()).toISOString(),
        execPath: options.execPath,
        pid: options.processId,
        version: options.version,
    };

    for (let attempt = 0; attempt <= 3; attempt += 1) {
        const result = await tryAcquireInstallVersionLock(
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

export async function cleanupStaleVersionLocks(options: {
    locksDirectory: string;
    platform: NodeJS.Platform;
}): Promise<void> {
    const entries = await readDirectoryEntries(options.locksDirectory);

    await Promise.all(entries.map(async (entry) => {
        const entryPath = join(options.locksDirectory, entry);

        if (entry === "active") {
            await cleanupStaleActiveVersionMarkers(entryPath, options.platform);
            return;
        }

        if (entry === "install") {
            await cleanupStaleInstallVersionLocks(entryPath, options.platform);
            return;
        }

        if (entry.endsWith(".lock")) {
            await cleanupLegacyVersionLock(entryPath, options.platform);
            return;
        }

        await rm(entryPath, {
            force: true,
            recursive: true,
        });
    }));
}

export async function listActiveVersionLocks(options: {
    locksDirectory: string;
    platform: NodeJS.Platform;
}): Promise<Set<string>> {
    const versions = new Set<string>();

    await Promise.all([
        addActiveMarkerVersions(versions, options),
        addLegacyLockVersions(versions, options),
    ]);

    return versions;
}

export async function findActiveVersionOwner(options: {
    excludeProcessId?: number;
    locksDirectory: string;
    platform: NodeJS.Platform;
    version: string;
}): Promise<{ ownerPid: number } | undefined> {
    const activeMarkerOwner = await findActiveMarkerOwner(
        join(options.locksDirectory, "active", options.version),
        options,
    );

    if (activeMarkerOwner !== undefined) {
        return activeMarkerOwner;
    }

    const legacyLock = await readVersionOwner(
        resolveLegacyVersionLockPath(options, options.version),
    );

    if (!isLiveOwner(legacyLock, options)) {
        return undefined;
    }

    return {
        ownerPid: legacyLock.pid,
    };
}

function createActiveVersionMarkerHandle(
    markerFilePath: string,
    marker: ActiveVersionMarker,
): ActiveVersionMarkerHandle {
    return {
        close: async () => {
            await rm(markerFilePath, { force: true });
        },
        closeSync: () => {
            try {
                unlinkSync(markerFilePath);
            }
            catch {}
        },
        data: marker,
    };
}

function createInstallVersionLockHandle(
    lockFilePath: string,
): InstallVersionLockHandle {
    const ownedLock = ownedInstallVersionLocks.get(lockFilePath);

    if (!ownedLock) {
        throw new Error(`Expected to own install version lock: ${lockFilePath}`);
    }

    return {
        close: async () => {
            await releaseInstallVersionLock(lockFilePath);
        },
        closeSync: () => {
            releaseInstallVersionLockSync(lockFilePath);
        },
        data: ownedLock.lock,
    };
}

async function tryAcquireInstallVersionLock(
    lockFilePath: string,
    lockData: VersionOwner,
    platform: NodeJS.Platform,
): Promise<InstallVersionLockAcquisitionResult> {
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

        const existingLockData = await readVersionOwner(lockFilePath);

        if (existingLockData?.pid === lockData.pid) {
            incrementOwnedInstallVersionLockReferenceCount(
                lockFilePath,
                existingLockData,
            );

            return {
                handle: createInstallVersionLockHandle(lockFilePath),
                status: "acquired",
            };
        }

        if (
            existingLockData
            && isProcessLockOwnerActive(
                existingLockData.pid,
                existingLockData.execPath,
                platform,
            )
        ) {
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

    const confirmedLockData = await readVersionOwner(lockFilePath);

    if (confirmedLockData?.pid !== lockData.pid) {
        await rm(lockFilePath, { force: true });

        return {
            ownerPid: confirmedLockData?.pid,
            status: "busy",
        };
    }

    ownedInstallVersionLocks.set(lockFilePath, {
        lock: confirmedLockData,
        referenceCount: 1,
    });

    return {
        handle: createInstallVersionLockHandle(lockFilePath),
        status: "acquired",
    };
}

async function releaseInstallVersionLock(lockFilePath: string): Promise<void> {
    const ownedLock = ownedInstallVersionLocks.get(lockFilePath);

    if (!ownedLock) {
        return;
    }

    if (ownedLock.referenceCount > 1) {
        ownedLock.referenceCount -= 1;
        return;
    }

    ownedInstallVersionLocks.delete(lockFilePath);
    await rm(lockFilePath, { force: true });
}

function releaseInstallVersionLockSync(lockFilePath: string): void {
    const ownedLock = ownedInstallVersionLocks.get(lockFilePath);

    if (!ownedLock) {
        return;
    }

    if (ownedLock.referenceCount > 1) {
        ownedLock.referenceCount -= 1;
        return;
    }

    ownedInstallVersionLocks.delete(lockFilePath);

    try {
        unlinkSync(lockFilePath);
    }
    catch {}
}

function incrementOwnedInstallVersionLockReferenceCount(
    lockFilePath: string,
    lockData?: VersionOwner,
): void {
    const ownedLock = ownedInstallVersionLocks.get(lockFilePath);

    if (ownedLock) {
        ownedLock.referenceCount += 1;
        return;
    }

    if (!lockData) {
        throw new Error(`Expected existing install version lock data: ${lockFilePath}`);
    }

    ownedInstallVersionLocks.set(lockFilePath, {
        lock: lockData,
        referenceCount: 1,
    });
}

async function cleanupStaleActiveVersionMarkers(
    activeDirectory: string,
    platform: NodeJS.Platform,
): Promise<void> {
    const versionEntries = await readDirectoryEntries(activeDirectory);

    await Promise.all(versionEntries.map(async (versionEntry) => {
        const versionDirectory = join(activeDirectory, versionEntry);
        const markerEntries = await readDirectoryEntries(versionDirectory);

        await Promise.all(markerEntries.map(async (markerEntry) => {
            const markerPath = join(versionDirectory, markerEntry);

            if (!markerEntry.endsWith(".lock")) {
                await rm(markerPath, {
                    force: true,
                    recursive: true,
                });
                return;
            }

            const marker = await readActiveVersionMarker(markerPath);

            if (!isVersionOwnerActive(marker, platform)) {
                await rm(markerPath, { force: true });
            }
        }));

        await rmdir(versionDirectory).catch(() => undefined);
    }));

    await rmdir(activeDirectory).catch(() => undefined);
}

async function cleanupStaleInstallVersionLocks(
    installDirectory: string,
    platform: NodeJS.Platform,
): Promise<void> {
    const entries = await readDirectoryEntries(installDirectory);

    await Promise.all(entries.map(async (entry) => {
        const entryPath = join(installDirectory, entry);

        if (!entry.endsWith(".lock")) {
            await rm(entryPath, {
                force: true,
                recursive: true,
            });
            return;
        }

        const lock = await readVersionOwner(entryPath);

        if (!isVersionOwnerActive(lock, platform)) {
            await rm(entryPath, { force: true });
        }
    }));

    await rmdir(installDirectory).catch(() => undefined);
}

async function cleanupLegacyVersionLock(
    lockFilePath: string,
    platform: NodeJS.Platform,
): Promise<void> {
    const lock = await readVersionOwner(lockFilePath);

    if (isVersionOwnerActive(lock, platform)) {
        return;
    }

    await rm(lockFilePath, {
        force: true,
        recursive: true,
    });
}

async function addActiveMarkerVersions(
    versions: Set<string>,
    options: {
        locksDirectory: string;
        platform: NodeJS.Platform;
    },
): Promise<void> {
    const activeDirectory = join(options.locksDirectory, "active");
    const versionEntries = await readDirectoryEntries(activeDirectory);

    await Promise.all(versionEntries.map(async (versionEntry) => {
        const versionDirectory = join(activeDirectory, versionEntry);
        const markerEntries = await readDirectoryEntries(versionDirectory);

        await Promise.all(markerEntries.map(async (markerEntry) => {
            if (!markerEntry.endsWith(".lock")) {
                return;
            }

            const marker = await readActiveVersionMarker(
                join(versionDirectory, markerEntry),
            );

            if (!isVersionOwnerActive(marker, options.platform)) {
                return;
            }

            versions.add(marker.version);
        }));
    }));
}

async function addLegacyLockVersions(
    versions: Set<string>,
    options: {
        locksDirectory: string;
        platform: NodeJS.Platform;
    },
): Promise<void> {
    const entries = await readDirectoryEntries(options.locksDirectory);

    await Promise.all(entries.map(async (entry) => {
        if (!entry.endsWith(".lock")) {
            return;
        }

        const lock = await readVersionOwner(
            join(options.locksDirectory, entry),
        );

        if (!isVersionOwnerActive(lock, options.platform)) {
            return;
        }

        versions.add(lock.version);
    }));
}

async function findActiveMarkerOwner(
    versionDirectory: string,
    options: {
        excludeProcessId?: number;
        platform: NodeJS.Platform;
    },
): Promise<{ ownerPid: number } | undefined> {
    const markerEntries = await readDirectoryEntries(versionDirectory);

    for (const markerEntry of markerEntries) {
        if (!markerEntry.endsWith(".lock")) {
            continue;
        }

        const marker = await readActiveVersionMarker(
            join(versionDirectory, markerEntry),
        );

        if (!isLiveOwner(marker, options)) {
            continue;
        }

        return {
            ownerPid: marker.pid,
        };
    }

    return undefined;
}

async function readActiveVersionMarker(
    markerFilePath: string,
): Promise<ActiveVersionMarker | undefined> {
    return readJsonFile(markerFilePath, activeVersionMarkerSchema);
}

async function readVersionOwner(
    filePath: string,
): Promise<VersionOwner | undefined> {
    return readJsonFile(filePath, versionOwnerSchema);
}

async function readJsonFile<Schema extends z.ZodType>(
    filePath: string,
    schema: Schema,
): Promise<z.infer<Schema> | undefined> {
    let content: string;

    try {
        content = await readFile(filePath, "utf8");
    }
    catch (error) {
        if (isPathMissingError(error) || isDirectoryReadError(error)) {
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

    const result = schema.safeParse(parsedContent);

    return result.success ? result.data : undefined;
}

function isLiveOwner<Owner extends VersionOwner>(
    lockData: Owner | undefined,
    options: {
        excludeProcessId?: number;
        platform: NodeJS.Platform;
    },
): lockData is Owner {
    if (lockData === undefined || lockData.pid === options.excludeProcessId) {
        return false;
    }

    return isVersionOwnerActive(lockData, options.platform);
}

function isVersionOwnerActive<Owner extends VersionOwner>(
    lockData: Owner | undefined,
    platform: NodeJS.Platform,
): lockData is Owner {
    if (lockData === undefined) {
        return false;
    }

    return isProcessLockOwnerActive(lockData.pid, lockData.execPath, platform);
}

async function readDirectoryEntries(path: string): Promise<string[]> {
    try {
        return await readdir(path);
    }
    catch (error) {
        if (isPathMissingError(error)) {
            return [];
        }

        throw error;
    }
}
