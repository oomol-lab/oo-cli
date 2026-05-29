import type { Logger } from "pino";
import type { SkillMetadata } from "../commands/skills/skill-metadata.ts";

import type { InstallationMethod } from "./installation.ts";
import type { SelfUpdatePaths } from "./paths.ts";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveStorePaths } from "../../adapters/store/store-path.ts";
import {
    canonicalBundledSkillsDirectoryName,
    codexSkillsDirectoryName,
} from "../commands/skills/bundled-skill-paths.ts";
import { resolveAvailableManagedSkillHosts } from "../commands/skills/managed-skill-hosts.ts";
import {
    listManagedSkillInstallations,
    listManagedSkillInstallationsForHosts,
} from "../commands/skills/managed-skill-listings.ts";
import {
    resolveManagedSkillCanonicalRootDirectoryPath,
} from "../commands/skills/managed-skill-paths.ts";
import {
    presetSkillPackageNames,
} from "../commands/skills/preset-packages.ts";
import { APP_NAME } from "../config/app-config.ts";
import { pathExists } from "../shared/fs-utils.ts";
import { detectInstallationMethodFromExecPath } from "./installation.ts";
import { findAnyActiveVersionOwner } from "./lock.ts";
import { resolveSelfUpdatePaths } from "./paths.ts";

export type UninstallItemCategory
    = | "binary"
        | "versions"
        | "staging"
        | "locks"
        | "bundled-skill"
        | "registry-skill"
        | "user-data";

export interface UninstallPlanItem {
    category: UninstallItemCategory;
    label: string;
    path: string;
}

export interface UninstallRetainedSkill {
    path: string;
    reason: "registry" | "local" | "unmanaged";
}

export interface UninstallPlan {
    /**
     * Items whose removal must be deferred to a post-exit helper (the Windows
     * running image cannot unlink itself in-process). Membership in this array,
     * not a per-item flag, is what marks an item as deferred.
     */
    deferred: UninstallPlanItem[];
    /**
     * Directory for the post-exit Windows cleanup helper. It is deliberately
     * NOT one of the removed plan paths, so writing the helper there cannot
     * recreate a directory we just deleted.
     */
    helperDirectory?: string;
    immediate: UninstallPlanItem[];
    installationMethod: InstallationMethod;
    platform: NodeJS.Platform;
    purge: boolean;
    retainedSkills: UninstallRetainedSkill[];
}

export interface BuildUninstallPlanOptions {
    env: Record<string, string | undefined>;
    execPath: string;
    homeDirectory?: string;
    platform: NodeJS.Platform;
    purge: boolean;
    version: string;
}

/**
 * Decide whether an oo-managed skill should be removed, based strictly on its
 * `.oo-metadata.json`. Directory names are never trusted: a missing, invalid,
 * or local metadata always means "retain", so a user-authored same-name skill
 * is never deleted.
 */
export function shouldRemoveManagedSkill(
    metadata: SkillMetadata | undefined,
    options: { purge: boolean },
): boolean {
    if (metadata === undefined) {
        return false;
    }

    if (metadata.kind === "bundled") {
        return true;
    }

    if (metadata.kind === "registry") {
        return options.purge
            || (presetSkillPackageNames as readonly string[]).includes(
                metadata.packageName,
            );
    }

    return false;
}

export async function buildSelfUninstallPlan(
    options: BuildUninstallPlanOptions,
): Promise<UninstallPlan> {
    const installationMethod = detectInstallationMethodFromExecPath({
        env: options.env,
        execPath: options.execPath,
        platform: options.platform,
    }).method;
    const isWindows = options.platform === "win32";
    const immediate: UninstallPlanItem[] = [];
    const deferred: UninstallPlanItem[] = [];
    const retainedSkills: UninstallRetainedSkill[] = [];

    const selfUpdatePaths = resolveSelfUpdatePaths({
        env: options.env,
        homeDirectory: options.homeDirectory,
        platform: options.platform,
    });

    // The Windows post-exit helper owns removal of every path the running
    // process holds open — the running image, and under `--purge` the SQLite
    // data directory. Resolve its directory for every Windows plan so any
    // deferred path has a post-exit home. It is a sibling of staging/locks under
    // `<temp|cache>/oo` and is never itself a removed plan path, so writing the
    // helper there cannot recreate a directory we just deleted.
    const helperDirectory = isWindows
        ? join(dirname(selfUpdatePaths.stagingDirectory), "uninstall")
        : undefined;

    if (installationMethod === "native") {
        addRuntimeItems({ deferred, immediate, isWindows, paths: selfUpdatePaths });
    }

    const storePaths = resolveStorePaths({
        appName: APP_NAME,
        env: options.env,
        homeDirectory: options.homeDirectory,
        platform: options.platform,
    });

    await addSkillItems({
        immediate,
        options,
        retainedSkills,
        settingsFilePath: storePaths.settingsFilePath,
    });

    if (options.purge) {
        addUserDataItems({ deferred, immediate, isWindows, storePaths });
    }

    return {
        deferred,
        helperDirectory,
        immediate,
        installationMethod,
        platform: options.platform,
        purge: options.purge,
        retainedSkills,
    };
}

