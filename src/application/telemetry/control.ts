import type { Logger } from "pino";

import type { CliExecutionContext } from "../contracts/cli.ts";
import type { AppSettings } from "../schemas/settings.ts";
import type { TelemetryEffectiveStatus } from "./status.ts";
import { readFile } from "node:fs/promises";
import { parse as parseToml } from "smol-toml";
import { settingsFileReadSchema } from "../schemas/settings.ts";
import { purgeTelemetryOutboxIfExists } from "./outbox.ts";
import { resolveTelemetryEffectiveStatus } from "./status.ts";

export function disableTelemetryForCurrentInvocation(
    context: CliExecutionContext,
): void {
    context.telemetry?.suppressCurrentInvocation();

    if (context.telemetry === undefined) {
        return;
    }

    try {
        purgeTelemetryOutboxIfExists(
            context.telemetry.directoryPath,
            context.logger,
        );
    }
    catch (error) {
        context.logger.debug(
            {
                err: error,
            },
            "Telemetry outbox purge failed silently after telemetry was disabled.",
        );
    }
}

export async function resolveTelemetryStatusFromSettingsFile(options: {
    env: Record<string, string | undefined>;
    logger?: Logger;
    settings?: AppSettings;
    settingsFilePath: string;
}): Promise<TelemetryEffectiveStatus> {
    const settings = options.settings
        ?? await readTelemetrySettingsFile(options.settingsFilePath, options.logger);

    return resolveTelemetryEffectiveStatus({
        env: options.env,
        settings,
    });
}

export async function readTelemetrySettingsFile(
    settingsFilePath: string,
    logger?: Logger,
): Promise<AppSettings> {
    try {
        const content = await readFile(settingsFilePath, "utf8");
        const rawSettings = parseToml(content);
        const parsed = settingsFileReadSchema.safeParse(rawSettings);

        if (parsed.success) {
            return parsed.data;
        }

        const telemetryEnabled = readRawTelemetryEnabled(rawSettings);

        if (telemetryEnabled !== undefined) {
            logger?.debug(
                {
                    issueCount: parsed.error.issues.length,
                    path: settingsFilePath,
                },
                "Telemetry settings read preserved telemetry.enabled from an unsupported settings shape.",
            );
            return {
                telemetry: {
                    enabled: telemetryEnabled,
                },
            };
        }

        logger?.debug(
            {
                issueCount: parsed.error.issues.length,
                path: settingsFilePath,
            },
            "Telemetry settings read ignored an unsupported settings shape.",
        );
        return {};
    }
    catch (error) {
        logger?.debug(
            {
                err: error,
                path: settingsFilePath,
            },
            "Telemetry settings read fell back to the default enabled state.",
        );
        return {};
    }
}

function readRawTelemetryEnabled(rawSettings: unknown): boolean | undefined {
    if (!isPlainObjectRecord(rawSettings)) {
        return undefined;
    }

    const telemetry = rawSettings.telemetry;

    if (!isPlainObjectRecord(telemetry)) {
        return undefined;
    }

    return typeof telemetry.enabled === "boolean"
        ? telemetry.enabled
        : undefined;
}

function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
    return value !== null
        && typeof value === "object"
        && !Array.isArray(value);
}
