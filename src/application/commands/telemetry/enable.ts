import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { setTelemetryEnabled } from "../../schemas/settings.ts";
import { writeLine } from "../shared/output.ts";

export const telemetryEnableCommand: CliCommandDefinition = {
    name: "enable",
    excludeFromTelemetry: true,
    summaryKey: "commands.telemetry.enable.summary",
    descriptionKey: "commands.telemetry.enable.description",
    inputSchema: z.object({}),
    handler: async (_, context) => {
        await context.settingsStore.update(
            settings => setTelemetryEnabled(settings, true),
        );

        writeLine(
            context.stdout,
            context.translator.t("telemetry.enable.success"),
        );
    },
};
