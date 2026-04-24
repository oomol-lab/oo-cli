import type { CliCommandDefinition } from "../contracts/cli.ts";

import process from "node:process";
import { z } from "zod";
import {
    attemptBundledSkillRefreshAfterSelfUpdate,
    resolveBundledSkillRefreshCommandPath,
} from "../self-update/bundled-skills.ts";
import {
    ensureSelfUpdateExecutableDirectoryOnPath,
    performSelfUpdateOperation,
    renderSelfUpdateLockBusyMessage,
    resolveLatestSelfUpdateVersion,
    selfUpdateDevelopmentVersion,
} from "../self-update/core.ts";
import { detectInstallationMethodFromExecPath } from "../self-update/installation.ts";
import { resolveSelfUpdateModifyPath } from "../self-update/modify-path-preference.ts";
import { writeSelfUpdatePathNoteIfNeeded } from "./self-update-output.ts";
import { SelfUpdateProgressReporter } from "./self-update-progress.ts";
import { writeLine } from "./shared/output.ts";

const updateCommandInputSchema = z.object({
    modifyPath: z.boolean().default(true),
});

export const updateCommand: CliCommandDefinition<
    z.infer<typeof updateCommandInputSchema>
> = {
    name: "update",
    aliases: ["upgrade"],
    summaryKey: "commands.update.summary",
    descriptionKey: "commands.update.description",
    options: [
        {
            name: "modifyPath",
            longFlag: "--no-modify-path",
            descriptionKey: "options.noModifyPath",
        },
    ],
    inputSchema: updateCommandInputSchema,
    handler: async (input, context) => {
        const effectiveModifyPath = resolveSelfUpdateModifyPath({
            env: context.env,
            modifyPathFlag: input.modifyPath,
        });

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
                await attemptBundledSkillRefreshAfterSelfUpdate({
                    commandPath: await resolveBundledSkillRefreshCommandPath({
                        env: context.env,
                        platform: process.platform,
                        version: context.version,
                    }),
                    runtime: {
                        env: context.env,
                        logger: context.logger,
                        ...context.selfUpdateRuntime,
                    },
                });
                const { executableDirectory, pathConfiguration }
                    = await ensureSelfUpdateExecutableDirectoryOnPath({
                        modifyPath: effectiveModifyPath,
                        runtime: {
                            env: context.env,
                            logger: context.logger,
                            platform: process.platform,
                            ...context.selfUpdateRuntime,
                        },
                    });
                progressReporter?.finish();
                writeLine(
                    context.stdout,
                    context.translator.t("checkUpdate.upToDate", {
                        version: context.version,
                    }),
                );
                writeSelfUpdatePathNoteIfNeeded({
                    executableDirectory,
                    pathConfiguration,
                    stdout: context.stdout,
                    translator: context.translator,
                });
                return;
            }

            const result = await performSelfUpdateOperation({
                currentVersion: context.version,
                forceReinstall: true,
                modifyPath: effectiveModifyPath,
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
                writeSelfUpdatePathNoteIfNeeded({
                    executableDirectory: result.executableDirectory,
                    pathConfiguration: result.pathConfiguration,
                    stdout: context.stdout,
                    translator: context.translator,
                });
                return;
            }

            writeLine(
                context.stdout,
                context.translator.t("selfUpdate.update.success", {
                    currentVersion: context.version,
                    version: latestVersion,
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
