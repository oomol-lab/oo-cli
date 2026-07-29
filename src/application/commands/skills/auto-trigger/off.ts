import {
    addAutoTriggerDisabledSkills,
    setSkillAutoTriggerDisabledForAll,
} from "../../../schemas/settings.ts";
import { createAutoTriggerToggleCommand } from "./toggle-command.ts";

export const skillsAutoTriggerOffCommand = createAutoTriggerToggleCommand({
    acceptsPersistedName: false,
    applyAll: settings => setSkillAutoTriggerDisabledForAll(settings, true),
    applySkills: (settings, skillNames) =>
        addAutoTriggerDisabledSkills(settings, skillNames),
    name: "off",
});
