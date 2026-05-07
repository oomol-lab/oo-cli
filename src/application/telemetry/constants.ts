export const telemetryInternalCommand = "__flush_telemetry";
export const telemetryInternalEnvKey = "OO_TELEMETRY_INTERNAL";
export const telemetryDisabledEnvKey = "OO_TELEMETRY_DISABLED";
export const doNotTrackEnvKey = "DO_NOT_TRACK";

export const telemetryDatabaseFileName = "telemetry.sqlite";
export const telemetryDeviceIdFileName = "device-id";

export const telemetryEndpoint = "https://t.oomol.com/batch";
export const telemetryPostHogApiKey = "phc_AQhAZ9VYPH9JqgeMtYHc67aZedcQG2zGFTCSJAYrzB7X";
export const telemetrySchemaVersion = 1;

export const telemetryEventName = "cli_command_executed";
export const telemetryMaxEventBytes = 4096;
export const telemetryDatabaseMaxBytes = 50 * 1024 * 1024;
export const telemetrySqliteBusyTimeoutMs = 20;
export const telemetryLeaseTtlMs = 3 * 60 * 1000;
export const telemetryMaxAttempts = 2;
export const telemetryMaxEventAgeMs = 7 * 24 * 60 * 60 * 1000;
export const telemetryChunkMaxEvents = 100;
export const telemetryChunkMaxBytes = 1024 * 1024;
export const telemetryLeaseMaxEvents = 500;
export const telemetryRequestTimeoutMs = 10_000;
export const telemetrySpawnIntervalMs = 60 * 1000;
export const telemetrySpawnThresholdEvents = 20;
export const telemetryBaseBackoffMs = 60 * 1000;
export const telemetryMaxBackoffMs = 24 * 60 * 60 * 1000;
