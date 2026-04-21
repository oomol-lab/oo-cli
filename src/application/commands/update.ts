import type { CliCommandDefinition } from "../contracts/cli.ts";

import process from "node:process";
import { z } from "zod";
import {
    performSelfUpdateOperation,
    renderSelfUpdateLockBusyMessage,
    resolveLatestSelfUpdateVersion,
    selfUpdateDevelopmentVersion,
} from "../self-update/core.ts";
import { detectInstallationMethodFromExecPath } from "../self-update/installation.ts";
import { SelfUpdateProgressReporter } from "./self-update-progress.ts";
import { writeLine } from "./shared/output.ts";

export const updateCommand: CliCommandDefinition = {
    name: "update",
    aliases: ["upgrade"],
    summaryKey: "commands.update.summary",
    descriptionKey: "commands.update.description",
    inputSchema: z.object({}),
    handler: async (_, context) => {
        if (context.version === selfUpdateDevelopmentVersion) {
            writeLine(
                context.stdout,
                context.translator.t("selfUpdate.unsupportedDevelopmentVersion", {
                    version: context.version,
                }),
            );
            return;
        }

        const progressReporter = context.stderr.isTTY === true
            ? new SelfUpdateProgressReporter(
                    context.stderr,
                    "update",
                    context.translator,
                )
            : undefined;

        try {
            progressReporter?.setStage("resolve");

            const latestVersion = await resolveLatestSelfUpdateVersion({
                currentVersion: context.version,
                fetcher: context.fetcher,
                logger: context.logger,
            });
            progressReporter?.setStage("resolve", {
                version: latestVersion,
            });

            if (
                latestVersion === context.version
                && detectInstallationMethodFromExecPath({
                    env: context.env,
                    execPath: context.execPath,
                    platform: process.platform,
                }).method === "native"
            ) {
                progressReporter?.finish();
                writeLine(
                    context.stdout,
                    context.translator.t("checkUpdate.upToDate", {
                        version: context.version,
                    }),
                );
                return;
            }

            const result = await performSelfUpdateOperation({
                currentVersion: context.version,
                forceReinstall: true,
                reportStage: progressReporter?.createReportStage(),
                runtime: {
                    arch: process.arch,
                    env: context.env,
                    execPath: context.execPath,
                    fetcher: context.fetcher,
                    logger: context.logger,
                    platform: process.platform,
                    processId: process.pid,
                },
                targetVersion: latestVersion,
            });

            if (result.status === "busy") {
                progressReporter?.abort();
                writeLine(
                    context.stdout,
                    renderSelfUpdateLockBusyMessage({
                        ownerPid: result.ownerPid,
                        translator: context.translator,
                    }),
                );
                return;
            }

            progressReporter?.finish();

            if (latestVersion === context.version) {
                writeLine(
                    context.stdout,
                    context.translator.t("checkUpdate.upToDate", {
                        version: context.version,
                    }),
                );
                return;
            }

            writeLine(
                context.stdout,
                context.translator.t("selfUpdate.update.success", {
                    currentVersion: context.version,
                    version: latestVersion,
                }),
            );
        }
        catch (error) {
            progressReporter?.abort();
            throw error;
        }
    },
};
