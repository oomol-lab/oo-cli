import { join } from "node:path";
import { resolveHomeDirectory } from "../../application/path/home-directory.ts";

export const defaultSettingsFileName = "settings.toml";
export const defaultAuthFileName = "auth.toml";
const defaultCacheFileName = "cache.sqlite";
const defaultDownloadSessionsFileName = "download-sessions.sqlite";
const defaultUploadsFileName = "uploads.sqlite";
const defaultLogDirectoryName = "logs";
const defaultWindowsLogDirectoryName = "Logs";

export interface FileStoreLocationOptions {
    appName: string;
    env: Record<string, string | undefined>;
    platform: NodeJS.Platform;
    homeDirectory?: string;
}

export interface StorePaths {
    authFilePath: string;
    cacheFilePath: string;
    dataDirectory: string;
    downloadSessionsFilePath: string;
    logDirectoryPath: string;
    rootDirectory: string;
    settingsFilePath: string;
    uploadsFilePath: string;
}

export function resolveStoreDirectory(
    options: FileStoreLocationOptions,
): string {
    const homeDirectory = resolveHomeDirectory(options.env, options.homeDirectory);
    const appName = options.appName;

    if (options.env.XDG_CONFIG_HOME) {
        return join(options.env.XDG_CONFIG_HOME, appName);
    }

    if (options.platform === "darwin") {
        return join(homeDirectory, "Library", "Application Support", appName);
    }

    if (options.platform === "win32") {
        const appDataDirectory
            = options.env.APPDATA
                ?? join(homeDirectory, "AppData", "Roaming");

        return join(appDataDirectory, appName);
    }

    return join(homeDirectory, ".config", appName);
}

export function resolveLogDirectory(
    options: FileStoreLocationOptions,
): string {
    const homeDirectory = resolveHomeDirectory(options.env, options.homeDirectory);
    const appName = options.appName;

    if (options.platform === "darwin") {
        return join(homeDirectory, "Library", "Logs", appName);
    }

    if (options.platform === "win32") {
        const localAppDataDirectory
            = options.env.LOCALAPPDATA
                ?? join(homeDirectory, "AppData", "Local");

        return join(localAppDataDirectory, appName, defaultWindowsLogDirectoryName);
    }

    const stateDirectory
        = options.env.XDG_STATE_HOME
            ?? join(homeDirectory, ".local", "state");

    return join(stateDirectory, appName, defaultLogDirectoryName);
}

export function resolveStorePaths(
    options: FileStoreLocationOptions,
): StorePaths {
    const rootDirectory = resolveStoreDirectory(options);
    const dataDirectory = join(rootDirectory, "data");

    return {
        authFilePath: join(rootDirectory, defaultAuthFileName),
        cacheFilePath: join(dataDirectory, defaultCacheFileName),
        dataDirectory,
        downloadSessionsFilePath: join(dataDirectory, defaultDownloadSessionsFileName),
        logDirectoryPath: resolveLogDirectory(options),
        rootDirectory,
        settingsFilePath: join(rootDirectory, defaultSettingsFileName),
        uploadsFilePath: join(dataDirectory, defaultUploadsFileName),
    };
}
