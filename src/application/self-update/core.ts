import type { Logger } from "pino";
import type { CliExecutionContext, Fetcher } from "../contracts/cli.ts";
import type { LegacyPackageManagerCleanupRuntime } from "./legacy-installation.ts";
import type { SelfUpdateProgressEvent } from "./progress.ts";
import { chmod, copyFile, lstat, mkdir, open, readdir, readlink, realpath, rename, rm, stat, symlink } from "node:fs/promises";
import { basename, delimiter, dirname, isAbsolute, join, normalize, relative, resolve as resolvePath, sep } from "node:path";
import process from "node:process";
import { APP_NAME } from "../config/app-config.ts";
import { CliUserError } from "../contracts/cli.ts";
import { isSemver } from "../semver.ts";
import { isFileMissingError } from "../shared/fs-errors.ts";
import { pathExists, writeChunk } from "../shared/fs-utils.ts";
import {
    buildCliBinaryDownloadUrl,
    fetchLatestCliReleaseVersion,
    parseLatestCliSemverReleaseVersion,
} from "../update/release-metadata.ts";
import { attemptLegacyPackageManagerUninstall } from "./legacy-installation.ts";
import {
    acquireProcessLifetimeVersionLock,
    acquireVersionLock,
    cleanupStaleVersionLocks,
    listActiveVersionLocks,
} from "./lock.ts";
import {
    resolveSelfUpdateLockFilePath,
    resolveSelfUpdatePaths,
    resolveSelfUpdateStagingBinaryPath,
    resolveSelfUpdateStagingDirectory,
    resolveSelfUpdateVersionFilePath,
    resolveSelfUpdateVersionTempFilePath,
} from "./paths.ts";
import { detectSelfUpdateReleasePlatform } from "./platform.ts";

export interface SelfUpdateRuntime extends LegacyPackageManagerCleanupRuntime {
    arch: string;
    downloadStallMaxRetries?: number;
    downloadStallTimeoutMs?: number;
    downloadTimeoutMs?: number;
    fetcher: Fetcher;
    now?: () => number;
    platform: NodeJS.Platform;
    processId: number;
    sleep?: (ms: number) => Promise<void>;
}

export const selfUpdateDevelopmentVersion = "0.0.0-development";
export const selfUpdateBinaryDownloadTimeoutMs = 300_000;
export const selfUpdateBinaryDownloadStallMaxRetries = 3;
export const selfUpdateBinaryDownloadStallTimeoutMs = 60_000;
export const selfUpdateReleaseRequestTimeoutMs = 10_000;

export interface SelfUpdateOperationResult {
    executableDirectory: string;
    executablePath: string;
    pathConfigured: boolean;
    releasePlatform: string;
    status: "installed";
    targetVersion: string;
}

export type SelfUpdateOperationOutcome
    = SelfUpdateOperationResult
        | {
            ownerPid?: number;
            status: "busy";
        };

export interface ProcessLifetimeVersionLockResource {
    close: () => Promise<void>;
}

export async function resolveLatestSelfUpdateVersion(options: {
    currentVersion: string;
    fetcher: Fetcher;
    logger: Logger;
}): Promise<string> {
    const latestVersion = await fetchLatestCliReleaseVersion({
        currentVersion: options.currentVersion,
        fetcher: options.fetcher,
        logger: options.logger,
        parseVersion: parseLatestCliSemverReleaseVersion,
        timeoutMs: selfUpdateReleaseRequestTimeoutMs,
    });

    if (latestVersion === null) {
        throw new CliUserError("errors.selfUpdate.latestVersionUnavailable", 1);
    }

    return latestVersion;
}

