import { join } from "node:path";
import { resolveHomeDirectory } from "../../application/path/home-directory.ts";

export const defaultSettingsFileName = "settings.toml";
export const defaultAuthFileName = "auth.toml";
export const defaultConnectorFileName = "connector.toml";
const defaultDatabaseFileName = "oo.sqlite";
const defaultDownloadSessionsDirectoryName = "download-sessions";
// SQLite files written by releases that kept one database per store. Their
// contents are disposable and are never migrated.
const legacyDataSqliteFileNames = [
    "cache.sqlite",
    "download-sessions.sqlite",
    "uploads.sqlite",
];
const legacyTelemetrySqliteFileName = "telemetry.sqlite";
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
    connectorFilePath: string;
    dataDirectory: string;
    databaseFilePath: string;
    downloadSessionsDirectoryPath: string;
    legacySqliteFilePaths: string[];
    logDirectoryPath: string;
    rootDirectory: string;
    settingsFilePath: string;
    telemetryDirectory: string;
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
    const telemetryDirectory = join(rootDirectory, defaultTelemetryDirectoryName);

    return {
        authFilePath: join(rootDirectory, defaultAuthFileName),
        connectorFilePath: join(rootDirectory, defaultConnectorFileName),
        dataDirectory,
        // The only SQLite file: every sqlite-backed store lives in it, so
        // OO_DATA_DIR alone decides where SQLite data is written.
        databaseFilePath: join(dataDirectory, defaultDatabaseFileName),
        downloadSessionsDirectoryPath: join(dataDirectory, defaultDownloadSessionsDirectoryName),
        legacySqliteFilePaths: [
            ...legacyDataSqliteFileNames.map(fileName => join(dataDirectory, fileName)),
            join(telemetryDirectory, legacyTelemetrySqliteFileName),
        ],
        logDirectoryPath: resolveLogDirectory(options),
        rootDirectory,
        settingsFilePath: join(rootDirectory, defaultSettingsFileName),
        telemetryDirectory,
    };
}