function addRuntimeItems(args: {
    deferred: UninstallPlanItem[];
    immediate: UninstallPlanItem[];
    isWindows: boolean;
    paths: SelfUpdatePaths;
}): void {
    const paths = args.paths;

    // The currently running Windows image (`~/.local/bin/oo.exe`) cannot be
    // unlinked while this process holds it open, so it is deferred to the
    // post-exit helper. Every other runtime path — including the per-version
    // directories — is a standalone copy and is safe to remove in-process on
    // all platforms.
    (args.isWindows ? args.deferred : args.immediate).push({
        category: "binary",
        label: "CLI executable",
        path: paths.executablePath,
    });

    args.immediate.push(
        {
            category: "versions",
            label: "Installed versions",
            path: paths.versionsDirectory,
        },
        {
            category: "staging",
            label: "Self-update staging",
            path: paths.stagingDirectory,
        },
        {
            category: "locks",
            label: "Self-update locks",
            path: paths.locksDirectory,
        },
    );
}

async function addSkillItems(args: {
    immediate: UninstallPlanItem[];
    options: BuildUninstallPlanOptions;
    retainedSkills: UninstallRetainedSkill[];
    settingsFilePath: string;
}): Promise<void> {
    const configDirectory = dirname(args.settingsFilePath);

    // The bundled canonical root (`<config>/skills/bundled`) only ever contains
    // oo-managed bundled canonical sources, so it is always removed wholesale.
    const bundledCanonicalRoot = join(
        configDirectory,
        codexSkillsDirectoryName,
        canonicalBundledSkillsDirectoryName,
    );

    if (await pathExists(bundledCanonicalRoot)) {
        args.immediate.push({
            category: "bundled-skill",
            label: "Bundled skill canonical sources",
            path: bundledCanonicalRoot,
        });
    }

    const registryCanonicalRoot = resolveManagedSkillCanonicalRootDirectoryPath(
        args.settingsFilePath,
    );
    const canonicalRegistrySkills = await listManagedSkillInstallations(
        registryCanonicalRoot,
    );

    for (const skill of canonicalRegistrySkills) {
        classifySkillForRemoval({
            category: "registry-skill",
            immediate: args.immediate,
            metadata: skill.metadata,
            path: skill.path,
            purge: args.options.purge,
            retainedSkills: args.retainedSkills,
        });
    }

    const hosts = await resolveAvailableManagedSkillHosts(args.options.env);
    const hostSkills = await listManagedSkillInstallationsForHosts(hosts);

    for (const skill of hostSkills) {
        classifySkillForRemoval({
            category: skill.metadata?.kind === "registry"
                ? "registry-skill"
                : "bundled-skill",
            immediate: args.immediate,
            metadata: skill.metadata,
            path: skill.path,
            purge: args.options.purge,
            retainedSkills: args.retainedSkills,
        });
    }
}

function classifySkillForRemoval(args: {
    category: UninstallItemCategory;
    immediate: UninstallPlanItem[];
    metadata: SkillMetadata | undefined;
    path: string;
    purge: boolean;
    retainedSkills: UninstallRetainedSkill[];
}): void {
    if (shouldRemoveManagedSkill(args.metadata, { purge: args.purge })) {
        args.immediate.push({
            category: args.category,
            label: args.metadata?.kind === "registry"
                ? "Registry skill"
                : "Bundled skill",
            path: args.path,
        });
        return;
    }

    args.retainedSkills.push({
        path: args.path,
        reason: resolveRetentionReason(args.metadata),
    });
}

function resolveRetentionReason(
    metadata: SkillMetadata | undefined,
): UninstallRetainedSkill["reason"] {
    if (metadata?.kind === "registry") {
        return "registry";
    }

    if (metadata?.kind === "local") {
        return "local";
    }

    return "unmanaged";
}

function addUserDataItems(args: {
    deferred: UninstallPlanItem[];
    immediate: UninstallPlanItem[];
    isWindows: boolean;
    storePaths: ReturnType<typeof resolveStorePaths>;
}): void {
    args.immediate.push(
        {
            category: "user-data",
            label: "Auth credentials",
            path: args.storePaths.authFilePath,
        },
        {
            category: "user-data",
            label: "Settings",
            path: args.storePaths.settingsFilePath,
        },
    );

    // The running process keeps the SQLite databases under the data directory
    // (cache, uploads, download sessions) open. Windows refuses to delete files
    // held open by a live process, so on Windows the data directory is handed to
    // the post-exit helper instead of being removed in-process. On Unix an open
    // file can still be unlinked, so it is removed immediately.
    (args.isWindows ? args.deferred : args.immediate).push({
        category: "user-data",
        label: "Cache and data",
        path: args.storePaths.dataDirectory,
    });

    args.immediate.push(
        {
            category: "user-data",
            label: "Telemetry",
            path: args.storePaths.telemetryDirectory,
        },
        {
            category: "user-data",
            label: "Logs",
            path: args.storePaths.logDirectoryPath,
        },
    );
}