export async function performSelfUpdateOperation(options: {
    currentVersion: string;
    forceReinstall: boolean;
    reportStage?: (event: SelfUpdateProgressEvent) => void;
    runtime: SelfUpdateRuntime;
    targetVersion: string;
}): Promise<SelfUpdateOperationOutcome> {
    validateSelfUpdateTargetVersionOrThrow(options.targetVersion);

    const paths = resolveSelfUpdatePaths({
        env: options.runtime.env,
        platform: options.runtime.platform,
    });
    const releasePlatform = await detectReleasePlatformOrThrow(options.runtime);

    options.reportStage?.({
        stage: "prepare",
        version: options.targetVersion,
    });
    await ensureSelfUpdateDirectories(paths);
    await cleanupStaleVersionLocks({
        locksDirectory: paths.locksDirectory,
        platform: options.runtime.platform,
    });

    const lockResult = await acquireVersionLock({
        execPath: options.runtime.execPath,
        lockFilePath: resolveSelfUpdateLockFilePath(paths, options.targetVersion),
        now: options.runtime.now,
        platform: options.runtime.platform,
        processId: options.runtime.processId,
        sleep: options.runtime.sleep,
        version: options.targetVersion,
    });

    if (lockResult.status === "busy") {
        return {
            ownerPid: lockResult.ownerPid,
            status: "busy",
        };
    }

    try {
        await materializeTargetVersion({
            currentVersion: options.currentVersion,
            forceReinstall: options.forceReinstall,
            paths,
            releasePlatform,
            reportStage: options.reportStage,
            runtime: options.runtime,
            targetVersion: options.targetVersion,
        });
        options.reportStage?.({
            stage: "activate",
            version: options.targetVersion,
        });
        await activateTargetVersion({
            paths,
            platform: options.runtime.platform,
            processId: options.runtime.processId,
            targetVersion: options.targetVersion,
            timestamp: (options.runtime.now ?? Date.now)(),
        });

        const pathConfigured = await verifyInstalledEntrypoint({
            env: options.runtime.env,
            paths,
            platform: options.runtime.platform,
            reportStage: options.reportStage,
            targetVersion: options.targetVersion,
        });

        options.reportStage?.({
            stage: "cleanup",
            version: options.targetVersion,
        });
        await cleanupSelfUpdateArtifacts({
            currentVersion: options.currentVersion,
            logger: options.runtime.logger,
            paths,
            platform: options.runtime.platform,
            targetVersion: options.targetVersion,
        });
        await attemptLegacyPackageManagerUninstall(options.runtime);

        return {
            executableDirectory: paths.executableDirectory,
            executablePath: paths.executablePath,
            pathConfigured,
            releasePlatform,
            status: "installed",
            targetVersion: options.targetVersion,
        };
    }
    finally {
        await lockResult.handle.close();
    }
}

export async function initializeCurrentVersionProcessLock(options: {
    currentVersion: string;
    runtime: Pick<SelfUpdateRuntime, "env" | "execPath" | "logger" | "platform" | "processId">;
}): Promise<ProcessLifetimeVersionLockResource | undefined> {
    const paths = resolveSelfUpdatePaths({
        env: options.runtime.env,
        platform: options.runtime.platform,
    });
    const currentVersionPath = resolveSelfUpdateVersionFilePath(
        paths,
        options.currentVersion,
    );

    if (options.runtime.platform === "win32") {
        await cleanupWindowsExecutableBackups(paths, options.runtime.logger);
    }

    if (!(await pathExists(currentVersionPath))) {
        return undefined;
    }

    try {
        const lockHandle = await acquireProcessLifetimeVersionLock({
            execPath: options.runtime.execPath,
            lockFilePath: resolveSelfUpdateLockFilePath(paths, options.currentVersion),
            platform: options.runtime.platform,
            processId: options.runtime.processId,
            version: options.currentVersion,
        });

        if (!lockHandle) {
            options.runtime.logger.warn(
                {
                    currentVersion: options.currentVersion,
                },
                "Current CLI version lifetime lock could not be acquired.",
            );
            return undefined;
        }

        const closeOnExit = () => {
            lockHandle.closeSync();
        };

        process.once("exit", closeOnExit);

        return {
            close: async () => {
                process.off("exit", closeOnExit);
                await lockHandle.close();
            },
        };
    }
    catch (error) {
        options.runtime.logger.warn(
            {
                currentVersion: options.currentVersion,
                err: error,
            },
            "Current CLI version lifetime lock acquisition failed.",
        );
        return undefined;
    }
}

