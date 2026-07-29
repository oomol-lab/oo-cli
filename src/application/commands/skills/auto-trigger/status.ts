import type { CliCommandDefinition, CliExecutionContext } from "../../../contracts/cli.ts";
import type { SkillAutoTriggerState } from "./report.ts";

import { z } from "zod";
import { bucketTelemetryCount } from "../../../telemetry/buckets.ts";
import { writeLine } from "../../shared/output.ts";
import { resolveSkillAutoTriggerPolicy } from "../auto-trigger-policy.ts";
import { readSkillAutoTriggerState } from "./report.ts";

export const skillsAutoTriggerStatusCommand: CliCommandDefinition<
    Record<string, never>
> = {
    name: "status",
    summaryKey: "commands.skills.autoTrigger.status.summary",
    descriptionKey: "commands.skills.autoTrigger.status.description",
    output: "standard",
    inputSchema: z.object({}),
    handler: async (_input, context) => {
        const state = readSkillAutoTriggerState(
            resolveSkillAutoTriggerPolicy(await context.settingsStore.read()),
        );

        context.telemetry?.recordProperties({
            disabled_all: state.disabledAll,
            disabled_count_bucket: bucketTelemetryCount(state.disabled.length),
        });

        context.output.emit(state, () => {
            writeStatusText(context, state);
        });
    },
};

function writeStatusText(
    context: Pick<CliExecutionContext, "stdout" | "translator">,
    state: SkillAutoTriggerState,
): void {
    const disabledCount = state.skills.filter(skill => !skill.autoTrigger).length;

    writeLine(
        context.stdout,
        context.translator.t(readStatusHeaderKey(state, disabledCount), {
            count: disabledCount,
        }),
    );

    for (const skill of state.skills) {
        writeLine(
            context.stdout,
            context.translator.t("skills.autoTrigger.status.line", {
                name: skill.name,
                state: context.translator.t(
                    `skills.autoTrigger.state.${skill.reason}`,
                ),
            }),
        );
    }
}

function readStatusHeaderKey(
    state: SkillAutoTriggerState,
    disabledCount: number,
): string {
    if (state.disabledAll) {
        return "skills.autoTrigger.status.headerAll";
    }

    if (disabledCount > 0) {
        return "skills.autoTrigger.status.headerSkills";
    }

    return "skills.autoTrigger.status.headerDefault";
}
