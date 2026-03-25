import type { AuthStore } from "../contracts/auth-store.ts";
import type { CacheStore } from "../contracts/cache.ts";

import type {
    CliExecutionContext,
    Fetcher,
    InteractiveInput,
    Writer,
} from "../contracts/cli.ts";
import type { SettingsStore } from "../contracts/settings-store.ts";
import type { LogCategory } from "../logging/log-categories.ts";
import process from "node:process";
import packageManifest from "../../../package.json" with { type: "json" };
import { SqliteCacheStore } from "../../adapters/cache/sqlite-cache.ts";
import { CommanderCliAdapter } from "../../adapters/commander/commander-cli-adapter.ts";
import { StaticCompletionRenderer } from "../../adapters/completion/static-completion-renderer.ts";
import { createCliLogger } from "../../adapters/logging/create-cli-logger.ts";
import { FileAuthStore } from "../../adapters/store/file-auth-store.ts";
import { FileSettingsStore } from "../../adapters/store/file-settings-store.ts";
import { resolveStorePaths } from "../../adapters/store/store-path.ts";
import {
    detectCliLanguageFlag,
    parseExplicitLocale,
    resolvePreferredLocale,
} from "../../i18n/locale.ts";
import { createTranslator } from "../../i18n/translator.ts";
import { createCliCatalog } from "../commands/catalog.ts";
import { APP_NAME } from "../config/app-config.ts";
import {
    formatCliVersionText,
    resolveCliBuildInfo,
} from "../config/build-info.ts";
import { CliUserError } from "../contracts/cli.ts";
import { logCategory } from "../logging/log-categories.ts";
import { withCategory, withErrorKey } from "../logging/log-fields.ts";
import { maybeNotifyAboutCliUpdate } from "../update/update-notifier.ts";

export interface CliInvocation {
    argv: readonly string[];
    authStore?: AuthStore;
    cacheStore?: CacheStore;
    cwd: string;
    env: Record<string, string | undefined>;
    fetcher?: Fetcher;
    packageName?: string;
    stdin?: InteractiveInput;
    stdout: Writer;
    stderr: Writer;
    settingsStore?: SettingsStore;
    systemLocale?: string;
    version?: string;
}

export async function runCli(argv: string[]): Promise<number> {
    return executeCli({
        argv,
        cwd: process.cwd(),
        env: process.env,
        fetcher: fetch,
        stdin: process.stdin,
        stdout: process.stdout,
        stderr: process.stderr,
        systemLocale: getSystemLocale(),
    });
}