export function renderSelfUpdateLockBusyMessage(options: {
    ownerPid?: number;
    translator: Pick<CliExecutionContext["translator"], "t">;
}): string {
    if (options.ownerPid === undefined) {
        return options.translator.t("selfUpdate.lockBusy");
    }

    return options.translator.t("selfUpdate.lockBusyWithPid", {
        ownerPid: options.ownerPid,
    });
}

async function detectReleasePlatformOrThrow(
    runtime: Pick<SelfUpdateRuntime, "arch" | "platform">,
): Promise<string> {
    try {
        return await detectSelfUpdateReleasePlatform({
            arch: runtime.arch,
            platform: runtime.platform,
        });
    }
    catch {
        throw new CliUserError("errors.selfUpdate.unsupportedPlatform", 1, {
            arch: runtime.arch,
            platform: runtime.platform,
        });
    }
}

async function ensureSelfUpdateDirectories(paths: {
    executableDirectory: string;
    locksDirectory: string;
    stagingDirectory: string;
    versionsDirectory: string;
}): Promise<void> {
    await Promise.all([
        mkdir(paths.versionsDirectory, { recursive: true }),
        mkdir(paths.stagingDirectory, { recursive: true }),
        mkdir(paths.locksDirectory, { recursive: true }),
        mkdir(paths.executableDirectory, { recursive: true }),
    ]);
}

async function materializeTargetVersion(options: {
    currentVersion: string;
    forceReinstall: boolean;
    paths: ReturnType<typeof resolveSelfUpdatePaths>;
    releasePlatform: string;
    reportStage?: (event: SelfUpdateProgressEvent) => void;
    runtime: SelfUpdateRuntime;
    targetVersion: string;
}): Promise<void> {
    const targetVersionPath = resolveSelfUpdateVersionFilePath(
        options.paths,
        options.targetVersion,
    );

    if (
        !options.forceReinstall
        && await pathExists(targetVersionPath)
    ) {
        options.reportStage?.({
            stage: "reuse",
            version: options.targetVersion,
        });
        return;
    }

    const timestamp = (options.runtime.now ?? Date.now)();
    const stagingBinaryPath = resolveSelfUpdateStagingBinaryPath({
        paths: options.paths,
        platform: options.runtime.platform,
        processId: options.runtime.processId,
        timestamp,
        version: options.targetVersion,
    });
    const stagingDirectory = resolveSelfUpdateStagingDirectory(
        stagingBinaryPath,
        options.runtime.platform,
    );
    const versionTempPath = resolveSelfUpdateVersionTempFilePath({
        paths: options.paths,
        processId: options.runtime.processId,
        timestamp,
        version: options.targetVersion,
    });
    const binaryUrl = buildCliBinaryDownloadUrl({
        platform: options.releasePlatform,
        version: options.targetVersion,
    });

    options.reportStage?.({
        stage: "download",
        version: options.targetVersion,
    });
    await mkdir(stagingDirectory, { recursive: true });

    try {
        await fetchBinaryResponse({
            currentVersion: options.currentVersion,
            fetcher: options.runtime.fetcher,
            logger: options.runtime.logger,
            maxStallRetries: options.runtime.downloadStallMaxRetries
                ?? selfUpdateBinaryDownloadStallMaxRetries,
            outputPath: stagingBinaryPath,
            stallTimeoutMs: options.runtime.downloadStallTimeoutMs
                ?? selfUpdateBinaryDownloadStallTimeoutMs,
            timeoutMs: options.runtime.downloadTimeoutMs
                ?? selfUpdateBinaryDownloadTimeoutMs,
            url: binaryUrl,
        });

        if (options.runtime.platform !== "win32") {
            await chmod(stagingBinaryPath, 0o755);
        }

        await copyFile(stagingBinaryPath, versionTempPath);

        if (options.runtime.platform !== "win32") {
            await chmod(versionTempPath, 0o755);
        }

        await replaceTargetVersionFile({
            platform: options.runtime.platform,
            processId: options.runtime.processId,
            targetVersionPath,
            temporaryVersionPath: versionTempPath,
            timestamp,
        });
    }
    finally {
        await removePathBestEffort(stagingDirectory);
        await removePathBestEffort(versionTempPath);
    }
}

