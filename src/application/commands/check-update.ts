import type { CliCommandDefinition } from "../contracts/cli.ts";

import { z } from "zod";
import { CliUserError } from "../contracts/cli.ts";
import {
    checkForCliUpdate,
    renderCliUpdateNotice,
    resolvePackageManagerUpgradeCommand,
} from "../update/update-notifier.ts";

export const checkUpdateCommand: CliCommandDefinition = {
    name: "check-update",
    summaryKey: "commands.checkUpdate.summary",
    descriptionKey: "commands.checkUpdate.description",
    inputSchema: z.object({}),
    handler: async (_, context) => {
        const result = await checkForCliUpdate(context);

        switch (result.status) {
            case "failed": {
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
            }
            case "up-to-date":
                context.stdout.write(
                    `${context.translator.t("checkUpdate.upToDate", {
                        version: context.version,
                    })}\n`,
                );
                return;
            case "update-available":
                context.stdout.write(
                    renderCliUpdateNotice({
                        context,
                        latestVersion: result.latestVersion,
                        updateCommand: resolvePackageManagerUpgradeCommand(
                            context.env,
                            context.packageName,
                        ),
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
    },
};
