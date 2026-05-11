import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";

const llmConfigFormatValues = ["json"] as const;
export const defaultLlmModel = "oomol-chat";

interface LlmConfigInput {
    format?: (typeof llmConfigFormatValues)[number];
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
    options: [...jsonOutputOptions],
    inputSchema: z.object({
        format: z.enum(llmConfigFormatValues).optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (_, context) => {
        const account = await requireCurrentAccount(context);
        const config: LlmConfigOutput = {
            apiKey: account.apiKey,
            baseUrl: createLlmBaseUrl(account.endpoint),
            chatCompletionsUrl: createLlmChatCompletionsUrl(account.endpoint),
            model: defaultLlmModel,
        };

        writeJsonOutput(context.stdout, config);
    },
};

export function createLlmBaseUrl(endpoint: string): string {
    return new URL(`https://llm.${endpoint}/`).toString();
}

export function createLlmChatCompletionsUrl(endpoint: string): string {
    return new URL(`https://llm.${endpoint}/v1/chat/completions`).toString();
}