export interface PerformUninstallOptions {
    logger: Logger;
    plan: UninstallPlan;
    processId: number;
    spawnDetached?: (command: readonly string[]) => void;
    timestamp: number;
}

export type PerformUninstallResult
    = | {
        deferredToHelper: boolean;
        failedPaths: string[];
        status: "completed";
    }
    | {
        ownerPid?: number;
        status: "busy";
    };

export async function performSelfUninstall(
    options: PerformUninstallOptions,
): Promise<PerformUninstallResult> {
    const locksItem = options.plan.immediate.find(item => item.category === "locks");

    if (locksItem !== undefined) {
        const owner = await findAnyActiveVersionOwner({
            excludeProcessId: options.processId,
            locksDirectory: locksItem.path,
            platform: options.plan.platform,
        });

        if (owner !== undefined) {
            return {
                ownerPid: owner.ownerPid,
                status: "busy",
            };
        }
    }

    // The Windows running image must be removed by a detached helper after this
    // process exits. Write and spawn that helper FIRST: if spawning fails we
    // throw before any destructive removal, so the install is never left
    // half-removed. The helper only waits on this pid and deletes the deferred
    // paths, so spawning it early is safe — it blocks until we exit.
    const deferredToHelper = options.plan.deferred.length > 0;

    if (deferredToHelper) {
        await spawnWindowsCleanupHelper({
            plan: options.plan,
            processId: options.processId,
            script: createWindowsSelfDeleteScript({
                deferredPaths: options.plan.deferred.map(item => item.path),
                processId: options.processId,
            }),
            spawnDetached: options.spawnDetached,
            timestamp: options.timestamp,
        });
    }

    const failedPaths: string[] = [];

    for (const item of options.plan.immediate) {
        await removePathTrackingFailures(item.path, failedPaths, options.logger);
    }

    if (!deferredToHelper) {
        // Unix: the running binary's inode can be unlinked in-process.
        for (const item of options.plan.deferred) {
            await removePathTrackingFailures(item.path, failedPaths, options.logger);
        }
    }

    return {
        deferredToHelper,
        failedPaths,
        status: "completed",
    };
}

export function createWindowsSelfDeleteScript(options: {
    deferredPaths: readonly string[];
    processId: number;
}): string {
    const removalLines = options.deferredPaths.map(
        path => `Remove-Item -LiteralPath ${quotePowerShellSingle(path)} -Force -Recurse -ErrorAction SilentlyContinue`,
    );

    return [
        "$ErrorActionPreference = 'SilentlyContinue'",
        `Wait-Process -Id ${options.processId} -ErrorAction SilentlyContinue`,
        ...removalLines,
        // The helper removes itself last.
        "Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue",
        "",
    ].join("\n");
}

async function spawnWindowsCleanupHelper(options: {
    plan: UninstallPlan;
    processId: number;
    script: string;
    spawnDetached?: (command: readonly string[]) => void;
    timestamp: number;
}): Promise<void> {
    // The helper directory is deliberately not one of the removed plan paths.
    const helperDirectory = options.plan.helperDirectory
        ?? dirname(options.plan.deferred[0]!.path);
    const helperPath = join(
        helperDirectory,
        `oo-uninstall.${options.processId}.${options.timestamp}.ps1`,
    );

    await mkdir(helperDirectory, { recursive: true });
    await Bun.write(helperPath, options.script);

    const command = [
        "powershell",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        helperPath,
    ];

    if (options.spawnDetached !== undefined) {
        options.spawnDetached(command);
        return;
    }

    const subprocess = Bun.spawn({
        cmd: command,
        detached: true,
        stderr: "ignore",
        stdin: "ignore",
        stdout: "ignore",
        windowsHide: true,
    });

    subprocess.unref();
}

function quotePowerShellSingle(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}

async function removePathTrackingFailures(
    path: string,
    failedPaths: string[],
    logger: Logger,
): Promise<void> {
    try {
        // `force: true` already tolerates a missing path, so any throw here is
        // a real failure (permission denied, busy, read-only fs, ...).
        await rm(path, { force: true, recursive: true });
    }
    catch (error) {
        failedPaths.push(path);
        logger.warn({ err: error, path }, "Uninstall failed to remove a path.");
    }
}
