import { isPathInsideDirectory, isSamePath } from "./path-comparison.ts";
import { resolveSelfUpdatePaths } from "./paths.ts";

export const packageManagerInstallationMethods = [
    "bun",
    "npm",
    "pnpm",
    "yarn",
] as const;

export type PackageManagerInstallationMethod
    = (typeof packageManagerInstallationMethods)[number];
export type InstallationMethod
    = | PackageManagerInstallationMethod
        | "native"
        | "unknown";
export function detectInstallationMethodFromExecPath(options: {
    env: Record<string, string | undefined>;
    execPath: string;
    platform: NodeJS.Platform;
}): InstallationMethod {
    if (isManagedNativeExecutablePath(options)) {
        return "native";
    }

    return detectPackageManagerInstallationMethodFromExecPath(options.execPath)
        ?? "unknown";
}

function detectPackageManagerInstallationMethodFromExecPath(
    rawPath: string,
): PackageManagerInstallationMethod | undefined {
    const pathSegments = splitPathSegments(rawPath);
    const detectedPackageManager = readDetectedPackageManager(pathSegments);

    if (detectedPackageManager !== undefined) {
        return detectedPackageManager;
    }

    if (looksLikePackagedOoExecutablePath(pathSegments)) {
        return "npm";
    }

    return undefined;
}

function looksLikePackagedOoExecutablePath(pathSegments: readonly string[]): boolean {
    const nodeModulesIndex = pathSegments.lastIndexOf("node_modules");

    if (nodeModulesIndex < 0) {
        return false;
    }

    const packageScope = pathSegments[nodeModulesIndex + 1];
    const packageName = pathSegments[nodeModulesIndex + 2];

    if (packageScope !== "@oomol-lab" || packageName === undefined) {
        return false;
    }

    return packageName === "oo-cli" || packageName.startsWith("oo-cli-");
}

function splitPathSegments(rawPath: string): string[] {
    if (rawPath.trim() === "") {
        return [];
    }

    return rawPath
        .trim()
        .replaceAll("\\", "/")
        .split("/")
        .map(segment => segment.trim().toLowerCase())
        .filter(Boolean);
}

const packageManagerPathDetectors: Array<{
    matches: (pathSegments: readonly string[]) => boolean;
    method: PackageManagerInstallationMethod;
}> = [
    {
        matches: pathSegments => pathSegments.includes(".bun"),
        method: "bun",
    },
    {
        matches: pathSegments => pathSegments.includes("pnpm"),
        method: "pnpm",
    },
    {
        matches: pathSegments =>
            pathSegments.includes("fnm_multishells")
            || pathSegments.includes("npm-global")
            || pathSegments.includes("npm_global")
            || pathSegments.includes(".nvm"),
        method: "npm",
    },
    {
        matches: pathSegments => pathSegments.includes("yarn"),
        method: "yarn",
    },
];

function readDetectedPackageManager(
    pathSegments: readonly string[],
): PackageManagerInstallationMethod | undefined {
    for (const detector of packageManagerPathDetectors) {
        if (detector.matches(pathSegments)) {
            return detector.method;
        }
    }

    return undefined;
}

function isManagedNativeExecutablePath(options: {
    env: Record<string, string | undefined>;
    execPath: string;
    platform: NodeJS.Platform;
}): boolean {
    if (options.execPath.trim() === "") {
        return false;
    }

    const paths = resolveSelfUpdatePaths({
        env: options.env,
        platform: options.platform,
    });

    return isSamePath({
        leftPath: options.execPath,
        platform: options.platform,
        rightPath: paths.executablePath,
    }) || isPathInsideDirectory({
        candidatePath: options.execPath,
        directoryPath: paths.versionsDirectory,
        platform: options.platform,
    });
}
