import { homedir } from "node:os";
import { join } from "node:path";

const defaultSettingsFileName = "settings.toml";
const defaultAuthFileName = "auth.toml";
const defaultCacheFileName = "cache.sqlite";
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
    logDirectoryPath: string;
    rootDirectory: string;
    settingsFilePath: string;
}

export function resolveHomeDirectory(
    env: Record<string, string | undefined>,
    explicitHomeDirectory?: string,
): string {
    return explicitHomeDirectory
        ?? env.HOME
        ?? env.USERPROFILE
        ?? homedir();
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
        logDirectoryPath: resolveLogDirectory(options),
        rootDirectory,
        settingsFilePath: join(rootDirectory, defaultSettingsFileName),
    };
}