async function fetchBinaryResponse(options: {
    currentVersion: string;
    fetcher: Fetcher;
    logger: Logger;
    maxStallRetries: number;
    outputPath: string;
    stallTimeoutMs: number;
    timeoutMs: number;
    url: string;
}): Promise<void> {
    for (let attempt = 0; attempt <= options.maxStallRetries; attempt += 1) {
        try {
            await downloadBinaryResponseOnce(options);
            return;
        }
        catch (error) {
            if (!(error instanceof BinaryDownloadStalledError)) {
                throw error;
            }

            if (attempt === options.maxStallRetries) {
                options.logger.warn(
                    {
                        requestUrl: options.url,
                        stallTimeoutMs: options.stallTimeoutMs,
                        totalAttempts: attempt + 1,
                    },
                    "CLI self-update binary download stalled repeatedly.",
                );
                throw new CliUserError("errors.selfUpdate.downloadStalled", 1, {
                    retries: options.maxStallRetries,
                    timeoutSeconds: Math.ceil(options.stallTimeoutMs / 1000),
                });
            }

            options.logger.warn(
                {
                    requestUrl: options.url,
                    retryAttempt: attempt + 1,
                    stallTimeoutMs: options.stallTimeoutMs,
                },
                "CLI self-update binary download stalled and will be retried.",
            );
        }
    }
}

