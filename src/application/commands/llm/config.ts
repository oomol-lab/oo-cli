import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";

export const defaultLlmModel = "oomol-chat";

interface LlmConfigOutput {
    apiKey: string;
    baseUrl: string;
    chatCompletionsUrl: string;
    model: string;
}

export const llmConfigCommand: CliCommandDefinition = {
    name: "config",
    excludeFromTelemetry: true,
    summaryKey: "commands.llm.config.summary",
    descriptionKey: "commands.llm.config.description",
    output: "json-only",
    inputSchema: z.object({}),
    handler: async (_input, context) => {
        const { account } = await requireIdentity(context);
        const baseUrl = createLlmBaseUrl(account.endpoint);
        const config: LlmConfigOutput = {
            apiKey: account.apiKey,
            baseUrl,
            chatCompletionsUrl: createChatCompletionsUrl(baseUrl),
            model: defaultLlmModel,
        };

        context.output.emitJson(config);
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
