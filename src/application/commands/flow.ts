import type { CliCommandDefinition, CliExecutionContext } from "../contracts/cli.ts";

import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveRequestLanguage } from "../../i18n/locale.ts";
import { readDefaultTeam } from "../auth/default-team.ts";
import { readTrimmedEnv, requireIdentity } from "../auth/identity.ts";
import { CliUserError } from "../contracts/cli.ts";
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
const serverOriginEnvName = "OO_OPEN_FLOW_URL";
const serverTokenEnvName = "OO_OPEN_FLOW_TOKEN";
const commandArtifactVersion = 2;

interface CommandModule {
    readonly commandArtifactVersion: unknown;
    readonly runOpenFlowCommand: unknown;
}

interface OpenFlowInvocation {
    readonly args: readonly string[];
    readonly commandIndex: number;
}

interface HostedSession {
    readonly apiKey: string;
    readonly consoleOrigin: URL;
    readonly endpoint: string;
    readonly kind: "hosted";
    readonly origin: URL;
    readonly teamName?: string;
    readonly teamHeaders: Record<string, string>;
}

interface ServerSession {
    readonly kind: "server";
    readonly origin: URL;
    readonly token: string;
}

type OpenFlowSession = HostedSession | ServerSession;

interface OpenFlowCommandHost {
    readonly cloudRequest: (path: string, init?: RequestInit) => Promise<Response>;
    readonly getWorkbenchUrl: (flowId?: string) => Promise<string>;
    readonly language: "en" | "zh-CN";
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

    // Resolved once per invocation and shared by both host methods, so the
    // control requests and the Workbench deep link act for the same team.
    let sessionPromise: Promise<OpenFlowSession> | undefined;
    const resolveHostSession = (): Promise<OpenFlowSession> =>
        (sessionPromise ??= resolveOpenFlowSession(context).catch((error: unknown) => {
            throw translateHostError(error, context);
        }));
    const host: OpenFlowCommandHost = {
        async cloudRequest(path, init = {}) {
            const session = await resolveHostSession();
            const url = new URL(path, session.origin);

            if (
                url.origin !== session.origin.origin
                || !url.pathname.startsWith("/v1/")
                || url.username !== ""
                || url.password !== ""
                || url.hash !== ""
            ) {
                throw new TypeError(
                    "Open Flow requests must target the configured /v1/ gateway.",
                );
            }

            const headers = new Headers(init.headers);

            headers.delete("authorization");
            headers.delete("cookie");
            headers.delete("x-oo-team-id");
            headers.delete("x-oo-team-name");
            headers.delete("x-oomol-token");

            if (session.kind === "hosted") {
                headers.set("authorization", session.apiKey);

                for (const [name, value] of Object.entries(session.teamHeaders)) {
                    headers.set(name, value);
                }
            }
            else {
                headers.set("authorization", `Bearer ${session.token}`);
            }

            return await context.fetcher(url, { ...init, headers });
        },
        async getWorkbenchUrl(flowId) {
            const session = await resolveHostSession();

            if (session.kind === "server") {
                const pathname
                    = flowId === undefined
                        ? "/flows"
                        : `/flows/${encodeURIComponent(flowId)}/design`;

                return new URL(pathname, session.origin).href;
            }

            // Reached only when the backend reported no default team either
            // (the account has created none) or that lookup failed.
            if (session.teamName === undefined) {
                throw translateHostError(
                    new CliUserError("errors.flow.teamRequired", 1),
                    context,
                );
            }

            const flowPath = `/team/${encodeURIComponent(session.teamName)}/flows`;
            const pathname
                = flowId === undefined
                    ? flowPath
                    : `${flowPath}/${encodeURIComponent(flowId)}/design`;
            const redirect = new URL(pathname, session.consoleOrigin).href;
            const signIn = await createBrowserSignIn(
                { apiKey: session.apiKey, endpoint: session.endpoint },
                redirect,
                context,
            );

            return signIn.url;
        },
        language: resolveRequestLanguage(context.translator.locale),
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

// The command artifact reports any error a host method throws as
// `flow.unexpected: <message>` and exits 1 — it cannot translate a CLI error
// key — so a CLI user error crossing the host boundary carries its translated
// text in the message. It stays a CliUserError: when nothing wraps it (a
// host-side failure before delegation), the CLI's own handler still keys off
// `key` and `exitCode`.
function translateHostError(
    error: unknown,
    context: Pick<CliExecutionContext, "translator">,
): unknown {
    if (error instanceof CliUserError) {
        error.message = context.translator.t(error.key, error.params);
    }

    return error;
}

async function resolveOpenFlowSession(
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
): Promise<OpenFlowSession> {
    const serverOrigin = readTrimmedEnv(context.env, serverOriginEnvName);
    const serverToken = readTrimmedEnv(context.env, serverTokenEnvName);

    if (serverOrigin !== undefined || serverToken !== undefined) {
        if (serverOrigin === undefined || serverToken === undefined) {
            throw new CliUserError("errors.flow.serverConfigIncomplete", 1);
        }

        let origin: URL;

        try {
            origin = new URL(serverOrigin);
        }
        catch {
            throw new CliUserError("errors.flow.serverOriginInvalid", 1);
        }

        if (
            (origin.protocol !== "http:" && origin.protocol !== "https:")
            || origin.username !== ""
            || origin.password !== ""
            || origin.pathname !== "/"
            || origin.search !== ""
            || origin.hash !== ""
        ) {
            throw new CliUserError("errors.flow.serverOriginInvalid", 1);
        }

        return {
            kind: "server",
            origin,
            token: serverToken,
        };
    }

    const accountSelector = readTrimmedEnv(context.env, flowAccountEnvName);
    const { account } = await requireIdentity(context, accountSelector);
    const defaultTeam
        = accountSelector === undefined
            ? await readDefaultTeam(context)
            : account.team === undefined
                ? undefined
                : { id: account.teamId ?? null, name: account.team };
    // The Workbench deep link is team-scoped by the team's current name, so
    // the session asks the backend for it: a saved default is refreshed by
    // id (the saved name goes stale on rename), and with nothing saved the
    // backend reports which team it applies anyway. Resolved once per
    // invocation, the same identity backs both the control requests and the
    // deep link, so a Flow created through this session always opens in the
    // team it was created in.
    const identity = requireValidTeamIdentity(
        await resolveTeamIdentity(
            {
                account,
                defaultTeam,
                resolveAgainstBackend: true,
                resolveCurrentName: true,
            },
            context,
        ),
        context,
    );

    return {
        apiKey: account.apiKey,
        consoleOrigin: new URL(`https://console.${account.endpoint}`),
        endpoint: account.endpoint,
        kind: "hosted",
        origin: new URL(`https://open-flow.${account.endpoint}`),
        ...(identity?.name === null || identity?.name === undefined
            ? {}
            : { teamName: identity.name }),
        teamHeaders: teamIdentityHeaders(identity),
    };
}
