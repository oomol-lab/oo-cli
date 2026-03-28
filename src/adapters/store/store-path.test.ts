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
            downloadSessionsFilePath: join(
                "/tmp/xdg",
                APP_NAME,
                "data",
                "download-sessions.sqlite",
            ),
            logDirectoryPath: join("/tmp/xdg-state", APP_NAME, "logs"),
            rootDirectory: join("/tmp/xdg", APP_NAME),
            settingsFilePath: join("/tmp/xdg", APP_NAME, "settings.toml"),
            uploadsFilePath: join("/tmp/xdg", APP_NAME, "data", "uploads.sqlite"),
        });
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
