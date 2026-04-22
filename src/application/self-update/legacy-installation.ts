import type { SelfUpdateCommandRuntime } from "./command-runner.ts";
import type { InstallationDetection, PackageManagerInstallationMethod } from "./installation.ts";
import { realpath } from "node:fs/promises";
import { pathExists } from "../shared/fs-utils.ts";
import { runSelfUpdateCommandWithLogging } from "./command-runner.ts";
import { detectInstallationMethodFromExecPath } from "./installation.ts";
import { readPathModule, resolveSelfUpdatePaths } from "./paths.ts";

const legacyCliPackageName = "@oomol-lab/oo-cli";
const legacyPackageManagerUninstallTimeoutMs = 10_000;

const legacyPackageManagerConfigurations = {
    bun: {
        commandArguments: ["remove", "-g", legacyCliPackageName],
    },
    npm: {
        commandArguments: ["uninstall", "-g", legacyCliPackageName],
    },
    pnpm: {
        commandArguments: ["remove", "-g", legacyCliPackageName],
    },
    yarn: {
        commandArguments: ["global", "remove", legacyCliPackageName],
    },
} as const;

export interface LegacyPackageManagerCleanupRuntime extends SelfUpdateCommandRuntime {
    execPath: string;
    pathExists?: (path: string) => Promise<boolean>;
    platform: NodeJS.Platform;
}

export async function attemptLegacyPackageManagerUninstall(
    runtime: LegacyPackageManagerCleanupRuntime,
): Promise<void> {
    const packageManagers = await resolveLegacyPackageManagersToUninstall(runtime);

    if (packageManagers.length === 0) {
        return;
    }

    for (const packageManager of packageManagers) {
        await runLegacyPackageManagerUninstall(packageManager, runtime);
    }
}

async function resolveLegacyPackageManagersToUninstall(
    runtime: LegacyPackageManagerCleanupRuntime,
): Promise<PackageManagerInstallationMethod[]> {
    const pathResolution = await resolveLegacyPackageManagersFromPath(runtime);

    if (pathResolution.encounteredCandidate) {
        return pathResolution.packageManagers;
    }

    const installation = detectInstallationMethodFromExecPath({
        env: runtime.env,
        execPath: runtime.execPath,
        platform: runtime.platform,
    });

    return installation.method === "native" || installation.method === "unknown"
        ? []
        : [installation.method];
}

async function resolveLegacyPackageManagersFromPath(
    runtime: LegacyPackageManagerCleanupRuntime,
): Promise<{
    encounteredCandidate: boolean;
    packageManagers: PackageManagerInstallationMethod[];
}> {
    const pathValue = runtime.env.PATH?.trim();

    if (pathValue === undefined || pathValue === "") {
        return {
            encounteredCandidate: false,
            packageManagers: [],
        };
    }

    const paths = resolveSelfUpdatePaths({
        env: runtime.env,
        platform: runtime.platform,
    });
    const pathModule = readPathModule(runtime.platform);
    const executableName = pathModule.basename(paths.executablePath);
    const packageManagers: PackageManagerInstallationMethod[] = [];
    const seenPackageManagers = new Set<PackageManagerInstallationMethod>();
    let encounteredCandidate = false;

    for (const directoryPath of splitPathEntries(pathValue, runtime.platform)) {
        const candidatePath = await resolveFirstPathCandidatePath({
            directoryPath,
            executableNames: [executableName],
            pathExists: candidatePath =>
                runtime.pathExists?.(candidatePath)
                ?? pathExists(candidatePath),
            pathModule,
        });

        if (candidatePath === undefined) {
            continue;
        }

        encounteredCandidate = true;
        const installation = await detectInstallationMethodFromPathCandidate({
            candidatePath,
            env: runtime.env,
            platform: runtime.platform,
        });

        if (installation.method === "native" || installation.method === "unknown") {
            continue;
        }

        if (seenPackageManagers.has(installation.method)) {
            continue;
        }

        seenPackageManagers.add(installation.method);
        packageManagers.push(installation.method);
    }

    return {
        encounteredCandidate,
        packageManagers,
    };
}

function splitPathEntries(
    pathValue: string,
    platform: NodeJS.Platform,
): string[] {
    const pathEntries = pathValue
        .split(readPathDelimiter(platform))
        .map(pathEntry => pathEntry.trim())
        .filter(Boolean);

    return pathEntries;
}

function readPathDelimiter(
    platform: NodeJS.Platform,
): string {
    return platform === "win32"
        ? ";"
        : ":";
}

async function resolveFirstPathCandidatePath(options: {
    directoryPath: string;
    executableNames: readonly string[];
    pathExists: (path: string) => Promise<boolean>;
    pathModule: ReturnType<typeof readPathModule>;
}): Promise<string | undefined> {
    for (const executableName of options.executableNames) {
        const candidatePath = options.pathModule.join(options.directoryPath, executableName);

        if (await options.pathExists(candidatePath)) {
            return candidatePath;
        }
    }

    return undefined;
}

async function detectInstallationMethodFromPathCandidate(options: {
    candidatePath: string;
    env: Record<string, string | undefined>;
    platform: NodeJS.Platform;
}): Promise<InstallationDetection> {
    const resolvedCandidatePath = await realpath(options.candidatePath)
        .catch(() => options.candidatePath);
    const resolvedInstallation = detectInstallationMethodFromExecPath({
        env: options.env,
        execPath: resolvedCandidatePath,
        platform: options.platform,
    });

    if (
        resolvedInstallation.method !== "unknown"
        || resolvedCandidatePath === options.candidatePath
    ) {
        return resolvedInstallation;
    }

    return detectInstallationMethodFromExecPath({
        env: options.env,
        execPath: options.candidatePath,
        platform: options.platform,
    });
}

async function runLegacyPackageManagerUninstall(
    packageManager: PackageManagerInstallationMethod,
    runtime: LegacyPackageManagerCleanupRuntime,
): Promise<void> {
    const configuration = legacyPackageManagerConfigurations[packageManager];
    const commandPath = runtime.resolveCommandPath?.(packageManager)
        ?? Bun.which(packageManager);

    if (commandPath === null) {
        runtime.logger.warn(
            {
                packageManager,
            },
            "Legacy package-manager oo-cli uninstall skipped because the executable was not found.",
        );
        return;
    }

    await runSelfUpdateCommandWithLogging({
        commandArguments: configuration.commandArguments,
        commandPath,
        failureMessage: "Legacy package-manager oo-cli uninstall failed.",
        logContext: {
            packageManager,
        },
        runtime,
        successMessage: "Legacy package-manager oo-cli uninstall completed.",
        timeoutMs: legacyPackageManagerUninstallTimeoutMs,
    });
}
