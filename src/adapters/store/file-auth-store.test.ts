import type { CliUserError } from "../../application/contracts/cli.ts";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { describe, expect, test } from "bun:test";
import {
    createLogCapture,
    createTemporaryDirectory,
} from "../../../__tests__/helpers.ts";
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

    test("readTolerant returns empty auth without creating a missing file", async () => {
        const root = await createTemporaryDirectory("auth-store-tolerant-missing");
        const store = new FileAuthStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        expect(await store.readTolerant()).toEqual({
            auth: [],
            id: "",
        });
        // Unlike read(), this must leave no file behind.
        expect(await Bun.file(store.getFilePath()).exists()).toBeFalse();
    });

    test("readTolerant returns empty auth for a corrupt file without rewriting it", async () => {
        const root = await createTemporaryDirectory("auth-store-tolerant-corrupt");
        const store = new FileAuthStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });
        const corruptContent = "id = \"acct-1\"\nnot valid [ toml\n";

        await mkdir(dirname(store.getFilePath()), { recursive: true });
        await writeFile(store.getFilePath(), corruptContent);

        expect(await store.readTolerant()).toEqual({
            auth: [],
            id: "",
        });
        expect(await readFile(store.getFilePath(), "utf8")).toBe(corruptContent);
        // read() must still surface the corruption to callers that need the file.
        await expect(store.read()).rejects.toMatchObject({
            key: "errors.authStore.invalidToml",
        } satisfies Partial<CliUserError>);
    });

    test("readTolerant returns persisted accounts when the file is valid", async () => {
        const root = await createTemporaryDirectory("auth-store-tolerant-valid");
        const store = new FileAuthStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });
        const authFile = {
            auth: [
                {
                    apiKey: "secret-1",
                    endpoint: "oomol.com",
                    id: "user-1",
                    name: "Alice",
                },
            ],
            id: "user-1",
        };

        await store.write(authFile);

        expect(await store.readTolerant()).toEqual(authFile);
    });

    test("readTolerant does not hand out a shared mutable default", async () => {
        const root = await createTemporaryDirectory("auth-store-tolerant-isolation");
        const store = new FileAuthStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        const first = await store.readTolerant();

        first.auth.push({
            apiKey: "secret-1",
            endpoint: "oomol.com",
            id: "user-1",
            name: "Alice",
        });
        first.id = "user-1";

        expect(await store.readTolerant()).toEqual({
            auth: [],
            id: "",
        });
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
        const logCapture = createLogCapture();
        const store = new FileAuthStore({
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

        const logs = logCapture.read();

        expect(logs).toContain(`"level":"error"`);
        expect(logs).toContain(`"category":"system_error"`);
        expect(logs).toContain(
            `"msg":"Auth store file contained an unsupported schema."`,
        );
        expect(logs).toContain(`"issuePaths":["auth.0"]`);
        expect(logs).not.toContain("secret-1");

        logCapture.close();
    });
});
