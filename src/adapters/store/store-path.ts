import { join } from "node:path";
import { resolveHomeDirectory } from "../../application/path/home-directory.ts";

export const defaultSettingsFileName = "settings.toml";
export const defaultAuthFileName = "auth.toml";
const defaultCacheFileName = "cache.sqlite";
const defaultDownloadSessionsDirectoryName = "download-sessions";
const defaultLegacyDownloadSessionsFileName = "download-sessions.sqlite";
const defaultUploadsFileName = "uploads.sqlite";
const defaultLogDirectoryName = "logs";
const defaultWindowsLogDirectoryName = "Logs";
const defaultTelemetryDirectoryName = "telemetry";

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
    downloadSessionsDirectoryPath: string;
    legacyDownloadSessionsFilePath: string;
    logDirectoryPath: string;
    rootDirectory: string;
    settingsFilePath: string;
    telemetryDirectory: string;
    uploadsFilePath: string;
}

export function resolveStoreDirectory(
    options: FileStoreLocationOptions,
): string {
    const homeDirectory = resolveHomeDirectory(options.env, options.homeDirectory);
    const appName = options.appName;

    // OO_CONFIG_DIR overrides the config root directly (no app-name segment
    // appended) and takes precedence over XDG_CONFIG_HOME so embedded callers
    // can pin the config root to a private directory.
    if (options.env.OO_CONFIG_DIR) {
        return options.env.OO_CONFIG_DIR;
    }

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

function resolveLogDirectory(
    options: FileStoreLocationOptions,
): string {
    const homeDirectory = resolveHomeDirectory(options.env, options.homeDirectory);
    const appName = options.appName;

    // OO_LOG_DIR overrides the log directory directly and takes precedence over
    // every platform-specific default.
    if (options.env.OO_LOG_DIR) {
        return options.env.OO_LOG_DIR;
    }

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
    // OO_DATA_DIR overrides the data directory directly; otherwise it follows the
    // config root, preserving the historical `<root>/data` layout.
    const dataDirectory = options.env.OO_DATA_DIR || join(rootDirectory, "data");

    return {
        authFilePath: join(rootDirectory, defaultAuthFileName),
        cacheFilePath: join(dataDirectory, defaultCacheFileName),
        dataDirectory,
        downloadSessionsDirectoryPath: join(dataDirectory, defaultDownloadSessionsDirectoryName),
        legacyDownloadSessionsFilePath: join(
            dataDirectory,
            defaultLegacyDownloadSessionsFileName,
        ),
        logDirectoryPath: resolveLogDirectory(options),
        rootDirectory,
        settingsFilePath: join(rootDirectory, defaultSettingsFileName),
        telemetryDirectory: join(rootDirectory, defaultTelemetryDirectoryName),
        uploadsFilePath: join(dataDirectory, defaultUploadsFileName),
    };
}
