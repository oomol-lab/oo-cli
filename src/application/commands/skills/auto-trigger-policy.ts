import type { SettingsStore } from "../../contracts/settings-store.ts";
import type { AppSettings } from "../../schemas/settings.ts";

import {
    getAutoTriggerDisabledSkills,
    isSkillAutoTriggerDisabledForAll,
} from "../../schemas/settings.ts";

/**
 * Whether an agent may load a bundled skill without the user naming it.
 *
 * This is a materialization input, not a runtime switch: the effective value is
 * baked into the published skill files, so it only reaches an agent when the
 * bundled skill is republished. `disabledAll` is a standing policy that covers
 * bundled skills added by later releases, so it is kept as its own flag rather
 * than being expanded into the names known today.
 */
export interface SkillAutoTriggerPolicy {
    readonly disabled: readonly string[];
    readonly disabledAll: boolean;
}

/** Why one skill ended up with the auto-trigger state it has. */
export type SkillAutoTriggerReason = "all" | "default" | "skill";

export const defaultSkillAutoTriggerPolicy: SkillAutoTriggerPolicy = {
    disabled: [],
    disabledAll: false,
};

export function resolveSkillAutoTriggerPolicy(
    settings: AppSettings,
): SkillAutoTriggerPolicy {
    return {
        disabled: getAutoTriggerDisabledSkills(settings),
        disabledAll: isSkillAutoTriggerDisabledForAll(settings),
    };
}

/**
 * Reads the policy once for a whole invocation. Publication loops fan out over
 * hosts and skills, and the settings store is uncached, so resolving inside the
 * loop would re-read and re-parse the file per target and let one invocation
 * straddle two different policies.
 */
export async function readSkillAutoTriggerPolicy(
    settingsStore: Pick<SettingsStore, "read">,
): Promise<SkillAutoTriggerPolicy> {
    return resolveSkillAutoTriggerPolicy(await settingsStore.read());
}

export function isSkillAutoTriggerEnabled(
    policy: SkillAutoTriggerPolicy,
    skillName: string,
): boolean {
    return readSkillAutoTriggerReason(policy, skillName) === "default";
}

export function readSkillAutoTriggerReason(
    policy: SkillAutoTriggerPolicy,
    skillName: string,
): SkillAutoTriggerReason {
    if (policy.disabledAll) {
        return "all";
    }

    return policy.disabled.includes(skillName) ? "skill" : "default";
}

// Claude Code reads `disable-model-invocation` from the SKILL.md frontmatter;
// Codex reads `policy.allow_implicit_invocation` from `agents/openai.yaml`. The
// two vendors spell the same policy with opposite polarity, so both values are
// derived here from one boolean instead of being written independently.
export function createSkillAutoTriggerRenderVariables(
    autoTriggerEnabled: boolean,
): Record<string, string> {
    return {
        allowImplicitInvocation: String(autoTriggerEnabled),
        disableModelInvocation: String(!autoTriggerEnabled),
    };
}
