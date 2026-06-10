import type { CliExecutionContext } from "../../contracts/cli.ts";

import { CliUserError } from "../../contracts/cli.ts";

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
