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

const installCommandInputSchema = z.object({
    force: z.boolean().default(false),
    version: z.string().trim().min(1).optional(),
});

export const installCommand: CliCommandDefinition<
    z.infer<typeof installCommandInputSchema>
> = {
    name: "install",
    summaryKey: "commands.install.summary",
    descriptionKey: "commands.install.description",
    arguments: [
        {
            name: "version",
            descriptionKey: "arguments.install.version",
            required: false,
        },
    ],
    options: [
        {
            name: "force",
            longFlag: "--force",
            descriptionKey: "options.force",
        },
    ],
    inputSchema: installCommandInputSchema,
    handler: async (input, context) => {
        if (context.version === selfUpdateDevelopmentVersion) {
            writeLine(
                context.stdout,
                context.translator.t("selfUpdate.unsupportedDevelopmentVersion", {
                    version: context.version,
                }),
            );
            return;
        }

        const targetVersion = input.version
            ?? await resolveLatestSelfUpdateVersion({
                currentVersion: context.version,
                fetcher: context.fetcher,
                logger: context.logger,
            });
        const result = await performSelfUpdateOperation({
            currentVersion: context.version,
            forceReinstall: input.force,
            runtime: {
                arch: process.arch,
                env: context.env,
                execPath: process.execPath,
                fetcher: context.fetcher,
                logger: context.logger,
                platform: process.platform,
                processId: process.pid,
            },
            targetVersion,
        });

        if (result.status === "busy") {
            writeLine(
                context.stdout,
                renderSelfUpdateLockBusyMessage(result.ownerPid),
            );
            return;
        }

        writeLine(
            context.stdout,
            context.translator.t("selfUpdate.install.success", {
                version: result.targetVersion,
            }),
        );
        writeLine(
            context.stdout,
            context.translator.t("selfUpdate.install.executable", {
                path: result.executablePath,
            }),
        );

        if (!result.pathConfigured) {
            writeLine(
                context.stdout,
                context.translator.t("selfUpdate.install.pathNote", {
                    path: result.executableDirectory,
                }),
            );
        }
    },
};
