import type { AppSettings } from "../schemas/settings.ts";

import { readEnvBoolean } from "../shared/env-boolean.ts";
import {
    doNotTrackEnvKey,
    telemetryDisabledEnvKey,
} from "./constants.ts";

export type TelemetryDisabledReason = "config" | "env";

export interface TelemetryEffectiveStatus {
    enabled: boolean;
    disabledReason?: TelemetryDisabledReason;
}

export function resolveTelemetryEffectiveStatus(options: {
    env: Record<string, string | undefined>;
    settings: AppSettings;
}): TelemetryEffectiveStatus {
    if (isTelemetryDisabledByEnv(options.env)) {
        return {
            disabledReason: "env",
            enabled: false,
        };
    }

    if (options.settings.telemetry?.enabled === false) {
        return {
            disabledReason: "config",
            enabled: false,
        };
    }

    return { enabled: true };
}

export function isTelemetryDisabledByEnv(
    env: Record<string, string | undefined>,
): boolean {
    return readEnvBoolean(env[telemetryDisabledEnvKey]) === true
        || readEnvBoolean(env[doNotTrackEnvKey]) === true;
}
