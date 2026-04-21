import type { CliCommandDefinition } from "../contracts/cli.ts";

import process from "node:process";
import { z } from "zod";
import { CliUserError } from "../contracts/cli.ts";
import {
    performSelfUpdateOperation,
    renderSelfUpdateLockBusyMessage,
    resolveLatestSelfUpdateVersion,
    selfUpdateDevelopmentVersion,
} from "../self-update/core.ts";
import { isSemver } from "../semver.ts";
import { SelfUpdateProgressReporter } from "./self-update-progress.ts";
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

        if (input.version !== undefined && !isSemver(input.version)) {
            throw new CliUserError("errors.selfUpdate.invalidTargetVersion", 2, {
                version: input.version,
            });
        }

        const progressReporter = context.stderr.isTTY === true
            ? new SelfUpdateProgressReporter(
                    context.stderr,
                    "install",
                    context.translator,
                )
            : undefined;

        try {
            if (input.version === undefined) {
                progressReporter?.setStage("resolve");
            }

            const targetVersion = input.version
                ?? await resolveLatestSelfUpdateVersion({
                    currentVersion: context.version,
                    fetcher: context.fetcher,
                    logger: context.logger,
                });

            if (input.version === undefined) {
                progressReporter?.setStage("resolve", {
                    version: targetVersion,
                });
            }

            const result = await performSelfUpdateOperation({
                currentVersion: context.version,
                forceReinstall: input.force,
                reportStage: progressReporter?.createReportStage(),
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
        }
        catch (error) {
            progressReporter?.abort();
            throw error;
        }
    },
};
