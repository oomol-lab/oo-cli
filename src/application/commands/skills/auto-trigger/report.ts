import type {
    SkillAutoTriggerPolicy,
    SkillAutoTriggerReason,
} from "../auto-trigger-policy.ts";
import type { BundledSkillAgentName, BundledSkillName } from "../embedded-assets.ts";

import { readSkillAutoTriggerReason } from "../auto-trigger-policy.ts";
import { availableBundledSkillNames } from "../embedded-assets.ts";

type SkillAutoTriggerPublicationStatus = "failed" | "published" | "skipped";

export interface SkillAutoTriggerPublication {
    agent: BundledSkillAgentName;
    skill: BundledSkillName;
    status: SkillAutoTriggerPublicationStatus;
}

interface SkillAutoTriggerSkillState {
    autoTrigger: boolean;
    name: BundledSkillName;
    reason: SkillAutoTriggerReason;
}

export interface SkillAutoTriggerState {
    disabled: readonly string[];
    disabledAll: boolean;
    skills: readonly SkillAutoTriggerSkillState[];
}

// Projects the stored policy onto the bundled skills that exist in this
// release. `disabled` is echoed verbatim rather than filtered: a name left over
// from a release that shipped a different bundled skill is still what the
// settings file says, and hiding it would make the output disagree with disk.
export function readSkillAutoTriggerState(
    policy: SkillAutoTriggerPolicy,
): SkillAutoTriggerState {
    return {
        disabled: policy.disabled,
        disabledAll: policy.disabledAll,
        skills: availableBundledSkillNames.map((name) => {
            const reason = readSkillAutoTriggerReason(policy, name);

            return {
                autoTrigger: reason === "default",
                name,
                reason,
            } satisfies SkillAutoTriggerSkillState;
        }),
    };
}
