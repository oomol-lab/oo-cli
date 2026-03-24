import { describe, expect, test } from "bun:test";

import { APP_NAME } from "../../application/config/app-config.ts";
import { resolveStorePaths } from "./store-path.ts";

describe("resolveStorePaths", () => {
    test("resolves the full storage layout from xdg config home", () => {
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: "/tmp/home",
                XDG_CONFIG_HOME: "/tmp/xdg",
            },
            platform: "linux",
        });

        expect(storePaths).toEqual({
            authFilePath: `/tmp/xdg/${APP_NAME}/auth.toml`,
            cacheFilePath: `/tmp/xdg/${APP_NAME}/data/cache.sqlite`,
            dataDirectory: `/tmp/xdg/${APP_NAME}/data`,
            rootDirectory: `/tmp/xdg/${APP_NAME}`,
            settingsFilePath: `/tmp/xdg/${APP_NAME}/settings.toml`,
        });
    });
});
