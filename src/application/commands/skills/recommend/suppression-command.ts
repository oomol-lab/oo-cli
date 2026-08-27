import type { CliCommandDefinition } from "../../../contracts/cli.ts";
import type { AppSettings } from "../../../schemas/settings.ts";

import { z } from "zod";
import { CliUserError } from "../../../contracts/cli.ts";
import {
    getDismissedSkillRecommendations,
    isSkillRecommendationsMuted,
} from "../../../schemas/settings.ts";
import { writeLine } from "../../shared/output.ts";
import { createPackageNamesTelemetryProperties } from "../telemetry.ts";

interface SuppressionCommandInput {
    all?: boolean;
    packageNames?: string[];
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
        ],
        output: "standard",
        inputSchema: z.object({
            all: z.boolean().optional(),
            packageNames: z.array(z.string()).optional(),
        }),
        handler: async (input, context) => {
            const all = input.all === true;
            const packageNames = [...new Set(input.packageNames ?? [])];

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

            context.output.emit(state, () => {
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
            });
        },
    };
}
