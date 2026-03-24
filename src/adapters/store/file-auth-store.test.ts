import type { CliUserError } from "../../application/contracts/cli.ts";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { describe, expect, test } from "bun:test";
import { createTemporaryDirectory } from "../../../__tests__/helpers.ts";
import { APP_NAME } from "../../application/config/app-config.ts";
import { FileAuthStore } from "./file-auth-store.ts";

describe("FileAuthStore", () => {
    test("returns default auth when the file does not exist", async () => {
        const root = await createTemporaryDirectory("auth-store-missing");
        const store = new FileAuthStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        expect(await store.read()).toEqual({
            auth: [],
            id: "",
        });
        expect(await readFile(store.getFilePath(), "utf8")).toBe("id = \"\"\n");
    });

    test("writes and reads persisted auth accounts", async () => {
        const root = await createTemporaryDirectory("auth-store-write");
        const store = new FileAuthStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        await store.write({
            auth: [
                {
                    apiKey: "secret-1",
                    endpoint: "oomol.com",
                    id: "user-1",
                    name: "Alice",
                },
            ],
            id: "user-1",
        });

        expect(store.getFilePath()).toEndWith("auth.toml");
        expect(await readFile(store.getFilePath(), "utf8")).toBe(
            [
                "id = \"user-1\"",
                "",
                "[[auth]]",
                "id = \"user-1\"",
                "name = \"Alice\"",
                "api_key = \"secret-1\"",
                "endpoint = \"oomol.com\"",
                "",
            ].join("\n"),
        );
        expect(await store.read()).toEqual({
            auth: [
                {
                    apiKey: "secret-1",
                    endpoint: "oomol.com",
                    id: "user-1",
                    name: "Alice",
                },
            ],
            id: "user-1",
        });
    });

    test("reads TOML auth files", async () => {
        const root = await createTemporaryDirectory("auth-store-toml");
        const store = new FileAuthStore({
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
            [
                "id = \"user-2\"",
                "",
                "[[auth]]",
                "id = \"user-2\"",
                "name = \"Bob\"",
                "api_key = \"secret-2\"",
                "endpoint = \"oomol.com\"",
                "",
            ].join("\n"),
            "utf8",
        );

        expect(await store.read()).toEqual({
            auth: [
                {
                    apiKey: "secret-2",
                    endpoint: "oomol.com",
                    id: "user-2",
                    name: "Bob",
                },
            ],
            id: "user-2",
        });
    });

    test("reads legacy TOML auth files with uppercase account ids", async () => {
        const root = await createTemporaryDirectory("auth-store-legacy-toml");
        const store = new FileAuthStore({
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
            [
                "id = \"user-2\"",
                "",
                "[[auth]]",
                "ID = \"user-2\"",
                "name = \"Bob\"",
                "api_key = \"secret-2\"",
                "endpoint = \"oomol.com\"",
                "",
            ].join("\n"),
            "utf8",
        );

        expect(await store.read()).toEqual({
            auth: [
                {
                    apiKey: "secret-2",
                    endpoint: "oomol.com",
                    id: "user-2",
                    name: "Bob",
                },
            ],
            id: "user-2",
        });
    });

    test("rejects invalid TOML auth files", async () => {
        const root = await createTemporaryDirectory("auth-store-invalid-toml");
        const store = new FileAuthStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        await Bun.write(store.getFilePath(), "{");

        await expect(store.read()).rejects.toMatchObject({
            key: "errors.authStore.invalidToml",
        } satisfies Partial<CliUserError>);
    });

    test("rejects unsupported auth schema", async () => {
        const root = await createTemporaryDirectory("auth-store-invalid-schema");
        const store = new FileAuthStore({
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
            [
                "id = \"user-1\"",
                "",
                "[[auth]]",
                "name = \"Alice\"",
                "api_key = \"secret-1\"",
                "endpoint = \"oomol.com\"",
                "",
            ].join("\n"),
            "utf8",
        );

        await expect(store.read()).rejects.toMatchObject({
            key: "errors.authStore.invalidSchema",
        } satisfies Partial<CliUserError>);
    });
});
