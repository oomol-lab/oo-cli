import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { parseCommaSeparatedKeywords } from "../shared/keywords.ts";
import {
    formatConnectorSearchResultsAsText,
    loadConnectorSearchResults,
} from "./search-provider.ts";
import { connectorFormatValues } from "./shared.ts";

interface ConnectorSearchInput {
    format?: (typeof connectorFormatValues)[number];
    keywords?: string;
    text: string;
}

export const connectorSearchCommand: CliCommandDefinition<ConnectorSearchInput> = {
    name: "search",
    summaryKey: "commands.connector.search.summary",
    descriptionKey: "commands.connector.search.description",
    missingArgumentBehavior: "showHelp",
    arguments: [
        {
            name: "text",
            descriptionKey: "arguments.text",
            required: true,
        },
    ],
    options: [
        ...jsonOutputOptions,
        {
            name: "keywords",
            longFlag: "--keywords",
            valueName: "keywords",
            descriptionKey: "options.connectorKeywords",
        },
    ],
    inputSchema: z.object({
        format: z.enum(connectorFormatValues).optional(),
        keywords: z.string().optional(),
        text: z.string(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const account = await requireCurrentAccount(context);
        const keywords = parseCommaSeparatedKeywords(input.keywords);
        const results = await loadConnectorSearchResults(
            {
                apiKey: account.apiKey,
                endpoint: account.endpoint,
                keywords,
                text: input.text,
            },
            context,
        );

        if (results.length === 0) {
            if (input.format === "json") {
                writeJsonOutput(context.stdout, []);
                return;
            }

            context.stdout.write(
                `${context.translator.t("connector.search.text.noResults")}\n`,
            );
            return;
        }

        if (input.format === "json") {
            writeJsonOutput(context.stdout, results);
            return;
        }

        context.stdout.write(
            `${formatConnectorSearchResultsAsText(results, context)}\n`,
        );
    },
};
