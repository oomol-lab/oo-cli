import type { CliCatalog, CliExecutionContext } from "../../application/contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
    createNoopFileDownloadSessionStore,
    createNoopFileUploadStore,
    createTextBuffer,
} from "../../../__tests__/helpers.ts";
import { JSON_OUTPUT_SCHEMA_VERSION } from "../../application/commands/command-output.ts";
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

    test("attaches the shared output options and hands the handler a working output handle", async () => {
        const adapter = new CommanderCliAdapter();
        const stdout = createTextBuffer();
        const stderr = createTextBuffer();
        const observedFormats: string[] = [];
        const catalog: CliCatalog = {
            commands: [
                {
                    handler: (_input, context) => {
                        observedFormats.push(context.output.format);
                        context.output.emit({ ok: true }, () => {
                            context.stdout.write("text\n");
                        });
                    },
                    inputSchema: z.object({}),
                    name: "demo",
                    output: "standard",
                    summaryKey: "commands.help.summary",
                },
            ],
            descriptionKey: "app.description",
            globalOptions: [],
            name: "oo",
        };

        const exitCode = await adapter.run({
            argv: ["demo", "--json", "--show-schema-version"],
            catalog,
            context: createCommanderContext(catalog, stdout.writer, stderr.writer),
        });

        expect(exitCode).toBe(0);
        expect(observedFormats).toEqual(["json"]);
        expect(JSON.parse(stdout.read())).toEqual({
            ok: true,
            schemaVersion: JSON_OUTPUT_SCHEMA_VERSION,
        });
    });

    test("rejects an invalid --format value before the handler runs", async () => {
        const adapter = new CommanderCliAdapter();
        const stdout = createTextBuffer();
        const stderr = createTextBuffer();
        let handlerRan = false;
        const failedEvents: Array<{ errorKey?: string; exitCode: number }> = [];
        const catalog: CliCatalog = {
            commands: [
                {
                    handler: () => {
                        handlerRan = true;
                    },
                    inputSchema: z.object({}),
                    name: "demo",
                    output: "standard",
                    summaryKey: "commands.help.summary",
                },
            ],
            descriptionKey: "app.description",
            globalOptions: [],
            name: "oo",
        };

        const exitCode = await adapter.run({
            argv: ["demo", "--format", "yaml"],
            catalog,
            context: createCommanderContext(catalog, stdout.writer, stderr.writer),
            observer: {
                onCommandFailed: (event) => {
                    failedEvents.push(event);
                },
            },
        });

        expect(exitCode).toBe(2);
        expect(handlerRan).toBe(false);
        expect(failedEvents).toEqual([
            {
                errorKey: "errors.shared.invalidFormat",
                exitCode: 2,
            },
        ]);
    });

    test("reports json output format for json-only commands without flags", async () => {
        const adapter = new CommanderCliAdapter();
        const stdout = createTextBuffer();
        const stderr = createTextBuffer();
        const resolvedFormats: string[] = [];
        const catalog: CliCatalog = {
            commands: [
                {
                    handler: (_input, context) => {
                        context.output.emitJson({ ok: true });
                    },
                    inputSchema: z.object({}),
                    name: "demo",
                    output: "json-only",
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
            observer: {
                onCommandResolved: (event) => {
                    resolvedFormats.push(event.outputFormat);
                },
            },
        });

        expect(exitCode).toBe(0);
        expect(resolvedFormats).toEqual(["json"]);
        expect(stdout.read()).toBe("{\"ok\":true}\n");
    });

    test("maps option alias flags to the primary option name", async () => {
        const adapter = new CommanderCliAdapter();
        const stdout = createTextBuffer();
        const stderr = createTextBuffer();
        const handledInputs: Array<{ data?: string }> = [];
        const catalog: CliCatalog = {
            commands: [
                {
                    handler: (input) => {
                        handledInputs.push(input as { data?: string });
                    },
                    inputSchema: z.object({
                        data: z.string().optional(),
                    }),
                    name: "demo",
                    options: [
                        {
                            aliasFlags: ["--input"],
                            descriptionKey: "options.help",
                            longFlag: "--data",
                            name: "data",
                            valueName: "data",
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
            argv: ["demo", "--input", "{\"value\":1}"],
            catalog,
            context: createCommanderContext(catalog, stdout.writer, stderr.writer),
        });

        expect(exitCode).toBe(0);
        expect(handledInputs).toEqual([
            {
                data: "{\"value\":1}",
            },
        ]);
    });

    test("lists every command alias in the help command list", async () => {
        const adapter = new CommanderCliAdapter();
        const stdout = createTextBuffer();
        const stderr = createTextBuffer();
        const catalog: CliCatalog = {
            commands: [
                {
                    aliases: ["d", "dd", "ddd"],
                    name: "demo",
                    summaryKey: "commands.help.summary",
                },
            ],
            descriptionKey: "app.description",
            globalOptions: [],
            name: "oo",
        };

        const exitCode = await adapter.run({
            argv: ["help"],
            catalog,
            context: createCommanderContext(catalog, stdout.writer, stderr.writer),
        });

        expect(exitCode).toBe(0);
        expect(stdout.read()).toContain("demo|d|dd|ddd");
        expect(stderr.read()).toBe("");
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
            readTolerantState: async () => ({
                authFile: {
                    auth: [],
                    id: "",
                },
                fileState: "ok",
            }),
            update: async updater => updater({
                auth: [],
                id: "",
            }),
            write: async auth => auth,
        },
        connectorStore: {
            getFilePath() {
                return "";
            },
            read: async () => ({}),
            update: async updater => updater({}),
            write: async connectorFile => connectorFile,
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
        execPath: process.execPath,
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
