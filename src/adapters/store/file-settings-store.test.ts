import type { CliUserError } from "../../application/contracts/cli.ts";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { describe, expect, test } from "bun:test";
import {
    createLogCapture,
    createTemporaryDirectory,
    defaultSettingsFileContent,
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
            defaultSettingsFileContent,
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
            createExpectedSettingsFileContent([
                "lang = \"zh\"",
            ]),
        );
        expect(await store.read()).toEqual({
            lang: "zh",
        });
    });

    test("writes and reads persisted oo skill settings", async () => {
        const root = await createTemporaryDirectory("store-skill-write");
        const store = new FileSettingsStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        await store.write({
            skills: {
                oo: {
                    implicit_invocation: false,
                },
            },
        });

        expect(await readFile(store.getFilePath(), "utf8")).toBe(
            createExpectedSettingsFileContent([
                "[skills.oo]",
                "implicit_invocation = false",
            ]),
        );
        expect(await store.read()).toEqual({
            skills: {
                oo: {
                    implicit_invocation: false,
                },
            },
        });
    });

    test("writes and reads persisted oo-find-skills settings", async () => {
        const root = await createTemporaryDirectory("store-find-skills-write");
        const store = new FileSettingsStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        await store.write({
            skills: {
                "oo-find-skills": {
                    implicit_invocation: false,
                },
            },
        });

        expect(await readFile(store.getFilePath(), "utf8")).toBe(
            createExpectedSettingsFileContent([
                "[skills.oo-find-skills]",
                "implicit_invocation = false",
            ]),
        );
        expect(await store.read()).toEqual({
            skills: {
                "oo-find-skills": {
                    implicit_invocation: false,
                },
            },
        });
    });

    test("writes and reads the persisted file download output directory", async () => {
        const root = await createTemporaryDirectory("store-file-download-write");
        const store = new FileSettingsStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        await store.write({
            file: {
                download: {
                    out_dir: "~/Downloads",
                },
            },
        });

        expect(await readFile(store.getFilePath(), "utf8")).toBe(
            createExpectedSettingsFileContent([
                "[file.download]",
                "out_dir = \"~/Downloads\"",
            ]),
        );
        expect(await store.read()).toEqual({
            file: {
                download: {
                    out_dir: "~/Downloads",
                },
            },
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
            defaultSettingsFileContent,
        );
    });

    test("ignores unknown settings keys and logs a warning", async () => {
        const root = await createTemporaryDirectory("store-toml");
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

        await mkdir(dirname(store.getFilePath()), { recursive: true });
        await writeFile(
            store.getFilePath(),
            [
                "lang = \"zh\"",
                "updateNotifier = false",
                "",
                "[skills.oo-find-skills]",
                "implicit_invocation = false",
                "",
                "[skills.oo]",
                "implicit_invocation = false",
                "extra = true",
                "",
            ].join("\n"),
            "utf8",
        );

        await expect(store.read()).resolves.toEqual({
            lang: "zh",
            skills: {
                "oo-find-skills": {
                    implicit_invocation: false,
                },
                "oo": {
                    implicit_invocation: false,
                },
            },
        });

        const logs = logCapture.read();

        expect(logs).toContain(`"level":"warn"`);
        expect(logs).toContain(
            `"msg":"Settings store file contained unknown keys that were ignored."`,
        );
        expect(logs).toContain(`"unknownKeyCount":2`);
        expect(logs).toContain(
            `"unknownKeyPaths":["skills.oo.extra","updateNotifier"]`,
        );

        logCapture.close();
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

    test("rejects invalid known settings even when unknown keys are present", async () => {
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
            "version = 1\nlang = 1\n",
            "utf8",
        );

        await expect(store.read()).rejects.toMatchObject({
            key: "errors.store.invalidSchema",
        } satisfies Partial<CliUserError>);
    });
});

function createExpectedSettingsFileContent(
    persistedLines: string[],
): string {
    if (persistedLines.length === 0) {
        return defaultSettingsFileContent;
    }

    return `${defaultSettingsFileContent}\n${persistedLines.join("\n")}\n`;
}
