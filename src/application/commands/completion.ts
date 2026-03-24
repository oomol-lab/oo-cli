import type { CliCommandDefinition, SupportedShell } from "../contracts/cli.ts";

import { z } from "zod";
import { CliUserError, supportedShellValues } from "../contracts/cli.ts";
import { shellSchema } from "../schemas/settings.ts";

interface CompletionInput {
    shell: SupportedShell;
}

export const completionCommand: CliCommandDefinition<CompletionInput> = {
    name: "completion",
    summaryKey: "commands.completion.summary",
    descriptionKey: "commands.completion.description",
    arguments: [
        {
            name: "shell",
            descriptionKey: "arguments.shell",
            required: true,
            choices: supportedShellValues,
        },
    ],
    inputSchema: z.object({
        shell: shellSchema,
    }),
    mapInputError: (_, rawInput) => createInvalidShellError(rawInput),
    handler: (input, context) => {
        context.stdout.write(
            context.completionRenderer.render(input.shell, context.catalog),
        );
    },
};

function createInvalidShellError(rawInput: Record<string, unknown>): CliUserError {
    return new CliUserError("errors.completion.invalidShell", 2, {
        value: String(rawInput.shell ?? ""),
    });
}
