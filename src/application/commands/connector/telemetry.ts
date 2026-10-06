import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { ConnectorTargetKind } from "./target.ts";

import { CliUserError } from "../../contracts/cli.ts";

/**
 * Drops the command event for a call the OOMOL connector backend completed
 * successfully: the backend already records such calls, so the CLI event
 * would only duplicate it. Failures, dry runs, and self-hosted targets are
 * still reported, because the backend never sees a self-hosted call and may
 * not see a request that failed before reaching it.
 */
export function suppressBackendRecordedConnectorTelemetry(
    targetKind: ConnectorTargetKind,
    telemetry: CliExecutionContext["telemetry"],
): void {
    if (targetKind === "oomol") {
        telemetry?.suppressCurrentInvocation();
    }
}

export function recordConnectorFailureTelemetry(
    error: unknown,
    telemetry: CliExecutionContext["telemetry"],
): void {
    if (!(error instanceof CliUserError)) {
        return;
    }

    const status = error.params?.status;
    const errorCode = error.params?.errorCode;
    const properties: { error_code?: string; http_status?: number } = {};

    if (typeof status === "number") {
        properties.http_status = status;
    }

    if (typeof errorCode === "string" && errorCode !== "") {
        properties.error_code = errorCode;
    }

    if (Object.keys(properties).length > 0) {
        telemetry?.recordProperties(properties);
    }
}
