import type { CliCommandDefinition, CliExecutionContext } from "../../../contracts/cli.ts";
import type { AppSettings } from "../../../schemas/settings.ts";
import type { SkillAutoTriggerPublication } from "./report.ts";

import { z } from "zod";
import { CliUserError } from "../../../contracts/cli.ts";
import { getAutoTriggerDisabledSkills } from "../../../schemas/settings.ts";
import { bucketTelemetryCount } from "../../../telemetry/buckets.ts";
import { writeLine } from "../../shared/output.ts";
import { resolveSkillAutoTriggerPolicy } from "../auto-trigger-policy.ts";
import { availableBundledSkillNames } from "../embedded-assets.ts";
import { readManagedSkillAgentLabel } from "../managed-skill-agents.ts";
import { isBundledSkillName } from "../shared.ts";
import { publishBundledSkillsForAutoTrigger } from "./publish.ts";
import { readSkillAutoTriggerState } from "./report.ts";

interface AutoTriggerToggleInput {
    all?: boolean;
    skillNames?: string[];
}

interface AutoTriggerToggleConfig {
    /**
     * Whether the command may be handed a name that is not a bundled skill in
     * this release. `off` may not — you cannot make a skill that does not exist
     * manual-only, and accepting the name would hide a typo. `on` may, but only
     * for a name the stored list actually holds: a bundled skill dropped by a
     * later release would otherwise be stuck in the settings file with no way
     * to remove it except `on --all`, which discards every other choice.
     */
    acceptsPersistedName: boolean;
    applyAll: (settings: AppSettings) => AppSettings;
    applySkills: (
        settings: AppSettings,
        skillNames: readonly string[],
    ) => AppSettings;
    name: "off" | "on";
}

// Builds the `off`/`on` pair. Both parse, validate, persist, republish, and
// report identically; only the settings mutation differs, so it is injected.
export function createAutoTriggerToggleCommand(
    config: AutoTriggerToggleConfig,
): CliCommandDefinition<AutoTriggerToggleInput> {
    return {
        name: config.name,
        summaryKey: `commands.skills.autoTrigger.${config.name}.summary`,
        descriptionKey: `commands.skills.autoTrigger.${config.name}.description`,
        arguments: [
            {
                name: "skillNames",
                descriptionKey: `arguments.skills.autoTrigger.${config.name}.skillName`,
                required: false,
                variadic: true,
            },
        ],
        options: [
            {
                name: "all",
                longFlag: "--all",
                descriptionKey: `options.skills.autoTrigger.${config.name}.all`,
            },
        ],
        output: "standard",
        inputSchema: z.object({
            all: z.boolean().optional(),
            skillNames: z.array(z.string()).optional(),
        }),
        handler: async (input, context) => {
            const all = input.all === true;
            const skillNames = [...new Set(input.skillNames ?? [])];

            if (all && skillNames.length > 0) {
                throw new CliUserError("errors.skills.autoTrigger.conflictingScope", 2);
            }

            if (!all && skillNames.length === 0) {
                throw new CliUserError("errors.skills.autoTrigger.missingScope", 2);
            }

            const persisted = getAutoTriggerDisabledSkills(
                await context.settingsStore.read(),
            );

            for (const skillName of skillNames) {
                const accepted = isBundledSkillName(skillName)
                    || (config.acceptsPersistedName && persisted.includes(skillName));

                if (!accepted) {
                    throw new CliUserError("errors.skills.autoTrigger.unknownSkill", 2, {
                        skills: availableBundledSkillNames.join(", "),
                        value: skillName,
                    });
                }
            }

            context.telemetry?.recordProperties({
                skill_count_bucket: bucketTelemetryCount(skillNames.length),
                target_scope: all ? "all" : "skills",
            });

            // Settings first: they are the single record of what the user asked
            // for, so a publication that fails half-way still leaves a state
            // `oo skills repair` can finish applying.
            const next = await context.settingsStore.update(settings =>
                all
                    ? config.applyAll(settings)
                    : config.applySkills(settings, skillNames),
            );
            const policy = resolveSkillAutoTriggerPolicy(next);
            const publications = await publishBundledSkillsForAutoTrigger(
                context,
                policy,
            );

            const state = readSkillAutoTriggerState(policy);

            context.output.emit({ ...state, publications }, () => {
                writeToggleText(context, {
                    all,
                    name: config.name,
                    publications,
                    skillNames,
                    standingPolicy: state.disabledAll,
                });
            });

            const failed = publications.filter(
                publication => publication.status === "failed",
            );

            if (failed.length > 0) {
                throw new CliUserError("errors.skills.autoTrigger.publishFailed", 1, {
                    count: failed.length,
                    repairArguments: formatRepairArguments(failed),
                    targets: formatPublicationTargets(failed, context),
                });
            }
        },
    };
}

function writeToggleText(
    context: Pick<CliExecutionContext, "stdout" | "translator">,
    options: {
        all: boolean;
        name: AutoTriggerToggleConfig["name"];
        publications: readonly SkillAutoTriggerPublication[];
        skillNames: readonly string[];
        standingPolicy: boolean;
    },
): void {
    const { all, publications } = options;

    writeLine(
        context.stdout,
        context.translator.t(
            `skills.autoTrigger.${options.name}.success.${all ? "all" : "skills"}`,
            {
                count: options.skillNames.length,
                skills: options.skillNames.join(", "),
            },
        ),
    );

    // A per-skill change while `--all` is in force does not alter what any agent
    // sees. Saying only "these skills can auto-trigger again" would be a plain
    // lie, so the standing policy is spelled out with the way to lift it.
    if (!all && options.standingPolicy) {
        writeLine(
            context.stdout,
            context.translator.t("skills.autoTrigger.standingPolicyNote"),
        );
    }

    const published = publications.filter(
        publication => publication.status === "published",
    );

    if (published.length > 0) {
        writeLine(
            context.stdout,
            context.translator.t("skills.autoTrigger.publishedLine", {
                agents: new Set(published.map(publication => publication.agent)).size,
                count: published.length,
            }),
        );
    }

    const skipped = publications.filter(
        publication => publication.status === "skipped",
    );

    if (skipped.length > 0) {
        writeLine(
            context.stdout,
            context.translator.t("skills.autoTrigger.skippedLine", {
                count: skipped.length,
                targets: formatPublicationTargets(skipped, context),
            }),
        );
    }
}

// `oo skills repair` requires at least one `--skill`, so the recovery hint has
// to name the skills that actually failed rather than suggest a bare command
// the user cannot run.
function formatRepairArguments(
    publications: readonly SkillAutoTriggerPublication[],
): string {
    return Array.from(new Set(publications.map(publication => publication.skill)), skillName => `--skill ${skillName}`)
        .join(" ");
}

// `<agent label>/<skill name>` — never a filesystem path, which text output for
// skills deliberately keeps out of stdout.
function formatPublicationTargets(
    publications: readonly SkillAutoTriggerPublication[],
    context: Pick<CliExecutionContext, "translator">,
): string {
    return publications
        .map(publication =>
            `${readManagedSkillAgentLabel(publication.agent, context.translator)}/${publication.skill}`,
        )
        .join(", ");
}
