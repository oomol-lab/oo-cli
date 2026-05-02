import type { SelfUpdateCommandRuntime } from "./command-runner.ts";
import type { InstallationDetection, PackageManagerInstallationMethod } from "./installation.ts";
import { realpath } from "node:fs/promises";
import { resolveCommandPathCandidates } from "./command-path.ts";
import { runSelfUpdateCommandWithLogging } from "./command-runner.ts";
import { detectInstallationMethodFromExecPath } from "./installation.ts";
import { readPathModule, resolveSelfUpdatePaths } from "./paths.ts";

const legacyCliPackageName = "@oomol-lab/oo-cli";
const legacyPackageManagerUninstallTimeoutMs = 10_000;

const legacyPackageManagerConfigurations = {
    bun: {
        createCommandArguments: () => ["remove", "-g", legacyCliPackageName],
    },
    npm: {
        createCommandArguments: (target: LegacyPackageManagerUninstallTarget) => [
            "uninstall",
            "-g",
            ...(target.prefix === undefined ? [] : ["--prefix", target.prefix]),
            legacyCliPackageName,
        ],
    },
    pnpm: {
        createCommandArguments: () => ["remove", "-g", legacyCliPackageName],
    },
    yarn: {
        createCommandArguments: () => ["global", "remove", legacyCliPackageName],
    },
} as const;

interface LegacyPackageManagerUninstallTarget {
    method: PackageManagerInstallationMethod;
    prefix?: string;
}

export interface LegacyPackageManagerCleanupRuntime extends SelfUpdateCommandRuntime {
    execPath: string;
    pathExists?: (path: string) => Promise<boolean>;
    platform: NodeJS.Platform;
}

export async function attemptLegacyPackageManagerUninstall(
    runtime: LegacyPackageManagerCleanupRuntime,
): Promise<void> {
    const targets = await resolveLegacyPackageManagersToUninstall(runtime);

    if (targets.length === 0) {
        return;
    }

    for (const target of targets) {
        await runLegacyPackageManagerUninstall(target, runtime);
    }
}

async function resolveLegacyPackageManagersToUninstall(
    runtime: LegacyPackageManagerCleanupRuntime,
): Promise<LegacyPackageManagerUninstallTarget[]> {
    const pathResolution = await resolveLegacyPackageManagersFromPath(runtime);

    if (pathResolution.encounteredCandidate) {
        return pathResolution.targets;
    }

    const installation = detectInstallationMethodFromExecPath({
        env: runtime.env,
        execPath: runtime.execPath,
        platform: runtime.platform,
    });

    return installation.method === "native" || installation.method === "unknown"
        ? []
        : [{
                method: installation.method,
                prefix: resolvePackageManagerPrefix({
                    installation,
                    platform: runtime.platform,
                    resolvedPath: runtime.execPath,
                }),
            }];
}

async function resolveLegacyPackageManagersFromPath(
    runtime: LegacyPackageManagerCleanupRuntime,
): Promise<{
    encounteredCandidate: boolean;
    targets: LegacyPackageManagerUninstallTarget[];
}> {
    const paths = resolveSelfUpdatePaths({
        env: runtime.env,
        platform: runtime.platform,
    });
    const pathModule = readPathModule(runtime.platform);
    const executableName = pathModule.basename(paths.executablePath);
    const targets: LegacyPackageManagerUninstallTarget[] = [];
    const seenTargets = new Set<string>();
    const candidates = await resolveCommandPathCandidates({
        env: runtime.env,
        executableNames: [executableName],
        pathExists: runtime.pathExists,
        platform: runtime.platform,
    });

    for (const candidate of candidates) {
        const installation = await detectInstallationMethodFromPathCandidate({
            candidatePath: candidate.path,
            env: runtime.env,
            platform: runtime.platform,
        });

        if (installation.method === "native" || installation.method === "unknown") {
            continue;
        }

        const target = {
            method: installation.method,
            prefix: resolvePackageManagerPrefix({
                candidateDirectoryPath: candidate.directoryPath,
                installation,
                platform: runtime.platform,
                resolvedPath: installation.resolvedPath,
            }),
        };
        const targetKey = createLegacyPackageManagerTargetKey(target);

        if (seenTargets.has(targetKey)) {
            continue;
        }

        seenTargets.add(targetKey);
        targets.push(target);
    }

    return {
        encounteredCandidate: candidates.length > 0,
        targets,
    };
}

