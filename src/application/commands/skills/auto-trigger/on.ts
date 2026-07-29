import {
    removeAutoTriggerDisabledSkills,
    setSkillAutoTriggerDisabledForAll,
} from "../../../schemas/settings.ts";
import { createAutoTriggerToggleCommand } from "./toggle-command.ts";

export const skillsAutoTriggerOnCommand = createAutoTriggerToggleCommand({
    acceptsPersistedName: true,
    // `on --all` restores the shipped default outright: it clears the standing
    // policy and the per-skill list, so nothing is left silently manual-only.
    applyAll: settings => setSkillAutoTriggerDisabledForAll(settings, false),
    applySkills: (settings, skillNames) =>
        removeAutoTriggerDisabledSkills(settings, skillNames),
    name: "on",
});
