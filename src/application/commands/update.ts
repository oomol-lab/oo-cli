import type { CliCommandDefinition } from "../contracts/cli.ts";

import process from "node:process";
import { z } from "zod";
import {
    performSelfUpdateOperation,
    renderSelfUpdateLockBusyMessage,
    resolveLatestSelfUpdateVersion,
    selfUpdateDevelopmentVersion,
} from "../self-update/core.ts";
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

        const latestVersion = await resolveLatestSelfUpdateVersion({
            currentVersion: context.version,
            fetcher: context.fetcher,
            logger: context.logger,
        });
        const result = await performSelfUpdateOperation({
            currentVersion: context.version,
            forceReinstall: true,
            runtime: {
                arch: process.arch,
                env: context.env,
                execPath: process.execPath,
                fetcher: context.fetcher,
                logger: context.logger,
                platform: process.platform,
                processId: process.pid,
            },
            targetVersion: latestVersion,
        });

        if (result.status === "busy") {
            writeLine(
                context.stdout,
                renderSelfUpdateLockBusyMessage(result.ownerPid),
            );
            return;
        }

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
    },
};
