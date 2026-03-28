import type { AuthStore } from "../../contracts/auth-store.ts";
import type {
    CliCatalog,
    CliExecutionContext,
    Fetcher,
    InteractiveInput,
} from "../../contracts/cli.ts";
import type { SettingsStore } from "../../contracts/settings-store.ts";
import type { Translator } from "../../contracts/translator.ts";
import type { AuthFile } from "../../schemas/auth.ts";
import type { AppSettings } from "../../schemas/settings.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    createNoopFileDownloadSessionStore,
    createNoopFileUploadStore,
    createTextBuffer,
    toRequest,
} from "../../../../__tests__/helpers.ts";
import { skillsSearchCommand } from "./search.ts";

const searchHandler = skillsSearchCommand.handler!;
const activeAuthFile: AuthFile = {
    id: "user-1",
    auth: [
        {
            id: "user-1",
            name: "Alice",
            apiKey: "secret-1",
            endpoint: "oomol.com",
        },
    ],
};
const emptyCatalog: CliCatalog = {
    name: "oo",
    descriptionKey: "catalog.description",
    globalOptions: [],
    commands: [],
};
const translator: Translator = {
    locale: "en",
    t: (key) => {
        switch (key) {
            case "skills.search.text.noResults":
                return "No matching skills were found.";
            case "skills.search.text.package":
                return "Package";
            case "skills.search.text.unnamedSkill":
                return "unnamed-skill";
            default:
                return key;
        }
    },
    resolveLocale: () => "en",
};
const stdin: InteractiveInput = {
    on() {},
    off() {},
};

describe("skillsSearchCommand", () => {
    test("trims and deduplicates keywords before sending the request", async () => {
        const requests: Request[] = [];
        const context = createSearchContext({
            fetcher: async (input, init) => {
                requests.push(toRequest(input, init));

                return new Response(JSON.stringify({
                    data: [],
                }));
            },
        });

        await searchHandler(
            {
                text: "text generation",
                keywords: "  bar, baz , ,bar,qux  ",
            },
            context,
        );

        expect(requests).toHaveLength(1);
        expect(new URL(requests[0]!.url).searchParams.getAll("keywords")).toEqual([
            "bar",
            "baz",
            "qux",
        ]);
    });

    test("writes the no-results message when no skills are returned", async () => {
        const context = createSearchContext({
            fetcher: async () => new Response(JSON.stringify({
                data: [],
            })),
        });

        await searchHandler(
            {
                text: "text generation",
            },
            context,
        );

        expect(context.stdoutBuffer.read()).toBe("No matching skills were found.\n");
    });

    test("rejects unsupported skills search responses", async () => {
        const context = createSearchContext({
            fetcher: async () => new Response("not-json"),
        });

        await expect(
            searchHandler(
                {
                    text: "text generation",
                },
                context,
            ),
        ).rejects.toMatchObject({
            key: "errors.skillsSearch.invalidResponse",
        });
    });
});

function createSearchContext(options: {
    fetcher: Fetcher;
}): CliExecutionContext & {
    stdoutBuffer: ReturnType<typeof createTextBuffer>;
} {
    const stdoutBuffer = createTextBuffer();
    const stderr = createTextBuffer();

    return {
        authStore: createAuthStore(activeAuthFile),
        cacheStore: {
            close() {},
            getCache() {
                throw new Error("Unexpected cache access.");
            },
            getFilePath: () => "",
        },
        currentLogFilePath: "",
        fetcher: options.fetcher,
        cwd: process.cwd(),
        env: {},
        fileDownloadSessionStore: createNoopFileDownloadSessionStore(),
        fileUploadStore: createNoopFileUploadStore(),
        stdin,
        logger: pino({
            enabled: false,
        }),
        packageName: "@oomol-lab/oo-cli",
        settingsStore: createSettingsStore({}),
        stdout: stdoutBuffer.writer,
        stdoutBuffer,
        stderr: stderr.writer,
        translator,
        completionRenderer: {
            render: () => "",
        },
        catalog: emptyCatalog,
        version: "0.1.0",
    };
}

function createAuthStore(authFile: AuthFile): AuthStore {
    let currentAuthFile = authFile;

    return {
        getFilePath: () => "",
        read: async () => currentAuthFile,
        write: async (nextAuthFile) => {
            currentAuthFile = nextAuthFile;

            return currentAuthFile;
        },
        update: async (updater) => {
            currentAuthFile = updater(currentAuthFile);

            return currentAuthFile;
        },
    };
}

function createSettingsStore(settings: AppSettings): SettingsStore {
    let currentSettings = settings;

    return {
        getFilePath: () => "",
        read: async () => currentSettings,
        write: async (nextSettings) => {
            currentSettings = nextSettings;

            return currentSettings;
        },
        update: async (updater) => {
            currentSettings = updater(currentSettings);

            return currentSettings;
        },
    };
}
