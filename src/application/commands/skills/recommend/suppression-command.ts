import type { CliCommandDefinition } from "../../../contracts/cli.ts";
import type { AppSettings } from "../../../schemas/settings.ts";

import { z } from "zod";
import { CliUserError } from "../../../contracts/cli.ts";
import {
    getDismissedSkillRecommendations,
    isSkillRecommendationsMuted,
} from "../../../schemas/settings.ts";
import { outputFormatOptions, writeJsonOutput } from "../../command-output.ts";
import { createFormatInputError } from "../../shared/input-parsing.ts";
import { writeLine } from "../../shared/output.ts";
import { createPackageNamesTelemetryProperties } from "../telemetry.ts";
import { dedupePreserveOrder } from "./recommendation-plan.ts";

const suppressionFormatValues = ["json"] as const;

interface SuppressionCommandInput {
    all?: boolean;
    packageNames?: string[];
    format?: (typeof suppressionFormatValues)[number];
    showSchemaVersion?: boolean;
}

interface SuppressionCommandConfig {
    name: "mute" | "unmute";
    applyAll: (settings: AppSettings) => AppSettings;
    applyPackages: (
        settings: AppSettings,
        packageNames: readonly string[],
    ) => AppSettings;
}

// Builds a `mute`/`unmute` style command. Both share the same parsing,
// validation, telemetry, and output; only the settings mutation differs, so the
// mutation is injected through `applyAll`/`applyPackages`.
export function createSuppressionCommand(
    config: SuppressionCommandConfig,
): CliCommandDefinition<SuppressionCommandInput> {
    return {
        name: config.name,
        summaryKey: `commands.skills.recommend.${config.name}.summary`,
        descriptionKey: `commands.skills.recommend.${config.name}.description`,
        arguments: [
            {
                name: "packageNames",
                descriptionKey: `arguments.skills.recommend.${config.name}.packageName`,
                required: false,
                variadic: true,
            },
        ],
        options: [
            {
                name: "all",
                longFlag: "--all",
                descriptionKey: `options.skills.recommend.${config.name}.all`,
            },
            ...outputFormatOptions,
        ],
        inputSchema: z.object({
            all: z.boolean().optional(),
            packageNames: z.array(z.string()).optional(),
            format: z.enum(suppressionFormatValues).optional(),
            showSchemaVersion: z.boolean().optional(),
        }),
        mapInputError: (_, rawInput) => createFormatInputError(rawInput),
        handler: async (input, context) => {
            const all = input.all === true;
            const packageNames = dedupePreserveOrder(input.packageNames ?? []);

            if (all && packageNames.length > 0) {
                throw new CliUserError("errors.skills.recommend.conflictingScope", 2);
            }

            if (!all && packageNames.length === 0) {
                throw new CliUserError("errors.skills.recommend.missingScope", 2);
            }

            context.telemetry?.recordProperties({
                target_scope: all ? "all" : "packages",
                ...createPackageNamesTelemetryProperties(packageNames),
            });

            const next = await context.settingsStore.update(settings =>
                all
                    ? config.applyAll(settings)
                    : config.applyPackages(settings, packageNames),
            );

            const state = {
                muted: isSkillRecommendationsMuted(next),
                dismissed: [...getDismissedSkillRecommendations(next)],
            };

            if (input.format === "json") {
                writeJsonOutput(context.stdout, state, {
                    showSchemaVersion: input.showSchemaVersion,
                });
                return;
            }

            writeLine(
                context.stdout,
                context.translator.t(
                    `skills.recommend.${config.name}.success.${all ? "all" : "packages"}`,
                    {
                        count: packageNames.length,
                        packages: packageNames.join(", "),
                    },
                ),
            );
        },
    };
}
