import type { CliCommandContext } from "../../contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { createTextBuffer } from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { fileCleanupCommand } from "./cleanup.ts";

describe("file cleanup command", () => {
    test("writes a localized text summary when json output is not requested", async () => {
        const stdout = createTextBuffer();
        let deletedAt: number | undefined;

        await fileCleanupCommand.handler!(
            {},
            {
                fileUploadStore: {
                    deleteExpired(now: number) {
                        deletedAt = now;
                        return 3;
                    },
                },
                fileDownloadSessionStore: {
                    deleteDownloadSessionsUpdatedBefore() {
                        return Promise.resolve(1);
                    },
                },
                stdout: stdout.writer,
                translator: createTranslator("en"),
            } as unknown as CliCommandContext,
        );

        expect(typeof deletedAt).toBe("number");
        expect(stdout.read()).toBe("Deleted 4 expired or stale file transfer records.\n");
    });

    test("writes json output when the format is json", async () => {
        const stdout = createTextBuffer();

        await fileCleanupCommand.handler!(
            {
                format: "json",
            },
            {
                fileUploadStore: {
                    deleteExpired() {
                        return 2;
                    },
                },
                fileDownloadSessionStore: {
                    deleteDownloadSessionsUpdatedBefore() {
                        return Promise.resolve(0);
                    },
                },
                stdout: stdout.writer,
                translator: createTranslator("en"),
            } as unknown as CliCommandContext,
        );

        expect(stdout.read()).toBe("{\"deletedCount\":2}\n");
    });

    test("includes schemaVersion in json output when showSchemaVersion is set", async () => {
        const stdout = createTextBuffer();

        await fileCleanupCommand.handler!(
            {
                format: "json",
                showSchemaVersion: true,
            },
            {
                fileUploadStore: {
                    deleteExpired() {
                        return 2;
                    },
                },
                fileDownloadSessionStore: {
                    deleteDownloadSessionsUpdatedBefore() {
                        return Promise.resolve(0);
                    },
                },
                stdout: stdout.writer,
                translator: createTranslator("en"),
            } as unknown as CliCommandContext,
        );

        expect(JSON.parse(stdout.read())).toEqual({
            deletedCount: 2,
            schemaVersion: "1.0.0",
        });
    });

    test("ignores showSchemaVersion when format is not json", async () => {
        const stdout = createTextBuffer();

        await fileCleanupCommand.handler!(
            {
                showSchemaVersion: true,
            },
            {
                fileUploadStore: {
                    deleteExpired() {
                        return 3;
                    },
                },
                fileDownloadSessionStore: {
                    deleteDownloadSessionsUpdatedBefore() {
                        return Promise.resolve(0);
                    },
                },
                stdout: stdout.writer,
                translator: createTranslator("en"),
            } as unknown as CliCommandContext,
        );

        expect(stdout.read()).toBe(
            "Deleted 3 expired or stale file transfer records.\n",
        );
    });

    test("maps invalid format input to a user-facing error", () => {
        const error = fileCleanupCommand.mapInputError!(
            new z.ZodError([]),
            {
                format: "yaml",
            },
        );

        expect(error).toMatchObject({
            exitCode: 2,
            key: "errors.shared.invalidFormat",
            params: {
                value: "yaml",
            },
        });
    });
});