export async function executeCli(invocation: CliInvocation): Promise<number> {
    const debugPathEnabled = hasCliDebugFlag(invocation.argv);
    const rawCliLanguage = detectCliLanguageFlag(invocation.argv);
    const parsedCliLanguage = parseExplicitLocale(rawCliLanguage);
    const storePaths = resolveStorePaths({
        appName: APP_NAME,
        env: invocation.env,
        platform: process.platform,
    });
    const bootstrapTranslator = createTranslator(
        resolvePreferredLocale({
            cliFlag: parsedCliLanguage,
            env: invocation.env,
            systemLocale: invocation.systemLocale,
        }),
    );
    let translator = bootstrapTranslator;
    let exitCode = 0;
    let cacheStore: CacheStore | undefined;
    const loggerHandle = createCliLogger({
        appName: APP_NAME,
        env: invocation.env,
        logDirectoryPath: storePaths.logDirectoryPath,
    });
    const { logger, logFilePath } = loggerHandle;

    logger.info(
        {
            argv: [...invocation.argv],
            command: invocation.argv.join(" "),
        },
        "CLI command received.",
    );

    try {
        if (rawCliLanguage !== undefined && parsedCliLanguage === undefined) {
            invocation.stderr.write(
                `${bootstrapTranslator.t("errors.lang.invalidFlag", {
                    value: rawCliLanguage,
                })}\n`,
            );

            exitCode = 2;
            return exitCode;
        }

        cacheStore
            = invocation.cacheStore
                ?? new SqliteCacheStore(storePaths.cacheFilePath, logger);

        const settingsStore
            = invocation.settingsStore
                ?? new FileSettingsStore({
                    filePath: storePaths.settingsFilePath,
                    logger,
                });
        const authStore
            = invocation.authStore
                ?? new FileAuthStore({
                    filePath: storePaths.authFilePath,
                    logger,
                });
        const settings = await settingsStore.read();

        translator = createTranslator(
            resolvePreferredLocale({
                cliFlag: parsedCliLanguage,
                storedLocale: settings.lang,
                env: invocation.env,
                systemLocale: invocation.systemLocale,
            }),
        );
        const catalog = createCliCatalog();
        const completionRenderer = new StaticCompletionRenderer(translator);
        const packageName = invocation.packageName ?? packageManifest.name;
        const buildInfo = resolveCliBuildInfo(packageManifest.version);
        const version = invocation.version ?? buildInfo.version;

        logger.debug(
            {
                commandCount: invocation.argv.length,
                cwd: invocation.cwd,
                version,
            },
            "CLI invocation started.",
        );

        const context: CliExecutionContext = {
            authStore,
            cacheStore,
            currentLogFilePath: logFilePath,
            fetcher: invocation.fetcher ?? fetch,
            cwd: invocation.cwd,
            env: invocation.env,
            stdin: invocation.stdin ?? process.stdin,
            logger,
            packageName,
            settingsStore,
            stdout: invocation.stdout,
            stderr: invocation.stderr,
            translator,
            completionRenderer,
            catalog,
            version,
            versionText: formatCliVersionText(
                {
                    ...buildInfo,
                    version,
                },
                translator,
            ),
        };
        const adapter = new CommanderCliAdapter();

        exitCode = await adapter.run({
            argv: invocation.argv,
            catalog,
            context,
        });

        if (exitCode === 0) {
            await maybeNotifyAboutCliUpdate({
                argv: invocation.argv,
                context,
            });
        }
    }
    catch (error) {
        if (error instanceof CliUserError) {
            logger.debug(
                {
                    ...withCategory(resolveCliErrorLogCategory(error)),
                    err: error,
                    exitCode: error.exitCode,
                    ...withErrorKey(error.key),
                },
                "CLI invocation failed with a user error.",
            );
        }
        else {
            logger.error(
                {
                    ...withCategory(logCategory.systemError),
                    err: error,
                },
                "CLI invocation failed unexpectedly.",
            );
        }

        exitCode = writeBootstrapError(error, translator, invocation.stderr);
    }
    finally {
        if (cacheStore) {
            try {
                cacheStore.close();
            }
            catch (error) {
                logger.error(
                    {
                        ...withCategory(logCategory.systemError),
                        err: error,
                    },
                    "Failed to close the cache store cleanly.",
                );
                invocation.stderr.write(
                    `${translator.t("errors.unexpected", {
                        message: error instanceof Error ? error.message : String(error),
                    })}\n`,
                );

                exitCode = 1;
            }
        }

        logger.debug(
            {
                exitCode,
            },
            "CLI invocation completed.",
        );
        loggerHandle.close();

        if (debugPathEnabled) {
            invocation.stderr.write(`${logFilePath}\n`);
        }
    }

    return exitCode;
}

function hasCliDebugFlag(argv: readonly string[]): boolean {
    return argv.includes("--debug");
}

function resolveCliErrorLogCategory(error: CliUserError): LogCategory {
    return isSystemCliUserError(error)
        ? logCategory.systemError
        : logCategory.userError;
}

function isSystemCliUserError(error: CliUserError): boolean {
    return error.key.startsWith("errors.store.")
        || error.key.startsWith("errors.authStore.")
        || error.key === "errors.cloudTaskRun.dataReadFailed"
        || error.key === "errors.unexpected"
        || error.key.endsWith(".invalidResponse")
        || error.key.endsWith(".requestError")
        || error.key.endsWith(".requestFailed");
}

function writeBootstrapError(
    error: unknown,
    translator: ReturnType<typeof createTranslator>,
    stderr: Writer,
): number {
    if (error instanceof CliUserError) {
        stderr.write(`${translator.t(error.key, error.params)}\n`);
        return error.exitCode;
    }

    stderr.write(
        `${translator.t("errors.unexpected", {
            message: error instanceof Error ? error.message : String(error),
        })}\n`,
    );

    return 1;
}

function getSystemLocale(): string | undefined {
    try {
        return Intl.DateTimeFormat().resolvedOptions().locale;
    }
    catch {
        return undefined;
    }
}
