import type { CliCommandDefinition, CliExecutionContext } from "../contracts/cli.ts";

import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveRequestLanguage } from "../../i18n/locale.ts";
import { readDefaultTeam } from "../auth/default-team.ts";
import { readTrimmedEnv, requireIdentity } from "../auth/identity.ts";
import { CliUserError } from "../contracts/cli.ts";
import { setAccountFlowProject } from "../schemas/auth.ts";
import { createBrowserSignIn } from "./auth/web.ts";
import { installOpenFlowCommandRelease } from "./flow-artifact.ts";
import { openFlowCommandRelease } from "./flow-release.ts";
import { createDownloadProgressReporter } from "./shared/download-progress.ts";
import {
    requireValidTeamIdentity,
    resolveTeamIdentity,
    teamIdentityHeaders,
} from "./team/identity.ts";

const commandDirectoryEnvName = "OO_OPEN_FLOW_COMMAND_DIR";
const flowAccountEnvName = "OO_FLOW_ACCOUNT";
const commandArtifactVersion = 2;

interface CommandModule {
    readonly commandArtifactVersion: unknown;
    readonly runOpenFlowCommand: unknown;
}

interface OpenFlowInvocation {
    readonly args: readonly string[];
    readonly commandIndex: number;
}

interface OpenFlowCloudSession {
    readonly accountId?: string;
    readonly apiKey: string;
    readonly consoleOrigin: URL;
    readonly endpoint: string;
    readonly origin: URL;
    readonly projectId?: string;
    readonly projectTeam: string;
    readonly teamName?: string;
    readonly teamHeaders: Record<string, string>;
}

interface OpenFlowCommandHost {
    readonly cloudRequest: (path: string, init?: RequestInit) => Promise<Response>;
    readonly getWorkbenchUrl: (projectId: string, flowId?: string) => Promise<string>;
    readonly getProject: () => Promise<string | undefined>;
    readonly language: "en" | "zh-CN";
    readonly setProject: (projectId: string) => Promise<void>;
}

export const flowCommand = {
    name: "flow",
    summaryKey: "commands.flow.summary",
    descriptionKey: "commands.flow.description",
    arguments: [
        {
            name: "args",
            descriptionKey: "arguments.flowArgs",
            required: false,
            variadic: true,
        },
    ],
} satisfies CliCommandDefinition;

export function resolveOpenFlowInvocation(argv: readonly string[]): OpenFlowInvocation | undefined {
    let commandIndex = 0;

    while (commandIndex < argv.length) {
        const argument = argv[commandIndex];

        if (argument === "--debug" || argument?.startsWith("--lang=")) {
            commandIndex += 1;
            continue;
        }

        if (argument === "--lang") {
            commandIndex += 2;
            continue;
        }

        break;
    }

    if (argv[commandIndex] !== "flow") {
        return undefined;
    }

    return {
        args: argv.slice(commandIndex + 1),
        commandIndex,
    };
}