async function downloadBinaryResponseOnce(options: {
    currentVersion: string;
    fetcher: Fetcher;
    logger: Logger;
    outputPath: string;
    stallTimeoutMs: number;
    timeoutMs: number;
    url: string;
}): Promise<void> {
    const abortController = new AbortController();
    let abortReason: "stall" | "timeout" | undefined;
    // These timers must stay referenced so mocked or in-memory downloads still
    // transition to abort without relying on external I/O handles to keep the
    // event loop alive.
    const timeoutId = setTimeout(() => {
        abortReason = "timeout";
        abortController.abort();
    }, options.timeoutMs);

    try {
        let response: Response;

        try {
            response = await options.fetcher(options.url, {
                headers: {
                    "accept": "application/octet-stream",
                    "user-agent": `${APP_NAME}/${options.currentVersion}`,
                },
                signal: abortController.signal,
            });
        }
        catch (error) {
            if (abortReason === "timeout") {
                options.logger.warn(
                    {
                        requestUrl: options.url,
                        timeoutMs: options.timeoutMs,
                    },
                    "CLI self-update binary download timed out.",
                );
                throw new CliUserError("errors.selfUpdate.downloadTimedOut", 1);
            }
            options.logger.warn(
                {
                    err: error,
                    requestUrl: options.url,
                },
                "CLI self-update binary download failed.",
            );
            throw new CliUserError("errors.selfUpdate.downloadError", 1, {
                message: error instanceof Error ? error.message : String(error),
            });
        }

        if (!response.ok) {
            options.logger.warn(
                {
                    requestUrl: options.url,
                    status: response.status,
                },
                "CLI self-update binary download returned a non-success status.",
            );
            throw new CliUserError("errors.selfUpdate.downloadFailed", 1, {
                status: response.status,
            });
        }

        try {
            await writeBinaryResponseToFile({
                abortController,
                outputPath: options.outputPath,
                response,
                stallTimeoutMs: options.stallTimeoutMs,
                updateAbortReason: (reason) => {
                    abortReason = reason;
                },
            });
        }
        catch (error) {
            if (abortReason === "timeout") {
                options.logger.warn(
                    {
                        requestUrl: options.url,
                        timeoutMs: options.timeoutMs,
                    },
                    "CLI self-update binary download timed out.",
                );
                throw new CliUserError("errors.selfUpdate.downloadTimedOut", 1);
            }

            if (abortReason === "stall") {
                throw new BinaryDownloadStalledError();
            }

            throw new CliUserError("errors.selfUpdate.downloadError", 1, {
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    finally {
        clearTimeout(timeoutId);
    }
}

async function writeBinaryResponseToFile(options: {
    abortController: AbortController;
    outputPath: string;
    response: Response;
    stallTimeoutMs: number;
    updateAbortReason: (reason: "stall" | "timeout") => void;
}): Promise<void> {
    const reader = options.response.body?.getReader();

    if (reader === undefined) {
        throw new Error("Binary download response body is unavailable.");
    }

    const fileHandle = await open(options.outputPath, "w");
    let stallTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const resetStallTimeout = (): void => {
        if (stallTimeoutId !== undefined) {
            clearTimeout(stallTimeoutId);
        }

        stallTimeoutId = setTimeout(() => {
            options.updateAbortReason("stall");
            options.abortController.abort();
        }, options.stallTimeoutMs);
    };

    try {
        resetStallTimeout();

        while (true) {
            const chunk = await reader.read();

            if (chunk.done) {
                break;
            }

            if (chunk.value.byteLength === 0) {
                continue;
            }

            resetStallTimeout();
            await writeChunk(fileHandle, chunk.value);
        }
    }
    finally {
        if (stallTimeoutId !== undefined) {
            clearTimeout(stallTimeoutId);
        }

        reader.releaseLock();
        await fileHandle.close().catch(() => undefined);
    }
}

async function replaceTargetVersionFile(options: {
    platform: NodeJS.Platform;
    processId: number;
    targetVersionPath: string;
    temporaryVersionPath: string;
    timestamp: number;
}): Promise<void> {
    if (options.platform !== "win32") {
        await rename(options.temporaryVersionPath, options.targetVersionPath);
        return;
    }

    const backupPath
        = `${options.targetVersionPath}.old.${options.processId}.${options.timestamp}`;

    try {
        await rename(options.temporaryVersionPath, options.targetVersionPath);
        return;
    }
    catch {}

    let backupCreated = false;

    try {
        await rename(options.targetVersionPath, backupPath);
        backupCreated = true;
        await rename(options.temporaryVersionPath, options.targetVersionPath);
    }
    catch (error) {
        if (backupCreated) {
            await rename(backupPath, options.targetVersionPath).catch(() => {});
        }
        throw error;
    }

    if (backupCreated) {
        await removePathBestEffort(backupPath);
    }
}

async function activateTargetVersion(options: {
    paths: ReturnType<typeof resolveSelfUpdatePaths>;
    platform: NodeJS.Platform;
    processId: number;
    targetVersion: string;
    timestamp: number;
}): Promise<void> {
    if (options.platform === "win32") {
        await activateWindowsEntrypoint(options);
        return;
    }

    await activateUnixEntrypoint(options);
}

async function activateUnixEntrypoint(options: {
    paths: ReturnType<typeof resolveSelfUpdatePaths>;
    processId: number;
    targetVersion: string;
    timestamp: number;
}): Promise<void> {
    const targetVersionPath = resolveSelfUpdateVersionFilePath(
        options.paths,
        options.targetVersion,
    );
    const temporarySymlinkPath = join(
        options.paths.executableDirectory,
        `oo.tmp.${options.processId}.${options.timestamp}`,
    );

    await removePathBestEffort(temporarySymlinkPath);
    await symlink(targetVersionPath, temporarySymlinkPath);

    try {
        await rename(temporarySymlinkPath, options.paths.executablePath);
    }
    catch (error) {
        await removePathBestEffort(temporarySymlinkPath);
        throw error;
    }
}

async function activateWindowsEntrypoint(options: {
    paths: ReturnType<typeof resolveSelfUpdatePaths>;
    targetVersion: string;
    timestamp: number;
}): Promise<void> {
    const targetVersionPath = resolveSelfUpdateVersionFilePath(
        options.paths,
        options.targetVersion,
    );
    const backupExecutablePath = `${options.paths.executablePath}.old.${options.timestamp}`;
    const executableExists = await pathExists(options.paths.executablePath);

    if (executableExists) {
        await rename(options.paths.executablePath, backupExecutablePath);
    }

    try {
        await copyFile(targetVersionPath, options.paths.executablePath);
    }
    catch (error) {
        await restoreWindowsExecutableBackup({
            backupExecutablePath,
            executableExists,
            executablePath: options.paths.executablePath,
        });
        throw error;
    }

    await removePathBestEffort(backupExecutablePath);
}

async function restoreWindowsExecutableBackup(options: {
    backupExecutablePath: string;
    executableExists: boolean;
    executablePath: string;
}): Promise<void> {
    await removePathBestEffort(options.executablePath);

    if (options.executableExists) {
        await rename(options.backupExecutablePath, options.executablePath).catch(() => {});
    }
}

async function verifyInstalledEntrypoint(options: {
    env: Record<string, string | undefined>;
    paths: ReturnType<typeof resolveSelfUpdatePaths>;
    platform: NodeJS.Platform;
    reportStage?: (event: SelfUpdateProgressEvent) => void;
    targetVersion: string;
}): Promise<boolean> {
    const targetVersionPath = resolveSelfUpdateVersionFilePath(
        options.paths,
        options.targetVersion,
    );

    options.reportStage?.({
        stage: "verify",
        version: options.targetVersion,
    });
    if (options.platform !== "win32") {
        let executableMetadata: Awaited<ReturnType<typeof lstat>>;

        try {
            executableMetadata = await lstat(options.paths.executablePath);
        }
        catch (error) {
            if (isFileMissingError(error)) {
                throw new CliUserError("errors.selfUpdate.verifyEntrypointMissing", 1, {
                    path: options.paths.executablePath,
                });
            }
            throw error;
        }

        if (!executableMetadata.isSymbolicLink()) {
            throw new CliUserError("errors.selfUpdate.verifyEntrypointInvalid", 1, {
                path: options.paths.executablePath,
            });
        }

        const linkedTarget = await readlink(options.paths.executablePath);
        const [resolvedLinkedTarget, resolvedTargetVersionPath] = await Promise.all([
            realpath(
                isAbsolute(linkedTarget)
                    ? linkedTarget
                    : join(dirname(options.paths.executablePath), linkedTarget),
            ),
            realpath(targetVersionPath).catch((error) => {
                if (isFileMissingError(error)) {
                    throw new CliUserError("errors.selfUpdate.verifyTargetMissing", 1, {
                        path: targetVersionPath,
                    });
                }
                throw error;
            }),
        ]);

        if (normalize(resolvedLinkedTarget) !== normalize(resolvedTargetVersionPath)) {
            throw new CliUserError("errors.selfUpdate.verifyEntrypointInvalid", 1, {
                path: options.paths.executablePath,
            });
        }
    }
    else {
        try {
            await stat(options.paths.executablePath);
        }
        catch (error) {
            if (isFileMissingError(error)) {
                throw new CliUserError("errors.selfUpdate.verifyEntrypointMissing", 1, {
                    path: options.paths.executablePath,
                });
            }
            throw error;
        }

        if (!(await pathExists(targetVersionPath))) {
            throw new CliUserError("errors.selfUpdate.verifyTargetMissing", 1, {
                path: targetVersionPath,
            });
        }
    }

    return isExecutableDirectoryOnPath(
        options.paths.executableDirectory,
        options.env,
        options.platform,
    );
}

async function cleanupSelfUpdateArtifacts(options: {
    currentVersion: string;
    logger: Logger;
    paths: ReturnType<typeof resolveSelfUpdatePaths>;
    platform: NodeJS.Platform;
    targetVersion: string;
}): Promise<void> {
    await cleanupStagingDirectory(options.paths.stagingDirectory, options.logger);
    await cleanupInstalledVersions(options).catch((error) => {
        options.logger.warn(
            {
                err: error,
            },
            "CLI self-update old-version cleanup failed.",
        );
    });

    if (options.platform === "win32") {
        await cleanupWindowsExecutableBackups(options.paths, options.logger);
    }
}

async function cleanupInstalledVersions(options: {
    currentVersion: string;
    logger: Logger;
    paths: ReturnType<typeof resolveSelfUpdatePaths>;
    platform: NodeJS.Platform;
    targetVersion: string;
}): Promise<void> {
    const protectedVersions = await listActiveVersionLocks({
        locksDirectory: options.paths.locksDirectory,
        platform: options.platform,
    });

    protectedVersions.add(options.currentVersion);
    protectedVersions.add(options.targetVersion);

    const activatedVersion = await readActivatedVersion(
        options.paths,
        options.platform,
    );

    if (activatedVersion !== undefined) {
        protectedVersions.add(activatedVersion);
    }

    const entries = await readDirectoryEntries(options.paths.versionsDirectory);

    await Promise.all(entries
        .filter(entry => !protectedVersions.has(entry))
        .map(entry =>
            removePathBestEffort(join(options.paths.versionsDirectory, entry)),
        ));
}

async function readActivatedVersion(
    paths: ReturnType<typeof resolveSelfUpdatePaths>,
    platform: NodeJS.Platform,
): Promise<string | undefined> {
    if (!(await pathExists(paths.executablePath)) || platform === "win32") {
        return undefined;
    }

    let linkedTarget: string;

    try {
        linkedTarget = await readlink(paths.executablePath);
    }
    catch {
        return undefined;
    }

    const [resolvedLinkedTarget, resolvedVersionsDirectory] = await Promise.all([
        realpath(
            isAbsolute(linkedTarget)
                ? linkedTarget
                : join(dirname(paths.executablePath), linkedTarget),
        ).then(normalize),
        realpath(paths.versionsDirectory).then(normalize),
    ]);
    const activatedVersionPath = relative(
        resolvedVersionsDirectory,
        resolvedLinkedTarget,
    );

    if (
        activatedVersionPath === ""
        || activatedVersionPath === ".."
        || activatedVersionPath.startsWith(`..${sep}`)
        || isAbsolute(activatedVersionPath)
    ) {
        return undefined;
    }

    return activatedVersionPath;
}

async function cleanupStagingDirectory(
    stagingDirectory: string,
    logger: Logger,
): Promise<void> {
    const entries = await readDirectoryEntries(stagingDirectory);

    await Promise.all(entries.map(entry =>
        removePathBestEffort(join(stagingDirectory, entry)),
    ));

    logger.debug(
        {
            stagingDirectory,
        },
        "CLI self-update staging cleanup completed.",
    );
}

async function cleanupWindowsExecutableBackups(
    paths: Pick<ReturnType<typeof resolveSelfUpdatePaths>, "executableDirectory" | "executablePath">,
    logger: Logger,
): Promise<void> {
    const entries = await readDirectoryEntries(paths.executableDirectory);
    const backupPrefix = `${basename(paths.executablePath)}.old.`;

    await Promise.all(entries
        .filter(entry => entry.startsWith(backupPrefix))
        .map(entry =>
            removePathBestEffort(join(paths.executableDirectory, entry)),
        ));

    logger.debug(
        {
            executableDirectory: paths.executableDirectory,
        },
        "CLI self-update executable-backup cleanup completed.",
    );
}

function isExecutableDirectoryOnPath(
    executableDirectory: string,
    env: Record<string, string | undefined>,
    platform: NodeJS.Platform,
): boolean {
    const pathValue = platform === "win32"
        ? env.Path ?? env.PATH
        : env.PATH;

    if (!pathValue) {
        return false;
    }

    const normalizedExecutableDirectory = normalizePathForComparison(
        executableDirectory,
        platform,
    );

    return pathValue
        .split(delimiter)
        .some(segment =>
            normalizePathForComparison(segment, platform)
            === normalizedExecutableDirectory,
        );
}

function normalizePathForComparison(
    value: string,
    platform: NodeJS.Platform,
): string {
    const resolvedValue = normalize(
        isAbsolute(value) ? value : resolvePath(value),
    );

    return platform === "win32"
        ? resolvedValue.toLowerCase()
        : resolvedValue;
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

async function removePathBestEffort(path: string): Promise<void> {
    await rm(path, {
        force: true,
        recursive: true,
    }).catch(() => {});
}

function validateSelfUpdateTargetVersionOrThrow(version: string): void {
    if (isSemver(version)) {
        return;
    }

    throw new CliUserError("errors.selfUpdate.invalidTargetVersion", 2, {
        version,
    });
}

class BinaryDownloadStalledError extends Error {
    constructor() {
        super("Binary download stalled.");
        this.name = "BinaryDownloadStalledError";
    }
}
