import { tmpdir } from "node:os";
import { posix, win32 } from "node:path";
import { resolveHomeDirectory } from "../path/home-directory.ts";

export interface SelfUpdatePaths {
    executableDirectory: string;
    executablePath: string;
    locksDirectory: string;
    platform: NodeJS.Platform;
    stagingDirectory: string;
    versionsDirectory: string;
}

export function resolveSelfUpdatePaths(options: {
    env: Record<string, string | undefined>;
    homeDirectory?: string;
    platform: NodeJS.Platform;
}): SelfUpdatePaths {
    const homeDirectory = resolveHomeDirectory(options.env, options.homeDirectory);
    const pathModule = readPathModule(options.platform);
    const executableDirectory = pathModule.join(homeDirectory, ".local", "bin");
    const executablePath = pathModule.join(
        executableDirectory,
        options.platform === "win32" ? "oo.exe" : "oo",
    );

    switch (options.platform) {
        case "darwin":
            return {
                executableDirectory,
                executablePath,
                locksDirectory: pathModule.join(
                    options.env.TMPDIR ?? tmpdir(),
                    "oo",
                    "locks",
                ),
                platform: options.platform,
                stagingDirectory: pathModule.join(
                    homeDirectory,
                    "Library",
                    "Caches",
                    "oo",
                    "staging",
                ),
                versionsDirectory: pathModule.join(
                    homeDirectory,
                    "Library",
                    "Application Support",
                    "oo",
                    "versions",
                ),
            };
        case "win32": {
            const appDataDirectory = options.env.APPDATA
                ?? pathModule.join(homeDirectory, "AppData", "Roaming");
            const tempDirectory = resolveWindowsTempDirectory(
                options.env,
                homeDirectory,
                pathModule,
            );

            return {
                executableDirectory,
                executablePath,
                locksDirectory: pathModule.join(tempDirectory, "oo", "locks"),
                platform: options.platform,
                stagingDirectory: pathModule.join(tempDirectory, "oo", "staging"),
                versionsDirectory: pathModule.join(appDataDirectory, "oo", "versions"),
            };
        }
        default: {
            const dataDirectory = options.env.XDG_DATA_HOME
                ?? pathModule.join(homeDirectory, ".local", "share");
            const cacheDirectory = options.env.XDG_CACHE_HOME
                ?? pathModule.join(homeDirectory, ".cache");
            const lockRootDirectory = options.env.XDG_RUNTIME_DIR
                ?? options.env.XDG_STATE_HOME
                ?? pathModule.join(homeDirectory, ".local", "state");

            return {
                executableDirectory,
                executablePath,
                locksDirectory: pathModule.join(lockRootDirectory, "oo", "locks"),
                platform: options.platform,
                stagingDirectory: pathModule.join(cacheDirectory, "oo", "staging"),
                versionsDirectory: pathModule.join(dataDirectory, "oo", "versions"),
            };
        }
    }
}

export function resolveSelfUpdateLockFilePath(
    paths: Pick<SelfUpdatePaths, "locksDirectory" | "platform">,
    version: string,
): string {
    return readPathModule(paths.platform).join(
        paths.locksDirectory,
        `${version}.lock`,
    );
}

export function resolveSelfUpdateVersionFilePath(
    paths: Pick<SelfUpdatePaths, "platform" | "versionsDirectory">,
    version: string,
): string {
    return readPathModule(paths.platform).join(
        paths.versionsDirectory,
        version,
    );
}

export function resolveSelfUpdateVersionTempFilePath(options: {
    paths: Pick<SelfUpdatePaths, "platform" | "versionsDirectory">;
    processId: number;
    timestamp: number;
    version: string;
}): string {
    return readPathModule(options.paths.platform).join(
        options.paths.versionsDirectory,
        `${options.version}.tmp.${options.processId}.${options.timestamp}`,
    );
}

export function resolveSelfUpdateStagingBinaryPath(options: {
    paths: Pick<SelfUpdatePaths, "platform" | "stagingDirectory">;
    platform: NodeJS.Platform;
    processId: number;
    timestamp: number;
    version: string;
}): string {
    return readPathModule(options.paths.platform).join(
        options.paths.stagingDirectory,
        `${options.version}.tmp.${options.processId}.${options.timestamp}`,
        options.platform === "win32" ? "oo.exe" : "oo",
    );
}

export function resolveSelfUpdateStagingDirectory(
    stagingBinaryPath: string,
    platform: NodeJS.Platform,
): string {
    return readPathModule(platform).dirname(stagingBinaryPath);
}

function resolveWindowsTempDirectory(
    env: Record<string, string | undefined>,
    homeDirectory: string,
    pathModule: typeof posix | typeof win32,
): string {
    return env.TEMP
        ?? env.TMP
        ?? pathModule.join(homeDirectory, "AppData", "Local", "Temp");
}

export function readPathModule(
    platform: NodeJS.Platform,
): typeof posix | typeof win32 {
    return platform === "win32" ? win32 : posix;
}
