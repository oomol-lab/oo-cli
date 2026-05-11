import type { CliCommandDefinition } from "../contracts/cli.ts";

import type { SelfUpdateCommandResolutionResult, SelfUpdatePathConfigurationResult } from "../contracts/self-update.ts";
import process from "node:process";
import { z } from "zod";
import {
    attemptManagedSkillInstall,
    attemptManagedSkillUpdate,
    isManagedVersionExecutableInstalled,
    resolveManagedSkillInstallCommandPath,
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
import { resolveSelfUpdateShowPathShadowingWarning } from "../self-update/path-shadowing-warning-preference.ts";
import { writeSelfUpdatePathNoteIfNeeded } from "./self-update-output.ts";
import { SelfUpdateProgressReporter } from "./self-update-progress.ts";
import {
    classifyTelemetryVersionKind,
    recordSelfUpdatePathTelemetry,
} from "./self-update-telemetry.ts";
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
        context.telemetry?.recordProperties({
            force: true,
            path_modified: false,
            version_kind: classifyTelemetryVersionKind(context.version),
        });

        const effectiveModifyPath = resolveSelfUpdateModifyPath({
            env: context.env,
            modifyPathFlag: input.modifyPath,
        });
        const showPathShadowingWarning = resolveSelfUpdateShowPathShadowingWarning({
            env: context.env,
        });
        const writePathNote = (pathNoteResult: {
            commandResolution: SelfUpdateCommandResolutionResult;
            executableDirectory: string;
            pathConfiguration: SelfUpdatePathConfigurationResult;
        }): void => {
            writeSelfUpdatePathNoteIfNeeded({
                ...pathNoteResult,
                showPathShadowingWarning,
                stdout: context.stdout,
                translator: context.translator,
            });
        };

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
            context.telemetry?.recordProperties({
                update_available: latestVersion !== context.version,
                version_kind: classifyTelemetryVersionKind(latestVersion),
            });

            if (
                latestVersion === context.version
                && detectInstallationMethodFromExecPath({
                    env: context.env,
                    execPath: context.execPath,
                    platform: process.platform,
                }).method === "native"
                && await isManagedVersionExecutableInstalled({
                    env: context.env,
                    platform: process.platform,
                    version: context.version,
                })
            ) {
                const managedSkillCommandPath = await resolveManagedSkillInstallCommandPath({
                    env: context.env,
                    platform: process.platform,
                    version: context.version,
                });

                progressReporter?.setStage("skillsUpdate", {
                    version: context.version,
                });
                await attemptManagedSkillInstall({
                    commandPath: managedSkillCommandPath,
                    runtime: {
                        env: context.env,
                        logger: context.logger,
                        ...context.selfUpdateRuntime,
                    },
                });
                await attemptManagedSkillUpdate({
                    commandPath: managedSkillCommandPath,
                    runtime: {
                        env: context.env,
                        logger: context.logger,
                        ...context.selfUpdateRuntime,
                    },
                });
                const { commandResolution, executableDirectory, pathConfiguration }
                    = await ensureSelfUpdateExecutableDirectoryOnPath({
                        modifyPath: effectiveModifyPath,
                        runtime: {
                            env: context.env,
                            logger: context.logger,
                            platform: process.platform,
                            ...context.selfUpdateRuntime,
                        },
                    });
                recordSelfUpdatePathTelemetry(context.telemetry, pathConfiguration);
                progressReporter?.finish();
                writeLine(
                    context.stdout,
                    context.translator.t("checkUpdate.upToDate", {
                        version: context.version,
                    }),
                );
                writePathNote({
                    commandResolution,
                    executableDirectory,
                    pathConfiguration,
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

            recordSelfUpdatePathTelemetry(
                context.telemetry,
                result.pathConfiguration,
            );

            progressReporter?.finish();

            if (latestVersion === context.version) {
                writeLine(
                    context.stdout,
                    context.translator.t("checkUpdate.upToDate", {
                        version: context.version,
                    }),
                );
                writePathNote({
                    commandResolution: result.commandResolution,
                    executableDirectory: result.executableDirectory,
                    pathConfiguration: result.pathConfiguration,
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
            writePathNote({
                commandResolution: result.commandResolution,
                executableDirectory: result.executableDirectory,
                pathConfiguration: result.pathConfiguration,
            });
        }
        catch (error) {
            progressReporter?.abort();
            throw error;
        }
    },
};
