import type { CliCommandDefinition } from "../../contracts/cli.ts";
import type { ConnectorSession } from "./session.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import {
    bucketTelemetryCount,
    bucketTelemetryStringLength,
} from "../../telemetry/buckets.ts";
import {
    readTeamFlag,
    teamIdentityInputShape,
    teamOption,
} from "../team/identity.ts";
import {
    formatConnectorSearchResultsAsText,
    loadConnectorSearchResults,
} from "./search-provider.ts";
import { resolveConnectorSession } from "./session.ts";
import { resolveConnectorTarget } from "./target.ts";

interface ConnectorSearchInput {
    allTeams?: boolean;
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
        {
            name: "allTeams",
            longFlag: "--all-teams",
            descriptionKey: "options.searchAllTeams",
        },
        teamOption("options.searchTeam"),
    ],
    output: "standard",
    inputSchema: z.object({
        ...teamIdentityInputShape,
        allTeams: z.boolean().optional(),
        text: z.string(),
    }),
    handler: async (input, context) => {
        context.telemetry?.recordProperties({
            search_scope: input.allTeams === true ? "all_teams" : "team",
            query_length_bucket: bucketTelemetryStringLength(input.text),
        });

        let session: ConnectorSession;
        if (input.allTeams === true) {
            if (readTeamFlag(input) !== undefined) {
                throw new CliUserError("errors.connectorSearch.teamConflict", 2);
            }
            const target = await resolveConnectorTarget(context);
            if (target.kind === "self_hosted") {
                throw new CliUserError("errors.connectorSearch.allTeamsUnsupported", 2);
            }
            session = { identity: undefined, target };
            context.telemetry?.recordProperties({
                connector_kind: target.kind,
                identity_source: "none",
            });
        }
        else {
            session = await resolveConnectorSession({ team: input.team }, context);
        }

        const results = await loadConnectorSearchResults(
            {
                allTeams: input.allTeams,
                ...session,
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
