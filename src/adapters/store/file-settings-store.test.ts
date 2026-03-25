import type { CliUserError } from "../../application/contracts/cli.ts";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { describe, expect, test } from "bun:test";
import {
    createLogCapture,
    createTemporaryDirectory,
} from "../../../__tests__/helpers.ts";
import { APP_NAME } from "../../application/config/app-config.ts";
import { FileSettingsStore } from "./file-settings-store.ts";

describe("FileSettingsStore", () => {
    test("returns default settings when the file does not exist", async () => {
        const root = await createTemporaryDirectory("store-missing");
        const store = new FileSettingsStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        expect(await store.read()).toEqual({});
        expect(await readFile(store.getFilePath(), "utf8")).toBe(
            [
                "# lang controls the CLI display language for help text, messages, and errors.",
                "# Supported values: \"en\" (English), \"zh\" (Simplified Chinese).",
                "# Default: auto-detect from LC_ALL, LC_MESSAGES, LANG, then system locale.",
                "# lang = \"en\"",
                "",
            ].join("\n"),
        );
    });

    test("writes and reads persisted settings", async () => {
        const root = await createTemporaryDirectory("store-write");
        const store = new FileSettingsStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        await store.write({
            lang: "zh",
        });

        expect(store.getFilePath()).toEndWith("settings.toml");
        expect(await readFile(store.getFilePath(), "utf8")).toBe(
            [
                "# lang controls the CLI display language for help text, messages, and errors.",
                "# Supported values: \"en\" (English), \"zh\" (Simplified Chinese).",
                "# Default: auto-detect from LC_ALL, LC_MESSAGES, LANG, then system locale.",
                "# lang = \"en\"",
                "",
                "lang = \"zh\"",
                "",
            ].join("\n"),
        );
        expect(await store.read()).toEqual({
            lang: "zh",
        });
    });

    test("writes commented defaults when all persisted settings are removed", async () => {
        const root = await createTemporaryDirectory("store-empty-write");
        const store = new FileSettingsStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        await store.write({});

        expect(await readFile(store.getFilePath(), "utf8")).toBe(
            [
                "# lang controls the CLI display language for help text, messages, and errors.",
                "# Supported values: \"en\" (English), \"zh\" (Simplified Chinese).",
                "# Default: auto-detect from LC_ALL, LC_MESSAGES, LANG, then system locale.",
                "# lang = \"en\"",
                "",
            ].join("\n"),
        );
    });

    test("rejects legacy TOML settings that still include updateNotifier", async () => {
        const root = await createTemporaryDirectory("store-toml");
        const store = new FileSettingsStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        await mkdir(dirname(store.getFilePath()), { recursive: true });
        await writeFile(
            store.getFilePath(),
            "lang = \"zh\"\nupdateNotifier = false\n",
            "utf8",
        );

        await expect(store.read()).rejects.toMatchObject({
            key: "errors.store.invalidSchema",
        } satisfies Partial<CliUserError>);
    });

    test("rejects invalid TOML files", async () => {
        const root = await createTemporaryDirectory("store-invalid-toml");
        const logCapture = createLogCapture();
        const store = new FileSettingsStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            logger: logCapture.logger,
            platform: "linux",
        });

        await Bun.write(store.getFilePath(), "{");

        await expect(store.read()).rejects.toMatchObject({
            key: "errors.store.invalidToml",
        } satisfies Partial<CliUserError>);

        const logs = logCapture.read();

        expect(logs).toContain(`"level":"error"`);
        expect(logs).toContain(`"category":"system_error"`);
        expect(logs).toContain(
            `"msg":"Settings store file contained invalid TOML."`,
        );

        logCapture.close();
    });

    test("rejects legacy settings with a version field", async () => {
        const root = await createTemporaryDirectory("store-invalid-schema");
        const store = new FileSettingsStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        await mkdir(dirname(store.getFilePath()), { recursive: true });
        await writeFile(
            store.getFilePath(),
            "version = 1\nlang = \"zh\"\n",
            "utf8",
        );

        await expect(store.read()).rejects.toMatchObject({
            key: "errors.store.invalidSchema",
        } satisfies Partial<CliUserError>);
    });
});
