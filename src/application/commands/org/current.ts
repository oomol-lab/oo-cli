import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { getConfiguredIdentityOrganization } from "../../schemas/settings.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { writeLine } from "../shared/output.ts";
import { orgFormatValues } from "./shared.ts";

interface OrgCurrentInput {
    format?: (typeof orgFormatValues)[number];
    showSchemaVersion?: boolean;
}

interface OrgCurrentJsonPayload {
    organization: string | null;
}

// Reports the default organization identity (config `identity.organization`)
// that connector commands use when no `--org` / `--personal` flag is given.
// Offline by design: it only reads local settings, so agents can cheaply learn
// "which identity do I run as by default" without a network round-trip.
export const orgCurrentCommand: CliCommandDefinition<OrgCurrentInput> = {
    name: "current",
    summaryKey: "commands.org.current.summary",
    descriptionKey: "commands.org.current.description",
    options: [...jsonOutputOptions],
    inputSchema: z.object({
        format: z.enum(orgFormatValues).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const settings = await context.settingsStore.read();
        const configuredOrganization = getConfiguredIdentityOrganization(settings);

        context.telemetry?.recordProperties({
            has_configured_org: configuredOrganization !== undefined,
        });

        if (input.format === "json") {
            const payload: OrgCurrentJsonPayload = {
                organization: configuredOrganization ?? null,
            };

            writeJsonOutput(context.stdout, payload, {
                showSchemaVersion: input.showSchemaVersion,
            });
            return;
        }

        writeLine(
            context.stdout,
            configuredOrganization === undefined
                ? context.translator.t("org.current.text.personal")
                : context.translator.t("org.current.text.configured", {
                        organization: configuredOrganization,
                    }),
        );
    },
};
