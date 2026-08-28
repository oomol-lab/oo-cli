import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import {
    bucketTelemetryCount,
    bucketTelemetryStringLength,
} from "../../telemetry/buckets.ts";
import {
    teamIdentityInputShape,
    teamOption,
} from "../team/identity.ts";
import {
    formatConnectorSearchResultsAsText,
    loadConnectorSearchResults,
} from "./search-provider.ts";
import { resolveConnectorSession } from "./session.ts";

interface ConnectorSearchInput {
    team?: string;
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
        teamOption("options.searchTeam"),
    ],
    output: "standard",
    inputSchema: z.object({
        ...teamIdentityInputShape,
        text: z.string(),
    }),
    handler: async (input, context) => {
        context.telemetry?.recordProperties({
            query_length_bucket: bucketTelemetryStringLength(input.text),
        });

        const { identity, target } = await resolveConnectorSession(
            {
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

        context.output.emit(results, () => {
            if (results.length === 0) {
                context.stdout.write(
                    `${context.translator.t("connector.search.text.noResults")}\n`,
                );
                return;
            }

            context.stdout.write(
                `${formatConnectorSearchResultsAsText(results, context)}\n`,
            );
        });
    },
};
