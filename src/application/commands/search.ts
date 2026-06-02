import type { CliCommandDefinition } from "../contracts/cli.ts";

import { z } from "zod";

import {
    bucketTelemetryCount,
    bucketTelemetryStringLength,
} from "../telemetry/buckets.ts";
import {
    formatConnectorSearchResultsAsText,
    loadConnectorSearchResults,
} from "./connector/search-provider.ts";
import { jsonOutputOptions, writeJsonOutput } from "./json-output.ts";
import { requireCurrentAccount } from "./shared/auth-utils.ts";
import { createFormatInputError } from "./shared/input-parsing.ts";
import { parseCommaSeparatedKeywords } from "./shared/keywords.ts";

const searchFormatValues = ["json"] as const;

interface SearchInput {
    format?: (typeof searchFormatValues)[number];
    keywords?: string;
    showSchemaVersion?: boolean;
    text: string;
}

export const searchCommand: CliCommandDefinition<SearchInput> = {
    name: "search",
    summaryKey: "commands.search.summary",
    descriptionKey: "commands.search.description",
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
        format: z.enum(searchFormatValues).optional(),
        keywords: z.string().optional(),
        showSchemaVersion: z.boolean().optional(),
        text: z.string(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const keywords = parseCommaSeparatedKeywords(input.keywords);

        context.telemetry?.recordProperties({
            keyword_count_bucket: bucketTelemetryCount(keywords.length),
            query_length_bucket: bucketTelemetryStringLength(input.text),
        });

        const account = await requireCurrentAccount(context);
        const results = await loadConnectorSearchResults(
            {
                account,
                keywords,
                text: input.text,
            },
            context,
        );

        context.telemetry?.recordProperties({
            result_count_bucket: bucketTelemetryCount(results.length),
        });

        if (input.format === "json") {
            writeJsonOutput(context.stdout, results, {
                showSchemaVersion: input.showSchemaVersion,
            });
            return;
        }

        if (results.length === 0) {
            context.stdout.write(
                `${context.translator.t("connector.search.text.noResults")}\n`,
            );
            return;
        }

        context.stdout.write(
            `${formatConnectorSearchResultsAsText(results, context)}\n`,
        );
    },
};
