import type { CliExecutionContext } from "../../contracts/cli.ts";

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
            } as unknown as CliExecutionContext,
        );

        expect(typeof deletedAt).toBe("number");
        expect(stdout.read()).toBe("Deleted 4 expired file records.\n");
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
            } as unknown as CliExecutionContext,
        );

        expect(stdout.read()).toBe("{\"deletedCount\":2}\n");
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
