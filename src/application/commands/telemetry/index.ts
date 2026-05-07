import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { telemetryDisableCommand } from "./disable.ts";
import { telemetryEnableCommand } from "./enable.ts";
import { telemetryStatusCommand } from "./status.ts";

export const telemetryCommand: CliCommandDefinition = {
    name: "telemetry",
    excludeFromTelemetry: true,
    summaryKey: "commands.telemetry.summary",
    descriptionKey: "commands.telemetry.description",
    children: [
        telemetryStatusCommand,
        telemetryEnableCommand,
        telemetryDisableCommand,
    ],
};
