import type {
    CliCommandDefinition,
    CliExecutionContext,
} from "../../contracts/cli.ts";
import type { BundledSkillName } from "./embedded-assets.ts";

import type { ManagedSkillInstallSummary } from "./install-output.ts";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { availableBundledSkillNames } from "./embedded-assets.ts";
import { writeManagedSkillInstallSummary } from "./install-output.ts";
import { migrateLegacyCanonicalSkillLayout } from "./legacy-canonical-migration.ts";
import {
    publishCanonicalLocalSkillsToAvailableHosts,
} from "./local-skill-publication.ts";
import { installRegistrySkills } from "./registry-skill-install.ts";
import { installBundledSkill, isBundledSkillName } from "./shared.ts";
import { createSkillIdsTelemetryProperties } from "./telemetry.ts";

interface SkillsInstallInput {
    all?: boolean;
    packageName?: string;
    skill?: string[];
    yes?: boolean;
}

interface SkillsInstallPackageSpecifier {
    packageName: string;
    packageShareId?: string;
}

export const presetSkillPackageNames = ["@alwaysmavs/gpt-image-2"] as const;

export const skillsInstallCommand: CliCommandDefinition<SkillsInstallInput> = {
    name: "install",
    aliases: ["add"],
    summaryKey: "commands.skills.install.summary",
    descriptionKey: "commands.skills.install.description",
    arguments: [
        {
            name: "packageName",
            descriptionKey: "arguments.packageName",
            required: false,
        },
    ],
    options: [
        {
            name: "skill",
            longFlag: "--skill",
            shortFlag: "-s",
            valueName: "skills...",
            descriptionKey: "options.skill",
        },
        {
            name: "yes",
            longFlag: "--yes",
            shortFlag: "-y",
            descriptionKey: "options.yes",
        },
        {
            name: "all",
            longFlag: "--all",
            descriptionKey: "options.all",
        },
    ],
    inputSchema: z.object({
        all: z.boolean().optional(),
        packageName: z.string().optional(),
        skill: z.array(z.string()).optional(),
        yes: z.boolean().optional(),
    }),
    handler: async (input, context) => {
        await migrateLegacyCanonicalSkillLayout(context);

        if (input.packageName === undefined) {
            context.telemetry?.recordProperties({
                bundled_skill: "__all__",
                package_kind: "bundled",
                ...createSkillIdsTelemetryProperties(availableBundledSkillNames),
            });

            const summaries: ManagedSkillInstallSummary[] = [];

            for (const skillName of availableBundledSkillNames) {
                summaries.push(await installBundledSkill(skillName, context));
            }

            summaries.push(...await installPresetSkillPackages(context));
            const localRefreshSummaries = await publishCanonicalLocalSkillsToAvailableHosts(
                context,
            );

            context.telemetry?.recordProperties({
                local_refresh_count_bucket: bucketTelemetryCount(
                    localRefreshSummaries.length,
                ),
                local_refresh_performed: localRefreshSummaries.length > 0,
            });

            summaries.push(...localRefreshSummaries);
            writeManagedSkillInstallSummary(context, summaries);
            return;
        }

        const packageSpecifier = parseSkillsInstallPackageSpecifier(input.packageName);

        if (
            packageSpecifier.packageShareId === undefined
            && isBundledSkillName(packageSpecifier.packageName)
        ) {
            context.telemetry?.recordProperties({
                bundled_skill: packageSpecifier.packageName,
                package_kind: "bundled",
                ...createSkillIdsTelemetryProperties([packageSpecifier.packageName]),
            });

            const summary = await installBundledSkill(
                packageSpecifier.packageName as BundledSkillName,
                context,
            );

            writeManagedSkillInstallSummary(context, [summary]);
            return;
        }

        await installRegistrySkills(
            {
                all: input.all === true,
                packageName: packageSpecifier.packageName,
                packageShareId: packageSpecifier.packageShareId,
                skillNames: input.skill ?? [],
                yes: input.yes === true,
            },
            context,
        );
    },
};

async function installPresetSkillPackages(
    context: CliExecutionContext,
): Promise<ManagedSkillInstallSummary[]> {
    const summaries: ManagedSkillInstallSummary[] = [];

    for (const packageName of presetSkillPackageNames) {
        try {
            summaries.push(...await installRegistrySkills(
                {
                    all: true,
                    packageName,
                    recordTelemetry: false,
                    skillNames: [],
                    writeOutput: false,
                    yes: true,
                },
                context,
            ));
        }
        catch (error) {
            context.logger.warn(
                {
                    err: error,
                    packageName,
                },
                "Preset skill package install skipped.",
            );
        }
    }

    return summaries;
}

function parseSkillsInstallPackageSpecifier(
    packageSpecifier: string,
): SkillsInstallPackageSpecifier {
    const trimmedSpecifier = packageSpecifier.trim();

    if (trimmedSpecifier === "") {
        throw new CliUserError("errors.skills.install.invalidPackageSpecifier", 2, {
            value: packageSpecifier,
        });
    }

    const shareSeparatorIndex = trimmedSpecifier.indexOf("#");

    if (shareSeparatorIndex < 0) {
        return {
            packageName: trimmedSpecifier,
        };
    }

    const packageName = trimmedSpecifier.slice(0, shareSeparatorIndex).trim();
    const packageShareId = trimmedSpecifier.slice(shareSeparatorIndex + 1).trim();

    if (
        packageName === ""
        || packageShareId === ""
        || packageShareId.includes("#")
    ) {
        throw new CliUserError("errors.skills.install.invalidPackageSpecifier", 2, {
            value: packageSpecifier,
        });
    }

    return {
        packageName,
        packageShareId,
    };
}
