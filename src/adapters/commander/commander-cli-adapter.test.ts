import type { CliCatalog, CliExecutionContext } from "../../application/contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
    createNoopFileDownloadSessionStore,
    createNoopFileUploadStore,
    createTextBuffer,
} from "../../../__tests__/helpers.ts";
import { createTranslator } from "../../i18n/translator.ts";
import { CommanderCliAdapter } from "./commander-cli-adapter.ts";

describe("CommanderCliAdapter", () => {
    test("requires inputSchema when a command defines a handler", async () => {
        const adapter = new CommanderCliAdapter();
        const stdout = createTextBuffer();
        const stderr = createTextBuffer();
        const catalog: CliCatalog = {
            commands: [
                {
                    handler: async () => {},
                    name: "demo",
                    summaryKey: "commands.help.summary",
                },
            ],
            descriptionKey: "app.description",
            globalOptions: [],
            name: "oo",
        };

        const exitCode = await adapter.run({
            argv: ["demo"],
            catalog,
            context: createCommanderContext(catalog, stdout.writer, stderr.writer),
        });

        expect(exitCode).toBe(1);
        expect(stderr.read()).toBe(
            "Unexpected error: Command \"demo\" must define inputSchema when handler is provided.\n",
        );
    });

    test("shows help instead of a usage error when missing arguments are configured to do so", async () => {
        const adapter = new CommanderCliAdapter();
        const stdout = createTextBuffer();
        const stderr = createTextBuffer();
        const catalog: CliCatalog = {
            commands: [
                {
                    arguments: [
                        {
                            descriptionKey: "arguments.text",
                            name: "text",
                            required: true,
                        },
                    ],
                    inputSchema: z.object({
                        text: z.string(),
                    }),
                    handler: async () => {},
                    missingArgumentBehavior: "showHelp",
                    name: "demo",
                    summaryKey: "commands.help.summary",
                },
            ],
            descriptionKey: "app.description",
            globalOptions: [],
            name: "oo",
        };

        const exitCode = await adapter.run({
            argv: ["demo"],
            catalog,
            context: createCommanderContext(catalog, stdout.writer, stderr.writer),
        });

        expect(exitCode).toBe(0);
        expect(stdout.read()).toContain("Arguments:");
        expect(stdout.read()).toContain("text");
        expect(stderr.read()).toBe("");
    });

    test("passes collected arguments and options to the handler", async () => {
        const adapter = new CommanderCliAdapter();
        const stdout = createTextBuffer();
        const stderr = createTextBuffer();
        const handledInputs: Array<{ text: string; upper?: boolean }> = [];
        const catalog: CliCatalog = {
            commands: [
                {
                    arguments: [
                        {
                            descriptionKey: "arguments.text",
                            name: "text",
                            required: true,
                        },
                    ],
                    handler: async (input) => {
                        handledInputs.push(input as { text: string; upper?: boolean });
                    },
                    inputSchema: z.object({
                        text: z.string(),
                        upper: z.boolean().optional(),
                    }),
                    name: "demo",
                    options: [
                        {
                            descriptionKey: "options.help",
                            longFlag: "--upper",
                            name: "upper",
                        },
                    ],
                    summaryKey: "commands.help.summary",
                },
            ],
            descriptionKey: "app.description",
            globalOptions: [],
            name: "oo",
        };

        const exitCode = await adapter.run({
            argv: ["demo", "hello", "--upper"],
            catalog,
            context: createCommanderContext(catalog, stdout.writer, stderr.writer),
        });

        expect(exitCode).toBe(0);
        expect(handledInputs).toEqual([
            {
                text: "hello",
                upper: true,
            },
        ]);
    });
});

function createCommanderContext(
    catalog: CliCatalog,
    stdout: CliExecutionContext["stdout"],
    stderr: CliExecutionContext["stderr"],
): CliExecutionContext {
    return {
        authStore: {
            getFilePath() {
                return "";
            },
            read: async () => ({
                auth: [],
                id: "",
            }),
            update: async updater => updater({
                auth: [],
                id: "",
            }),
            write: async auth => auth,
        },
        cacheStore: {
            close() {},
            getCache() {
                return {
                    clear() {},
                    delete() {
                        return false;
                    },
                    get() {
                        return null;
                    },
                    has() {
                        return false;
                    },
                    set() {},
                };
            },
            getFilePath() {
                return "";
            },
        },
        catalog,
        completionRenderer: {
            render() {
                return "";
            },
        },
        currentLogFilePath: "",
        cwd: "/tmp",
        env: {},
        fetcher: async () => new Response(""),
        fileDownloadSessionStore: createNoopFileDownloadSessionStore(),
        fileUploadStore: createNoopFileUploadStore(),
        logger: {} as CliExecutionContext["logger"],
        packageName: "oo",
        settingsStore: {
            getFilePath() {
                return "";
            },
            read: async () => ({
                lang: "en",
            }),
            update: async updater => updater({
                lang: "en",
            }),
            write: async settings => settings,
        },
        stdin: {
            isTTY: false,
            off() {},
            on() {},
        },
        stdout,
        stderr,
        translator: createTranslator("en"),
        version: "0.0.0-development",
    };
}
