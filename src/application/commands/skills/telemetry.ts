import type {
    CliTelemetryPropertyValue,
} from "../../contracts/cli.ts";

import { bucketTelemetryCount } from "../../telemetry/buckets.ts";

const telemetrySampleSize = 5;

export function createSkillIdsTelemetryProperties(
    skillIds: readonly string[],
): Record<string, CliTelemetryPropertyValue> {
    return createArrayTelemetryProperties("skill_ids", skillIds);
}

export function createPackageNamesTelemetryProperties(
    packageNames: readonly string[],
): Record<string, CliTelemetryPropertyValue> {
    return createArrayTelemetryProperties("package_names", packageNames);
}

function createArrayTelemetryProperties(
    prefix: string,
    values: readonly string[],
): Record<string, CliTelemetryPropertyValue> {
    return {
        [`${prefix}_count_bucket`]: bucketTelemetryCount(values.length),
        [`${prefix}_sample`]: values.slice(0, telemetrySampleSize),
        [`${prefix}_truncated`]: values.length > telemetrySampleSize,
    };
}
