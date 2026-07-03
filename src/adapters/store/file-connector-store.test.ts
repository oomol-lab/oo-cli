import type { CliUserError } from "../../application/contracts/cli.ts";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, test } from "bun:test";
import {
    createLogCapture,
    createTemporaryDirectory,
} from "../../../__tests__/helpers.ts";
import { APP_NAME } from "../../application/config/app-config.ts";
import { FileConnectorStore } from "./file-connector-store.ts";

describe("FileConnectorStore", () => {
    test("returns default connector file without creating the file when it does not exist", async () => {
        const root = await createTemporaryDirectory("connector-store-missing");
        const store = new FileConnectorStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        expect(store.getFilePath()).toBe(join(root, APP_NAME, "connector.toml"));
        expect(await store.read()).toEqual({});
        // Unlike the auth store, a missing connector file must NOT be created
        // on read; untouched installations never gain an extra config file.
        expect(await Bun.file(store.getFilePath()).exists()).toBe(false);
    });

    test("reads TOML connector files with url only", async () => {
        const root = await createTemporaryDirectory("connector-store-url-only");
        const store = new FileConnectorStore({
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
                "[self_hosted]",
                "url = \"http://localhost:3000\"",
                "",
            ].join("\n"),
            "utf8",
        );

        expect(await store.read()).toEqual({
            selfHosted: {
                url: "http://localhost:3000",
            },
        });
    });

    test("reads TOML connector files with url and token", async () => {
        const root = await createTemporaryDirectory("connector-store-url-token");
        const store = new FileConnectorStore({
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
                "[self_hosted]",
                "url = \"http://localhost:3000\"",
                "token = \"oct_read-secret\"",
                "",
            ].join("\n"),
            "utf8",
        );

        expect(await store.read()).toEqual({
            selfHosted: {
                token: "oct_read-secret",
                url: "http://localhost:3000",
            },
        });
    });

    test("writes and reads persisted self-hosted connector config", async () => {
        const root = await createTemporaryDirectory("connector-store-write");
        const logCapture = createLogCapture();
        const store = new FileConnectorStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            logger: logCapture.logger,
            platform: "linux",
        });

        const written = await store.write({
            selfHosted: {
                token: "oct_write-secret",
                url: "http://localhost:3000",
            },
        });

        expect(store.getFilePath()).toEndWith("connector.toml");
        expect(await readFile(store.getFilePath(), "utf8")).toBe(
            [
                "[self_hosted]",
                "url = \"http://localhost:3000\"",
                "token = \"oct_write-secret\"",
                "",
            ].join("\n"),
        );
        expect(written).toEqual({
            selfHosted: {
                token: "oct_write-secret",
                url: "http://localhost:3000",
            },
        });
        expect(await store.read()).toEqual({
            selfHosted: {
                token: "oct_write-secret",
                url: "http://localhost:3000",
            },
        });

        const logs = logCapture.read();

        expect(logs).toContain(`"msg":"Connector store write completed."`);
        expect(logs).toContain(`"hasSelfHostedConnector":true`);
        expect(logs).toContain(`"msg":"Connector store read completed."`);
        expect(logs).not.toContain("oct_write-secret");

        logCapture.close();
    });

    test("writes an empty file when no self-hosted connector is configured", async () => {
        const root = await createTemporaryDirectory("connector-store-empty");
        const store = new FileConnectorStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        expect(await store.write({})).toEqual({});
        expect(await readFile(store.getFilePath(), "utf8")).toBe("");
        expect(await store.read()).toEqual({});
    });

    test("update applies the updater to the persisted connector file", async () => {
        const root = await createTemporaryDirectory("connector-store-update");
        const store = new FileConnectorStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        await store.write({
            selfHosted: {
                url: "http://localhost:3000",
            },
        });

        const updated = await store.update(connectorFile => ({
            selfHosted: {
                ...connectorFile.selfHosted,
                token: "oct_update-secret",
                url: connectorFile.selfHosted?.url ?? "http://fallback.invalid",
            },
        }));

        expect(updated).toEqual({
            selfHosted: {
                token: "oct_update-secret",
                url: "http://localhost:3000",
            },
        });
        expect(await store.read()).toEqual({
            selfHosted: {
                token: "oct_update-secret",
                url: "http://localhost:3000",
            },
        });

        expect(await store.update(() => ({}))).toEqual({});
        expect(await readFile(store.getFilePath(), "utf8")).toBe("");
    });

    test("rejects invalid TOML connector files", async () => {
        const root = await createTemporaryDirectory("connector-store-invalid-toml");
        const store = new FileConnectorStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        await Bun.write(store.getFilePath(), "{");

        await expect(store.read()).rejects.toMatchObject({
            key: "errors.connectorStore.invalidToml",
        } satisfies Partial<CliUserError>);
    });

    test("rejects invalid TOML without logging document content", async () => {
        const root = await createTemporaryDirectory("connector-store-toml-leak");
        const logCapture = createLogCapture();
        const store = new FileConnectorStore({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            logger: logCapture.logger,
            platform: "linux",
        });

        await mkdir(dirname(store.getFilePath()), { recursive: true });
        // The parse error message embeds the offending document lines, so a
        // token on the broken line must never reach the log.
        await writeFile(
            store.getFilePath(),
            [
                "[self_hosted]",
                "url = \"http://localhost:3000\"",
                "token = \"oct_toml-secret\" garbage",
                "",
            ].join("\n"),
            "utf8",
        );

        await expect(store.read()).rejects.toMatchObject({
            key: "errors.connectorStore.invalidToml",
        } satisfies Partial<CliUserError>);

        const logs = logCapture.read();

        expect(logs).toContain(
            `"msg":"Connector store file contained invalid TOML."`,
        );
        expect(logs).not.toContain("oct_toml-secret");

        logCapture.close();
    });

    test("rejects connector files with unknown fields", async () => {
        const root = await createTemporaryDirectory("connector-store-unknown-field");
        const store = new FileConnectorStore({
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
                "unknown = \"value\"",
                "",
                "[self_hosted]",
                "url = \"http://localhost:3000\"",
                "",
            ].join("\n"),
            "utf8",
        );

        await expect(store.read()).rejects.toMatchObject({
            key: "errors.connectorStore.invalidSchema",
        } satisfies Partial<CliUserError>);
    });

    test("rejects unsupported connector schema without logging the token", async () => {
        const root = await createTemporaryDirectory("connector-store-invalid-schema");
        const logCapture = createLogCapture();
        const store = new FileConnectorStore({
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
                "[self_hosted]",
                "token = \"oct_schema-secret\"",
                "",
            ].join("\n"),
            "utf8",
        );

        await expect(store.read()).rejects.toMatchObject({
            key: "errors.connectorStore.invalidSchema",
        } satisfies Partial<CliUserError>);

        const logs = logCapture.read();

        expect(logs).toContain(`"level":"error"`);
        expect(logs).toContain(`"category":"system_error"`);
        expect(logs).toContain(
            `"msg":"Connector store file contained an unsupported schema."`,
        );
        expect(logs).toContain(`"issuePaths":["self_hosted.url"]`);
        expect(logs).not.toContain("oct_schema-secret");

        logCapture.close();
    });

    test("resolves an explicit file path", async () => {
        const root = await createTemporaryDirectory("connector-store-file-path");
        const filePath = join(root, "nested", "custom-connector.toml");
        const store = new FileConnectorStore({ filePath });

        expect(store.getFilePath()).toBe(filePath);

        await store.write({
            selfHosted: {
                url: "http://localhost:4000",
            },
        });

        expect(await readFile(filePath, "utf8")).toBe(
            [
                "[self_hosted]",
                "url = \"http://localhost:4000\"",
                "",
            ].join("\n"),
        );
        expect(await store.read()).toEqual({
            selfHosted: {
                url: "http://localhost:4000",
            },
        });
    });
});
