import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { APP_NAME } from "../../application/config/app-config.ts";
import { resolveStorePaths } from "./store-path.ts";

describe("resolveStorePaths", () => {
    test("resolves Linux config and log directories from XDG homes", () => {
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: "/tmp/home",
                XDG_CONFIG_HOME: "/tmp/xdg",
                XDG_STATE_HOME: "/tmp/xdg-state",
            },
            platform: "linux",
        });

        expect(storePaths).toEqual({
            authFilePath: join("/tmp/xdg", APP_NAME, "auth.toml"),
            cacheFilePath: join("/tmp/xdg", APP_NAME, "data", "cache.sqlite"),
            dataDirectory: join("/tmp/xdg", APP_NAME, "data"),
            downloadSessionsDirectoryPath: join(
                "/tmp/xdg",
                APP_NAME,
                "data",
                "download-sessions",
            ),
            legacyDownloadSessionsFilePath: join(
                "/tmp/xdg",
                APP_NAME,
                "data",
                "download-sessions.sqlite",
            ),
            logDirectoryPath: join("/tmp/xdg-state", APP_NAME, "logs"),
            rootDirectory: join("/tmp/xdg", APP_NAME),
            settingsFilePath: join("/tmp/xdg", APP_NAME, "settings.toml"),
            telemetryDirectory: join("/tmp/xdg", APP_NAME, "telemetry"),
            uploadsFilePath: join("/tmp/xdg", APP_NAME, "data", "uploads.sqlite"),
        });
    });

    test("prefers OO_CONFIG_DIR over XDG_CONFIG_HOME for the config root", () => {
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: "/tmp/home",
                OO_CONFIG_DIR: "/tmp/app/config",
                XDG_CONFIG_HOME: "/tmp/xdg",
            },
            platform: "linux",
        });

        expect(storePaths.rootDirectory).toBe("/tmp/app/config");
        expect(storePaths.authFilePath).toBe(
            join("/tmp/app/config", "auth.toml"),
        );
        expect(storePaths.settingsFilePath).toBe(
            join("/tmp/app/config", "settings.toml"),
        );
        expect(storePaths.telemetryDirectory).toBe(
            join("/tmp/app/config", "telemetry"),
        );
        expect(storePaths.dataDirectory).toBe(
            join("/tmp/app/config", "data"),
        );
    });

    test("overrides the data directory with OO_DATA_DIR independently of the config root", () => {
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: "/tmp/home",
                OO_CONFIG_DIR: "/tmp/app/config",
                OO_DATA_DIR: "/tmp/app/data",
            },
            platform: "linux",
        });

        expect(storePaths.rootDirectory).toBe("/tmp/app/config");
        expect(storePaths.dataDirectory).toBe("/tmp/app/data");
        expect(storePaths.cacheFilePath).toBe(
            join("/tmp/app/data", "cache.sqlite"),
        );
        expect(storePaths.uploadsFilePath).toBe(
            join("/tmp/app/data", "uploads.sqlite"),
        );
        expect(storePaths.downloadSessionsDirectoryPath).toBe(
            join("/tmp/app/data", "download-sessions"),
        );
    });

    test("overrides the log directory with OO_LOG_DIR on every platform", () => {
        for (const platform of ["linux", "darwin", "win32"] as const) {
            const storePaths = resolveStorePaths({
                appName: APP_NAME,
                env: {
                    APPDATA: "C:\\Users\\kevin\\AppData\\Roaming",
                    HOME: "/tmp/home",
                    LOCALAPPDATA: "C:\\Users\\kevin\\AppData\\Local",
                    OO_LOG_DIR: "/tmp/app/logs",
                    USERPROFILE: "C:\\Users\\kevin",
                    XDG_STATE_HOME: "/tmp/xdg-state",
                },
                platform,
            });

            expect(storePaths.logDirectoryPath).toBe("/tmp/app/logs");
        }
    });

    test("treats empty OO_CONFIG_DIR/OO_DATA_DIR/OO_LOG_DIR as unset and uses defaults", () => {
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: "/tmp/home",
                OO_CONFIG_DIR: "",
                OO_DATA_DIR: "",
                OO_LOG_DIR: "",
                XDG_CONFIG_HOME: "/tmp/xdg",
                XDG_STATE_HOME: "/tmp/xdg-state",
            },
            platform: "linux",
        });

        expect(storePaths.rootDirectory).toBe(join("/tmp/xdg", APP_NAME));
        expect(storePaths.dataDirectory).toBe(join("/tmp/xdg", APP_NAME, "data"));
        expect(storePaths.logDirectoryPath).toBe(
            join("/tmp/xdg-state", APP_NAME, "logs"),
        );
    });

    test("falls back to the default Linux state directory for logs", () => {
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: "/tmp/home",
            },
            platform: "linux",
        });

        expect(storePaths.logDirectoryPath).toBe(
            join("/tmp/home", ".local", "state", APP_NAME, "logs"),
        );
    });

    test("stores logs in the user Library Logs directory on macOS", () => {
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: "/tmp/home",
            },
            platform: "darwin",
        });

        expect(storePaths.logDirectoryPath).toBe(
            join("/tmp/home", "Library", "Logs", APP_NAME),
        );
    });

    test("stores logs in LocalAppData on Windows", () => {
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                APPDATA: "C:\\Users\\kevin\\AppData\\Roaming",
                HOME: "C:\\Users\\kevin",
                LOCALAPPDATA: "C:\\Users\\kevin\\AppData\\Local",
                USERPROFILE: "C:\\Users\\kevin",
            },
            platform: "win32",
        });

        expect(storePaths.logDirectoryPath).toBe(
            join("C:\\Users\\kevin\\AppData\\Local", APP_NAME, "Logs"),
        );
    });
});
