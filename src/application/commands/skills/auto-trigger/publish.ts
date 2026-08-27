import type { CliExecutionContext } from "../../../contracts/cli.ts";
import type { SkillAutoTriggerPolicy } from "../auto-trigger-policy.ts";
import type { BundledSkillName } from "../embedded-assets.ts";
import type { ManagedSkillHost } from "../managed-skill-hosts.ts";
import type { SkillAutoTriggerPublication } from "./report.ts";

import { resolveBundledSkillCanonicalDirectoryPath } from "../bundled-skill-paths.ts";
import { availableBundledSkillNames } from "../embedded-assets.ts";
import {
    createMissingManagedSkillHostError,
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallation,
} from "../managed-skill-hosts.ts";
import { publishManagedBundledSkill } from "../shared.ts";
import {
    isBundledSkillDirectoryWritable,
    readSkillDirectoryState,
} from "../skill-directory-state.ts";

type SkillAutoTriggerPublishContext = Pick<
    CliExecutionContext,
    "env" | "logger" | "settingsStore" | "version"
>;

/**
 * Rewrites every bundled skill for every available host so the policy that was
 * just persisted reaches disk.
 *
 * A same-name directory that oo does not manage is skipped rather than
 * overwritten, the way startup synchronization treats it. This deliberately
 * differs from `oo skills install`, which aborts the whole run on such a
 * directory: the user is changing a preference, not installing, so one
 * hand-made directory must not stop the policy reaching the other agents. The
 * caller reports the skipped targets. Anything else that goes wrong is recorded
 * as a failure so the caller can exit non-zero — a half-applied policy that
 * reported success would leave the user believing skills are manual-only when
 * some agent still auto-triggers them.
 */
export async function publishBundledSkillsForAutoTrigger(
    context: SkillAutoTriggerPublishContext,
    autoTriggerPolicy: SkillAutoTriggerPolicy,
): Promise<readonly SkillAutoTriggerPublication[]> {
    const hosts = await resolveAvailableManagedSkillHosts(context.env);

    if (hosts.length === 0) {
        throw createMissingManagedSkillHostError(context.env);
    }

    const publications = await Promise.all(
        hosts.flatMap(host =>
            availableBundledSkillNames.map(skillName =>
                publishOneBundledSkill(host, skillName, autoTriggerPolicy, context),
            ),
        ),
    );

    return publications;
}

async function publishOneBundledSkill(
    host: ManagedSkillHost,
    skillName: BundledSkillName,
    autoTriggerPolicy: SkillAutoTriggerPolicy,
    context: SkillAutoTriggerPublishContext,
): Promise<SkillAutoTriggerPublication> {
    const settingsFilePath = context.settingsStore.getFilePath();
    const installation = resolveManagedSkillHostInstallation(host, skillName);
    const logFields = {
        agentName: host.agentName,
        path: installation.installedSkillDirectoryPath,
        skillName,
    };

    try {
        const states = await Promise.all([
            readSkillDirectoryState(installation.installedSkillDirectoryPath),
            readSkillDirectoryState(
                resolveBundledSkillCanonicalDirectoryPath(
                    settingsFilePath,
                    skillName,
                    host.agentName,
                ),
            ),
        ]);
        const blocked = states.some(state => !isBundledSkillDirectoryWritable(
            state,
            { reclaimNonDirectory: true },
        ));

        if (blocked) {
            context.logger.warn(
                logFields,
                "Auto-trigger publication skipped because the target is not managed by oo.",
            );

            return { agent: host.agentName, skill: skillName, status: "skipped" };
        }

        await publishManagedBundledSkill({
            agentName: host.agentName,
            autoTriggerPolicy,
            homeDirectory: host.homeDirectory,
            settingsFilePath,
            skillName,
            version: context.version,
        });

        return { agent: host.agentName, skill: skillName, status: "published" };
    }
    catch (error) {
        context.logger.warn(
            { ...logFields, err: error },
            "Auto-trigger publication failed.",
        );

        return { agent: host.agentName, skill: skillName, status: "failed" };
    }
}