async function detectInstallationMethodFromPathCandidate(options: {
    candidatePath: string;
    env: Record<string, string | undefined>;
    platform: NodeJS.Platform;
}): Promise<InstallationDetection & { resolvedPath: string }> {
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
        return {
            ...resolvedInstallation,
            resolvedPath: resolvedCandidatePath,
        };
    }

    return {
        ...detectInstallationMethodFromExecPath({
            env: options.env,
            execPath: options.candidatePath,
            platform: options.platform,
        }),
        resolvedPath: options.candidatePath,
    };
}

function resolvePackageManagerPrefix(options: {
    candidateDirectoryPath?: string;
    installation: InstallationDetection;
    platform: NodeJS.Platform;
    resolvedPath: string;
}): string | undefined {
    if (options.installation.method !== "npm") {
        return undefined;
    }

    return resolveNpmGlobalPrefixFromInstallPath(
        options.resolvedPath,
        options.platform,
    ) ?? (
        options.candidateDirectoryPath === undefined
            ? undefined
            : resolveNpmGlobalPrefixFromBinDirectory(
                    options.candidateDirectoryPath,
                    options.platform,
                )
    );
}

function resolveNpmGlobalPrefixFromInstallPath(
    rawPath: string,
    platform: NodeJS.Platform,
): string | undefined {
    const pathModule = readPathModule(platform);
    const pathParts = splitAbsolutePath(rawPath, platform);
    const normalizedSegments = pathParts.segments.map(segment =>
        segment.toLowerCase(),
    );
    const nodeModulesIndex = normalizedSegments.lastIndexOf("node_modules");

    if (nodeModulesIndex < 0) {
        return undefined;
    }

    const prefixEndIndex = normalizedSegments[nodeModulesIndex - 1] === "lib"
        ? nodeModulesIndex - 1
        : nodeModulesIndex;

    if (prefixEndIndex <= 0) {
        return undefined;
    }

    return pathModule.join(
        pathParts.root,
        ...pathParts.segments.slice(0, prefixEndIndex),
    );
}

function resolveNpmGlobalPrefixFromBinDirectory(
    rawPath: string,
    platform: NodeJS.Platform,
): string | undefined {
    const pathModule = readPathModule(platform);
    const pathParts = splitAbsolutePath(rawPath, platform);
    const finalSegment = pathParts.segments.at(-1);

    if (finalSegment?.toLowerCase() !== "bin") {
        return undefined;
    }

    const prefixSegments = pathParts.segments.slice(0, -1);

    if (prefixSegments.length === 0) {
        return undefined;
    }

    return pathModule.join(pathParts.root, ...prefixSegments);
}

function splitAbsolutePath(
    rawPath: string,
    platform: NodeJS.Platform,
): {
    root: string;
    segments: string[];
} {
    const pathModule = readPathModule(platform);
    const normalizedPath = pathModule.normalize(rawPath);
    const root = pathModule.parse(normalizedPath).root;
    const relativePath = pathModule.relative(root, normalizedPath);

    return {
        root,
        segments: relativePath === ""
            ? []
            : relativePath.split(pathModule.sep).filter(Boolean),
    };
}

function createLegacyPackageManagerTargetKey(
    target: LegacyPackageManagerUninstallTarget,
): string {
    return `${target.method}\0${target.prefix ?? ""}`;
}

async function runLegacyPackageManagerUninstall(
    target: LegacyPackageManagerUninstallTarget,
    runtime: LegacyPackageManagerCleanupRuntime,
): Promise<void> {
    const configuration = legacyPackageManagerConfigurations[target.method];
    const commandPath = runtime.resolveCommandPath?.(target.method)
        ?? Bun.which(target.method);

    if (commandPath === null) {
        runtime.logger.warn(
            {
                packageManager: target.method,
            },
            "Legacy package-manager oo-cli uninstall skipped because the executable was not found.",
        );
        return;
    }

    await runSelfUpdateCommandWithLogging({
        commandArguments: configuration.createCommandArguments(target),
        commandPath,
        failureMessage: "Legacy package-manager oo-cli uninstall failed.",
        logContext: {
            packageManager: target.method,
            prefix: target.prefix,
        },
        runtime,
        successMessage: "Legacy package-manager oo-cli uninstall completed.",
        timeoutMs: legacyPackageManagerUninstallTimeoutMs,
    });
}
