import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolveHomeDirectory } from "../path/home-directory.ts";

export interface SelfUpdatePaths {
    executableDirectory: string;
    executablePath: string;
    locksDirectory: string;
    stagingDirectory: string;
    versionsDirectory: string;
}

export function resolveSelfUpdatePaths(options: {
    env: Record<string, string | undefined>;
    homeDirectory?: string;
    platform: NodeJS.Platform;
}): SelfUpdatePaths {
    const homeDirectory = resolveHomeDirectory(options.env, options.homeDirectory);
    const executableDirectory = join(homeDirectory, ".local", "bin");
    const executablePath = join(
        executableDirectory,
        options.platform === "win32" ? "oo.exe" : "oo",
    );

    switch (options.platform) {
        case "darwin":
            return {
                executableDirectory,
                executablePath,
                locksDirectory: join(
                    options.env.TMPDIR ?? tmpdir(),
                    "oo",
                    "locks",
                ),
                stagingDirectory: join(
                    homeDirectory,
                    "Library",
                    "Caches",
                    "oo",
                    "staging",
                ),
                versionsDirectory: join(
                    homeDirectory,
                    "Library",
                    "Application Support",
                    "oo",
                    "versions",
                ),
            };
        case "win32": {
            const appDataDirectory = options.env.APPDATA
                ?? join(homeDirectory, "AppData", "Roaming");
            const tempDirectory = resolveWindowsTempDirectory(
                options.env,
                homeDirectory,
            );

            return {
                executableDirectory,
                executablePath,
                locksDirectory: join(tempDirectory, "oo", "locks"),
                stagingDirectory: join(tempDirectory, "oo", "staging"),
                versionsDirectory: join(appDataDirectory, "oo", "versions"),
            };
        }
        default: {
            const dataDirectory = options.env.XDG_DATA_HOME
                ?? join(homeDirectory, ".local", "share");
            const cacheDirectory = options.env.XDG_CACHE_HOME
                ?? join(homeDirectory, ".cache");
            const lockRootDirectory = options.env.XDG_RUNTIME_DIR
                ?? options.env.XDG_STATE_HOME
                ?? join(homeDirectory, ".local", "state");

            return {
                executableDirectory,
                executablePath,
                locksDirectory: join(lockRootDirectory, "oo", "locks"),
                stagingDirectory: join(cacheDirectory, "oo", "staging"),
                versionsDirectory: join(dataDirectory, "oo", "versions"),
            };
        }
    }
}

export function resolveSelfUpdateLockFilePath(
    paths: Pick<SelfUpdatePaths, "locksDirectory">,
    version: string,
): string {
    return join(paths.locksDirectory, `${version}.lock`);
}

export function resolveSelfUpdateVersionFilePath(
    paths: Pick<SelfUpdatePaths, "versionsDirectory">,
    version: string,
): string {
    return join(paths.versionsDirectory, version);
}

export function resolveSelfUpdateVersionTempFilePath(options: {
    paths: Pick<SelfUpdatePaths, "versionsDirectory">;
    processId: number;
    timestamp: number;
    version: string;
}): string {
    return join(
        options.paths.versionsDirectory,
        `${options.version}.tmp.${options.processId}.${options.timestamp}`,
    );
}

export function resolveSelfUpdateStagingBinaryPath(options: {
    paths: Pick<SelfUpdatePaths, "stagingDirectory">;
    platform: NodeJS.Platform;
    processId: number;
    timestamp: number;
    version: string;
}): string {
    return join(
        options.paths.stagingDirectory,
        `${options.version}.tmp.${options.processId}.${options.timestamp}`,
        options.platform === "win32" ? "oo.exe" : "oo",
    );
}

export function resolveSelfUpdateStagingDirectory(
    stagingBinaryPath: string,
): string {
    return dirname(stagingBinaryPath);
}

function resolveWindowsTempDirectory(
    env: Record<string, string | undefined>,
    homeDirectory: string,
): string {
    return env.TEMP
        ?? env.TMP
        ?? join(homeDirectory, "AppData", "Local", "Temp");
}
