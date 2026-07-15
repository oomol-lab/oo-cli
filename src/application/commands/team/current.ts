import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { getConfiguredIdentityTeam } from "../../schemas/settings.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { writeLine } from "../shared/output.ts";
import { teamFormatValues } from "./shared.ts";

interface TeamCurrentInput {
    format?: (typeof teamFormatValues)[number];
    showSchemaVersion?: boolean;
}

interface TeamCurrentJsonPayload {
    team: string | null;
}

// Reports the default team identity (config `identity.team`) that connector
// commands use when no `--team` / `--personal` flag is given. Offline by
// design: it only reads local settings, so agents can cheaply learn "which
// identity do I run as by default" without a network round-trip.
export const teamCurrentCommand: CliCommandDefinition<TeamCurrentInput> = {
    name: "current",
    summaryKey: "commands.team.current.summary",
    descriptionKey: "commands.team.current.description",
    options: [...jsonOutputOptions],
    inputSchema: z.object({
        format: z.enum(teamFormatValues).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const settings = await context.settingsStore.read();
        const configuredTeam = getConfiguredIdentityTeam(settings);

        context.telemetry?.recordProperties({
            has_configured_team: configuredTeam !== undefined,
        });

        if (input.format === "json") {
            const payload: TeamCurrentJsonPayload = {
                team: configuredTeam ?? null,
            };

            writeJsonOutput(context.stdout, payload, {
                showSchemaVersion: input.showSchemaVersion,
            });
            return;
        }

        writeLine(
            context.stdout,
            configuredTeam === undefined
                ? context.translator.t("team.current.text.personal")
                : context.translator.t("team.current.text.configured", {
                        team: configuredTeam,
                    }),
        );
    },
};
