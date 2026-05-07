import type { CliExecutionContext } from "../contracts/cli.ts";
import type { SelfUpdatePathConfigurationResult } from "../contracts/self-update.ts";

import { isSemver } from "../semver.ts";

export function classifyTelemetryVersionKind(
    version: string,
): "invalid" | "prerelease" | "stable" {
    if (!isSemver(version)) {
        return "invalid";
    }

    const versionWithoutBuild = version.split("+")[0]!;

    return versionWithoutBuild.includes("-") ? "prerelease" : "stable";
}

export function recordSelfUpdatePathTelemetry(
    telemetry: CliExecutionContext["telemetry"],
    pathConfiguration: SelfUpdatePathConfigurationResult,
): void {
    telemetry?.recordProperties({
        path_modified: pathConfiguration.status === "configured"
            || pathConfiguration.status === "partial-configured",
    });
}
