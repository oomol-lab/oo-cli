import type { CliCommandDefinition } from "../contracts/cli.ts";

import { z } from "zod";

import {
    bucketTelemetryCount,
    bucketTelemetryStringLength,
} from "../telemetry/buckets.ts";
import { outputFormatOptions, writeJsonOutput } from "./command-output.ts";
import {
    formatConnectorSearchResultsAsText,
    loadConnectorSearchResults,
} from "./connector/search-provider.ts";
import {
    resolveConnectorSession,
    teamIdentityInputShape,
    teamIdentityOptions,
} from "./connector/session.ts";
import { createFormatInputError } from "./shared/input-parsing.ts";

const searchFormatValues = ["json"] as const;

interface SearchInput {
    format?: (typeof searchFormatValues)[number];
    team?: string;
    personal?: boolean;
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
        ...teamIdentityOptions({
            personal: "options.searchPersonal",
            team: "options.searchTeam",
        }),
        ...outputFormatOptions,
    ],
    inputSchema: z.object({
        format: z.enum(searchFormatValues).optional(),
        ...teamIdentityInputShape,
        showSchemaVersion: z.boolean().optional(),
        text: z.string(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        context.telemetry?.recordProperties({
            query_length_bucket: bucketTelemetryStringLength(input.text),
        });

        const { identity, target } = await resolveConnectorSession(
            {
                personal: input.personal,
                team: input.team,
            },
            context,
        );

        const results = await loadConnectorSearchResults(
            {
                identity,
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