export async function runOpenFlowCommand(
    args: readonly string[],
    context: Pick<
        CliExecutionContext,
        | "authStore"
        | "connectorStore"
        | "cwd"
        | "env"
        | "execPath"
        | "fetcher"
        | "logger"
        | "settingsStore"
        | "stderr"
        | "translator"
    >,
): Promise<number> {
    const configuredDirectory = context.env[commandDirectoryEnvName]?.trim();
    let commandDirectory: string;

    if (configuredDirectory) {
        commandDirectory = resolve(context.cwd, configuredDirectory);
    }
    else {
        const progressReporter = createDownloadProgressReporter(
            context.stderr,
            openFlowCommandRelease.archive.length,
            `Open Flow ${openFlowCommandRelease.openFlowVersion}`,
        );
        let downloadStarted = false;
        let downloadedBytes = 0;

        try {
            commandDirectory = await installOpenFlowCommandRelease(openFlowCommandRelease, {
                env: context.env,
                execPath: context.execPath,
                fetcher: context.fetcher,
                onDownloadProgress(nextDownloadedBytes) {
                    if (!downloadStarted && progressReporter === undefined) {
                        context.stderr.write(
                            `${context.translator.t("flow.download.start", {
                                version: openFlowCommandRelease.openFlowVersion,
                            })}\n`,
                        );
                    }

                    downloadStarted = true;
                    downloadedBytes = nextDownloadedBytes;
                    progressReporter?.render(downloadedBytes);
                },
            });

            if (downloadStarted) {
                if (progressReporter === undefined) {
                    context.stderr.write(
                        `${context.translator.t("flow.download.complete", {
                            version: openFlowCommandRelease.openFlowVersion,
                        })}\n`,
                    );
                }
                else {
                    progressReporter.complete(downloadedBytes);
                }
            }
        }
        catch (error) {
            if (downloadStarted) {
                progressReporter?.finish(downloadedBytes);
            }

            context.logger.debug({ err: error }, "Open Flow command artifact preparation failed.");
            throw new CliUserError("errors.flow.commandArtifactUnavailable", 1, {
                version: openFlowCommandRelease.openFlowVersion,
            });
        }
    }

    const entryPath = join(commandDirectory, "entry.js");
    let loaded: unknown;

    try {
        loaded = await import(pathToFileURL(entryPath).href);
    }
    catch (error) {
        throw new CliUserError("errors.flow.commandEntryLoadFailed", 1, {
            message: error instanceof Error ? error.message : String(error),
            path: entryPath,
        });
    }

    if (loaded === null || typeof loaded !== "object") {
        throw new CliUserError("errors.flow.commandEntryInvalid", 1, {
            path: entryPath,
        });
    }

    const commandModule = loaded as CommandModule;

    if (
        commandModule.commandArtifactVersion !== commandArtifactVersion
        || typeof commandModule.runOpenFlowCommand !== "function"
    ) {
        throw new CliUserError("errors.flow.commandEntryInvalid", 1, {
            path: entryPath,
        });
    }

    let cloudSession: Promise<OpenFlowCloudSession> | undefined;
    let selectedProject: string | undefined;
    const host: OpenFlowCommandHost = {
        async cloudRequest(path, init = {}) {
            const session = await (cloudSession ??= resolveOpenFlowCloudSession(context));
            const url = new URL(path, session.origin);

            if (
                url.origin !== session.origin.origin
                || !url.pathname.startsWith("/v1/")
                || url.username !== ""
                || url.password !== ""
                || url.hash !== ""
            ) {
                throw new TypeError(
                    "Open Flow Cloud requests must target the configured /v1/ gateway.",
                );
            }

            const headers = new Headers(init.headers);

            headers.delete("authorization");
            headers.delete("x-oo-team-id");
            headers.delete("x-oo-team-name");
            headers.delete("x-oomol-token");
            headers.set("authorization", session.apiKey);

            for (const [name, value] of Object.entries(session.teamHeaders)) {
                headers.set(name, value);
            }

            return await context.fetcher(url, { ...init, headers });
        },
        async getProject() {
            const session = await (cloudSession ??= resolveOpenFlowCloudSession(context));

            return selectedProject ?? session.projectId;
        },
        async getWorkbenchUrl(projectId, flowId) {
            const session = await (cloudSession ??= resolveOpenFlowCloudSession(context));

            if (session.teamName === undefined) {
                throw new TypeError("Select a Team before opening the Open Flow Workbench.");
            }

            const projectPath = `/team/${encodeURIComponent(session.teamName)}/flows/${encodeURIComponent(projectId)}`;
            const pathname
                = flowId === undefined
                    ? projectPath
                    : `${projectPath}/${encodeURIComponent(flowId)}/design`;
            const redirect = new URL(pathname, session.consoleOrigin).href;
            const signIn = await createBrowserSignIn(
                { apiKey: session.apiKey, endpoint: session.endpoint },
                redirect,
                context,
            );

            return signIn.url;
        },
        language: resolveRequestLanguage(context.translator.locale),
        async setProject(projectId) {
            const session = await (cloudSession ??= resolveOpenFlowCloudSession(context));
            const accountId = session.accountId;

            if (accountId === undefined) {
                throw new TypeError(
                    "A Project selected under OO_API_KEY cannot be persisted; use OO_FLOW_PROJECT instead.",
                );
            }

            await context.authStore.update(auth =>
                setAccountFlowProject(auth, accountId, { projectId, team: session.projectTeam }),
            );
            selectedProject = projectId;
        },
    };
    const exitCode = await commandModule.runOpenFlowCommand(args, host);

    if (
        typeof exitCode !== "number"
        || !Number.isInteger(exitCode)
        || exitCode < 0
        || exitCode > 255
    ) {
        throw new CliUserError("errors.flow.commandEntryInvalid", 1, {
            path: entryPath,
        });
    }

    return exitCode;
}

async function resolveOpenFlowCloudSession(
    context: Pick<
        CliExecutionContext,
        | "authStore"
        | "connectorStore"
        | "env"
        | "fetcher"
        | "logger"
        | "settingsStore"
        | "translator"
    >,
): Promise<OpenFlowCloudSession> {
    const accountSelector = readTrimmedEnv(context.env, flowAccountEnvName);
    const { account, source } = await requireIdentity(context, accountSelector);
    const defaultTeam
        = accountSelector === undefined
            ? await readDefaultTeam(context)
            : account.team === undefined
                ? undefined
                : { id: account.teamId ?? null, name: account.team };
    const identity = requireValidTeamIdentity(
        await resolveTeamIdentity(
            {
                account,
                defaultTeam,
                resolveAgainstBackend: true,
            },
            context,
        ),
        context,
    );

    let projectTeam = "personal";

    if (identity !== undefined) {
        projectTeam = identity.id === null ? `name:${identity.name}` : `id:${identity.id}`;
    }

    return {
        ...(source === "file" ? { accountId: account.id } : {}),
        apiKey: account.apiKey,
        consoleOrigin: new URL(`https://console.${account.endpoint}`),
        endpoint: account.endpoint,
        origin: new URL(`https://open-flow.${account.endpoint}`),
        ...(account.flowProject?.team === projectTeam
            ? { projectId: account.flowProject.projectId }
            : {}),
        projectTeam,
        ...(identity?.name === null || identity?.name === undefined
            ? {}
            : { teamName: identity.name }),
        teamHeaders: teamIdentityHeaders(identity),
    };
}
