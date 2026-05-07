import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import {
    readTelemetryDeviceIdIfExists,
    readTelemetryOutboxSummary,
} from "../../telemetry/outbox.ts";
import { resolveTelemetryEffectiveStatus } from "../../telemetry/status.ts";
import { writeLine } from "../shared/output.ts";

export const telemetryStatusCommand: CliCommandDefinition = {
    name: "status",
    excludeFromTelemetry: true,
    summaryKey: "commands.telemetry.status.summary",
    descriptionKey: "commands.telemetry.status.description",
    inputSchema: z.object({}),
    handler: async (_, context) => {
        const settings = await context.settingsStore.read();
        const status = resolveTelemetryEffectiveStatus({
            env: context.env,
            settings,
        });
        const summary = context.telemetry === undefined
            ? { pendingCount: 0 }
            : readTelemetryOutboxSummary(
                    context.telemetry.directoryPath,
                    context.logger,
                );
        const deviceId = context.telemetry === undefined
            ? undefined
            : await readTelemetryDeviceIdIfExists(context.telemetry.directoryPath);

        writeLine(
            context.stdout,
            [
                context.translator.t("telemetry.status.enabled", {
                    value: formatTelemetryEnabledStatus(status),
                }),
                context.translator.t("telemetry.status.deviceId", {
                    value: deviceId?.slice(0, 8)
                        ?? context.translator.t("telemetry.status.none"),
                }),
                context.translator.t("telemetry.status.pending", {
                    value: summary.pendingCount,
                }),
                context.translator.t("telemetry.status.lastFlush", {
                    value: summary.lastFlushAtMs === undefined
                        ? context.translator.t("telemetry.status.none")
                        : new Date(summary.lastFlushAtMs).toISOString(),
                }),
            ].join("\n"),
        );
    },
};

function formatTelemetryEnabledStatus(status: {
    disabledReason?: "config" | "env";
    enabled: boolean;
}): string {
    if (status.enabled) {
        return "true";
    }

    return status.disabledReason === "env"
        ? "false (env)"
        : "false (config)";
}
