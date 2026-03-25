import type { AuthStore } from "../contracts/auth-store.ts";
import type { CacheStore } from "../contracts/cache.ts";

import type {
    CliExecutionContext,
    Fetcher,
    InteractiveInput,
    Writer,
} from "../contracts/cli.ts";
import type { SettingsStore } from "../contracts/settings-store.ts";
import process from "node:process";
import pino from "pino";
import packageManifest from "../../../package.json" with { type: "json" };
import { SqliteCacheStore } from "../../adapters/cache/sqlite-cache.ts";
import { CommanderCliAdapter } from "../../adapters/commander/commander-cli-adapter.ts";
import { StaticCompletionRenderer } from "../../adapters/completion/static-completion-renderer.ts";
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
    const rawCliLanguage = detectCliLanguageFlag(invocation.argv);
    const parsedCliLanguage = parseExplicitLocale(rawCliLanguage);
    const bootstrapTranslator = createTranslator(
        resolvePreferredLocale({
            cliFlag: parsedCliLanguage,
            env: invocation.env,
            systemLocale: invocation.systemLocale,
        }),
    );

    if (rawCliLanguage !== undefined && parsedCliLanguage === undefined) {
        invocation.stderr.write(
            `${bootstrapTranslator.t("errors.lang.invalidFlag", {
                value: rawCliLanguage,
            })}\n`,
        );

        return 2;
    }

    const storePaths = resolveStorePaths({
        appName: APP_NAME,
        env: invocation.env,
        platform: process.platform,
    });
    let translator = bootstrapTranslator;
    let exitCode = 0;
    let cacheStore: CacheStore | undefined;

    try {
        cacheStore
            = invocation.cacheStore
                ?? new SqliteCacheStore(storePaths.cacheFilePath);

        const settingsStore
            = invocation.settingsStore
                ?? new FileSettingsStore({
                    filePath: storePaths.settingsFilePath,
                });
        const authStore
            = invocation.authStore
                ?? new FileAuthStore({
                    filePath: storePaths.authFilePath,
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
        const logger = pino({
            name: APP_NAME,
            level: invocation.env.OO_LOG_LEVEL ?? "silent",
        });
        const completionRenderer = new StaticCompletionRenderer(translator);
        const packageName = invocation.packageName ?? packageManifest.name;
        const buildInfo = resolveCliBuildInfo(packageManifest.version);
        const version = invocation.version ?? buildInfo.version;
        const context: CliExecutionContext = {
            authStore,
            cacheStore,
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
        exitCode = writeBootstrapError(error, translator, invocation.stderr);
    }
    finally {
        if (cacheStore) {
            try {
                cacheStore.close();
            }
            catch (error) {
                invocation.stderr.write(
                    `${translator.t("errors.unexpected", {
                        message: error instanceof Error ? error.message : String(error),
                    })}\n`,
                );

                exitCode = 1;
            }
        }
    }

    return exitCode;
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
