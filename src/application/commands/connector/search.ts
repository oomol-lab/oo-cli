import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import {
    bucketTelemetryCount,
    bucketTelemetryStringLength,
} from "../../telemetry/buckets.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import {
    formatConnectorSearchResultsAsText,
    loadConnectorSearchResults,
} from "./search-provider.ts";
import {
    resolveConnectorSession,
    teamIdentityInputShape,
    teamIdentityOptions,
} from "./session.ts";
import { connectorFormatValues } from "./shared.ts";

interface ConnectorSearchInput {
    format?: (typeof connectorFormatValues)[number];
    team?: string;
    personal?: boolean;
    showSchemaVersion?: boolean;
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
        ...teamIdentityOptions({
            personal: "options.searchPersonal",
            team: "options.searchTeam",
        }),
        ...jsonOutputOptions,
    ],
    inputSchema: z.object({
        format: z.enum(connectorFormatValues).optional(),
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

        if (results.length === 0) {
            if (input.format === "json") {
                writeJsonOutput(context.stdout, [], {
                    showSchemaVersion: input.showSchemaVersion,
                });
                return;
            }

            context.stdout.write(
                `${context.translator.t("connector.search.text.noResults")}\n`,
            );
            return;
        }

        if (input.format === "json") {
            writeJsonOutput(context.stdout, results, {
                showSchemaVersion: input.showSchemaVersion,
            });
            return;
        }

        context.stdout.write(
            `${formatConnectorSearchResultsAsText(results, context)}\n`,
        );
    },
};
