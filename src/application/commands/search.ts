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
import { resolveConnectorTarget } from "./connector/target.ts";
import { jsonOutputOptions, writeJsonOutput } from "./json-output.ts";
import { createFormatInputError } from "./shared/input-parsing.ts";

const searchFormatValues = ["json"] as const;

interface SearchInput {
    format?: (typeof searchFormatValues)[number];
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
    ],
    inputSchema: z.object({
        format: z.enum(searchFormatValues).optional(),
        showSchemaVersion: z.boolean().optional(),
        text: z.string(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        context.telemetry?.recordProperties({
            query_length_bucket: bucketTelemetryStringLength(input.text),
        });

        const target = await resolveConnectorTarget(context);

        context.telemetry?.recordProperties({
            connector_kind: target.kind,
        });

        const results = await loadConnectorSearchResults(
            {
                target,
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
