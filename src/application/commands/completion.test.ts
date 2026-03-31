import type {
    CliCatalog,
    CliExecutionContext,
    SupportedShell,
} from "../contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { createTextBuffer } from "../../../__tests__/helpers.ts";
import { completionCommand } from "./completion.ts";

describe("completion command", () => {
    test("renders completion output for the requested shell", () => {
        const stdout = createTextBuffer();
        const catalog: CliCatalog = {
            commands: [],
            descriptionKey: "catalog.description",
            globalOptions: [],
            name: "oo",
        };
        let renderedShell: string | undefined;
        let renderedCatalog: unknown;

        completionCommand.handler!(
            {
                shell: "fish",
            },
            {
                catalog,
                completionRenderer: {
                    render(shell: SupportedShell, currentCatalog: CliCatalog) {
                        renderedShell = shell;
                        renderedCatalog = currentCatalog;

                        return "complete -c oo\n";
                    },
                },
                stdout: stdout.writer,
            } as unknown as CliExecutionContext,
        );

        expect(renderedShell).toBe("fish");
        expect(renderedCatalog).toBe(catalog);
        expect(stdout.read()).toBe("complete -c oo\n");
    });

    test("maps invalid shell input to a user-facing error", () => {
        const error = completionCommand.mapInputError!(
            new z.ZodError([]),
            {
                shell: "pwsh",
            },
        );

        expect(error).toMatchObject({
            exitCode: 2,
            key: "errors.completion.invalidShell",
            params: {
                value: "pwsh",
            },
        });
    });
});
