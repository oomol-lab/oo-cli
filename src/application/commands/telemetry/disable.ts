import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { setTelemetryEnabled } from "../../schemas/settings.ts";
import { disableTelemetryForCurrentInvocation } from "../../telemetry/control.ts";
import { writeLine } from "../shared/output.ts";

export const telemetryDisableCommand: CliCommandDefinition = {
    name: "disable",
    excludeFromTelemetry: true,
    summaryKey: "commands.telemetry.disable.summary",
    descriptionKey: "commands.telemetry.disable.description",
    inputSchema: z.object({}),
    handler: async (_, context) => {
        await context.settingsStore.update(
            settings => setTelemetryEnabled(settings, false),
        );
        disableTelemetryForCurrentInvocation(context);

        writeLine(
            context.stdout,
            context.translator.t("telemetry.disable.success"),
        );
    },
};
