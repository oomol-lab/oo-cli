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
import { resolveSelfUpdateModifyPath } from "../self-update/modify-path-preference.ts";
import { isSemver } from "../semver.ts";
import { writeSelfUpdatePathNoteIfNeeded } from "./self-update-output.ts";
import { SelfUpdateProgressReporter } from "./self-update-progress.ts";
import { writeLine } from "./shared/output.ts";

const installCommandInputSchema = z.object({
    force: z.boolean().default(false),
    modifyPath: z.boolean().default(true),
    version: z.string().trim().min(1).optional(),
});

export const installCommand: CliCommandDefinition<
    z.infer<typeof installCommandInputSchema>
> = {
    name: "install",
    hidden: true,
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
        {
            name: "modifyPath",
            longFlag: "--no-modify-path",
            descriptionKey: "options.noModifyPath",
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
                modifyPath: resolveSelfUpdateModifyPath({
                    env: context.env,
                    modifyPathFlag: input.modifyPath,
                }),
                reportStage: progressReporter?.createReportStage(),
                runtime: {
                    arch: process.arch,
                    env: context.env,
                    execPath: context.execPath,
                    fetcher: context.fetcher,
                    logger: context.logger,
                    platform: process.platform,
                    processId: process.pid,
                    ...context.selfUpdateRuntime,
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

            writeSelfUpdatePathNoteIfNeeded({
                executableDirectory: result.executableDirectory,
                pathConfiguration: result.pathConfiguration,
                stdout: context.stdout,
                translator: context.translator,
            });
        }
        catch (error) {
            progressReporter?.abort();
            throw error;
        }
    },
};
