import type { CliCommandDefinition } from "../contracts/cli.ts";

import { z } from "zod";

import { CliUserError } from "../contracts/cli.ts";
import { getConfiguredIdentityTeam } from "../schemas/settings.ts";
import {
    bucketTelemetryCount,
    bucketTelemetryStringLength,
} from "../telemetry/buckets.ts";
import { resolveConnectorIdentityWithEnv } from "./connector/identity.ts";
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
        {
            name: "team",
            longFlag: "--team",
            valueName: "team",
            descriptionKey: "options.searchTeam",
        },
        {
            name: "personal",
            longFlag: "--personal",
            descriptionKey: "options.searchPersonal",
        },
        ...jsonOutputOptions,
    ],
    inputSchema: z.object({
        format: z.enum(searchFormatValues).optional(),
        team: z.string().optional(),
        personal: z.boolean().optional(),
        showSchemaVersion: z.boolean().optional(),
        text: z.string(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        if (input.personal === true && input.team !== undefined) {
            throw new CliUserError("errors.connectorRun.identityConflict", 2);
        }

        const teamFlag = input.team?.trim();
        if (input.team !== undefined && teamFlag === "") {
            throw new CliUserError("errors.connectorRun.teamEmpty", 2);
        }

        context.telemetry?.recordProperties({
            query_length_bucket: bucketTelemetryStringLength(input.text),
        });

        const target = await resolveConnectorTarget(context);

        // Mirrors `connector run`: the self-hosted runtime has no team concept,
        // so an explicit --team is rejected and any configured default identity
        // is ignored.
        if (target.kind === "self_hosted" && teamFlag !== undefined) {
            throw new CliUserError("errors.connector.teamUnsupported", 2);
        }

        const settings = await context.settingsStore.read();
        const { identity, source: identitySource } = target.kind === "self_hosted"
            ? { identity: {}, source: "personal" as const }
            : await resolveConnectorIdentityWithEnv(
                    {
                        configTeam: getConfiguredIdentityTeam(settings),
                        target,
                        teamFlag,
                        personalFlag: input.personal === true,
                    },
                    context,
                );

        context.telemetry?.recordProperties({
            connector_kind: target.kind,
            identity_source: identitySource,
        });

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
