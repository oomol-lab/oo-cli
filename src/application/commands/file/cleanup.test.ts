import type { CliExecutionContext } from "../../contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { createTextBuffer } from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { fileCleanupCommand } from "./cleanup.ts";

describe("file cleanup command", () => {
    test("writes a localized text summary when json output is not requested", () => {
        const stdout = createTextBuffer();
        let deletedAt: number | undefined;

        fileCleanupCommand.handler!(
            {},
            {
                fileUploadStore: {
                    deleteExpired(now: number) {
                        deletedAt = now;
                        return 3;
                    },
                },
                stdout: stdout.writer,
                translator: createTranslator("en"),
            } as unknown as CliExecutionContext,
        );

        expect(typeof deletedAt).toBe("number");
        expect(stdout.read()).toBe("Deleted 3 expired upload records.\n");
    });

    test("writes json output when the format is json", () => {
        const stdout = createTextBuffer();

        fileCleanupCommand.handler!(
            {
                format: "json",
            },
            {
                fileUploadStore: {
                    deleteExpired() {
                        return 2;
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
