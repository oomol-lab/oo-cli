import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
    readLatestLogContent,
    writeAuthFile,
} from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";
import { readTelemetryRowsForTest } from "../../telemetry/outbox.ts";

describe("llm CLI", () => {
    test("prints current LLM client config as json", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["llm", "config", "--json"], {
                fetcher: async () => {
                    throw new Error("llm config should not make network requests");
                },
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(JSON.parse(result.stdout)).toEqual({
                apiKey: "secret-1",
                baseUrl: "https://llm.oomol.com/",
                model: "oomol-chat",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("derives the LLM base URL from the active account endpoint", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox, {
                accounts: [
                    {
                        apiKey: "secret-2",
                        endpoint: "staging.oomol.test",
                        id: "user-2",
                        name: "Bob",
                    },
                ],
            });

            const jsonAliasResult = await sandbox.run(["llm", "config", "--json"]);
            const jsonFormatResult = await sandbox.run([
                "llm",
                "config",
                "--format=json",
            ]);

            expect(JSON.parse(jsonAliasResult.stdout)).toEqual({
                apiKey: "secret-2",
                baseUrl: "https://llm.staging.oomol.test/",
                model: "oomol-chat",
            });
            expect(JSON.parse(jsonFormatResult.stdout)).toEqual({
                apiKey: "secret-2",
                baseUrl: "https://llm.staging.oomol.test/",
                model: "oomol-chat",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not log or emit telemetry when printing LLM config", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["llm", "config", "--json"]);
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(content).not.toContain("secret-1");
            expect(readTelemetryRowsForTest(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
            )).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("requires login before printing LLM config", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["llm", "config", "--json"]);

            expect(createCliSnapshot(result)).toEqual({
                exitCode: 1,
                stderr: "You must log in before using this command.\n",
                stdout: "",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("validates the LLM config format option", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["llm", "config", "--format=yaml"]);

            expect(createCliSnapshot(result)).toEqual({
                exitCode: 2,
                stderr: "Invalid format: yaml. Use json.\n",
                stdout: "",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
