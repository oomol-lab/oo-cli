import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { outputFormatOptions, writeJsonOutput } from "../command-output.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";

const llmConfigFormatValues = ["json"] as const;
export const defaultLlmModel = "oomol-chat";

interface LlmConfigInput {
    format?: (typeof llmConfigFormatValues)[number];
    showSchemaVersion?: boolean;
}

interface LlmConfigOutput {
    apiKey: string;
    baseUrl: string;
    chatCompletionsUrl: string;
    model: string;
}

export const llmConfigCommand: CliCommandDefinition<LlmConfigInput> = {
    name: "config",
    excludeFromTelemetry: true,
    summaryKey: "commands.llm.config.summary",
    descriptionKey: "commands.llm.config.description",
    options: [...outputFormatOptions],
    inputSchema: z.object({
        format: z.enum(llmConfigFormatValues).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const { account } = await requireIdentity(context);
        const baseUrl = createLlmBaseUrl(account.endpoint);
        const config: LlmConfigOutput = {
            apiKey: account.apiKey,
            baseUrl,
            chatCompletionsUrl: createChatCompletionsUrl(baseUrl),
            model: defaultLlmModel,
        };

        writeJsonOutput(context.stdout, config, {
            showSchemaVersion: input.showSchemaVersion,
        });
    },
};

export function createLlmBaseUrl(endpoint: string): string {
    return new URL(`https://llm.${endpoint}/v1`).toString();
}

export function createLlmChatCompletionsUrl(endpoint: string): string {
    return createChatCompletionsUrl(createLlmBaseUrl(endpoint));
}

function createChatCompletionsUrl(baseUrl: string): string {
    return new URL(`${baseUrl}/chat/completions`).toString();
}
