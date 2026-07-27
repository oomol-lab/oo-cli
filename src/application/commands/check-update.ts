import type {
    CliCommandContext,
    CliCommandDefinition,
    CliExecutionContext,
} from "../contracts/cli.ts";
import type { CliUpdateCheckResult } from "../update/update-notifier.ts";

import { z } from "zod";
import { CliUserError } from "../contracts/cli.ts";
import { isSelfUpdateDisabledByEnv } from "../self-update/self-update-disabled-preference.ts";
import {
    checkForCliUpdate,
    cliUpdateCommand,
    renderCliUpdateNotice,
} from "../update/update-notifier.ts";
import { classifyTelemetryVersionKind } from "./self-update-telemetry.ts";

interface CheckUpdateJsonPayload {
    status: "update-available" | "up-to-date" | "failed";
    currentVersion: string;
    latestVersion?: string;
    message?: string;
}

const checkUpdateFailureMessages = {
    "invalid-current-version": "Current CLI version is not a recognized semantic version.",
    "latest-version-unavailable": "Unable to determine the latest CLI version.",
    "unexpected-error": "Update check encountered an unexpected error.",
} as const satisfies Record<
    Extract<CliUpdateCheckResult, { status: "failed" }>["reason"],
    string
>;

export const checkUpdateCommand: CliCommandDefinition = {
    name: "check-update",
    summaryKey: "commands.checkUpdate.summary",
    descriptionKey: "commands.checkUpdate.description",
    output: "standard",
    inputSchema: z.object({}),
    handler: async (_input, context) => {
        // OO_NO_SELF_UPDATE disables the update machinery, including the remote
        // release check that hits the hardcoded static.oomol.com source.
        if (isSelfUpdateDisabledByEnv(context.env)) {
            throw new CliUserError("errors.selfUpdate.disabledByEnv", 1);
        }

        context.telemetry?.recordProperties({
            version_kind: classifyTelemetryVersionKind(context.version),
        });

        const result = await checkForCliUpdate(context);

        if (context.output.format === "json") {
            handleCheckUpdateJson(result, context);
            return;
        }

        handleCheckUpdateText(result, context);
    },
};

function handleCheckUpdateJson(
    result: CliUpdateCheckResult,
    context: CliCommandContext,
): void {
    const payload = buildCheckUpdateJsonPayload(result, context.version);

    context.telemetry?.recordProperties({
        update_available: payload.status === "update-available",
    });

    if (payload.status === "update-available") {
        context.logger.info(
            {
                currentVersion: context.version,
                latestVersion: payload.latestVersion,
            },
            "CLI update notice emitted.",
        );
    }

    context.output.emitJson(payload);
}

function buildCheckUpdateJsonPayload(
    result: CliUpdateCheckResult,
    currentVersion: string,
): CheckUpdateJsonPayload {
    switch (result.status) {
        case "update-available":
            return {
                status: "update-available",
                currentVersion,
                latestVersion: result.latestVersion,
            };
        case "up-to-date":
            return {
                status: "up-to-date",
                currentVersion,
                latestVersion: result.latestVersion,
            };
        case "failed":
            return {
                status: "failed",
                currentVersion,
                message: checkUpdateFailureMessages[result.reason],
            };
    }
}

function handleCheckUpdateText(
    result: CliUpdateCheckResult,
    context: CliExecutionContext,
): void {
    switch (result.status) {
        case "failed":
            context.telemetry?.recordProperties({ update_available: false });
            switch (result.reason) {
                case "invalid-current-version":
                    context.stdout.write(
                        `${context.translator.t("checkUpdate.unsupportedVersion", {
                            version: context.version,
                        })}\n`,
                    );
                    return;
                case "latest-version-unavailable":
                    context.stdout.write(
                        `${context.translator.t("checkUpdate.unavailable")}\n`,
                    );
                    return;
                case "unexpected-error":
                    throw new CliUserError("errors.checkUpdate.failed", 1);
            }
            return;
        case "up-to-date":
            context.telemetry?.recordProperties({ update_available: false });
            context.stdout.write(
                `${context.translator.t("checkUpdate.upToDate", {
                    version: context.version,
                })}\n`,
            );
            return;
        case "update-available":
            context.telemetry?.recordProperties({ update_available: true });
            context.stdout.write(
                renderCliUpdateNotice({
                    context,
                    latestVersion: result.latestVersion,
                    updateCommand: cliUpdateCommand,
                    writer: context.stdout,
                }),
            );
            context.logger.info(
                {
                    currentVersion: context.version,
                    latestVersion: result.latestVersion,
                },
                "CLI update notice emitted.",
            );
    }
}
