import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { withRequestTarget } from "../../logging/log-fields.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { readCurrentAuth } from "../auth/shared.ts";
import { buildEnvApiKeyAccount } from "../shared/auth-env-override.ts";
import { writeLine } from "../shared/output.ts";
import {
    normalizeSelfHostedConnectorToken,
    normalizeSelfHostedConnectorUrl,
} from "./target.ts";

const connectorLoginUrlColor = "#c09ff5";

// Lenient health-check parse: only `success` and `data.ok` are asserted so
// envelope additions on the server side never break login.
const connectorHealthResponseSchema = z.object({
    data: z.object({
        ok: z.boolean().optional(),
    }).passthrough().optional(),
    success: z.boolean(),
}).passthrough();

interface ConnectorLoginInput {
    token?: string;
    url: string;
}

export const connectorLoginCommand: CliCommandDefinition<ConnectorLoginInput> = {
    name: "login",
    summaryKey: "commands.connector.login.summary",
    descriptionKey: "commands.connector.login.description",
    missingArgumentBehavior: "showHelp",
    arguments: [
        {
            name: "url",
            descriptionKey: "arguments.connectorUrl",
            required: true,
        },
    ],
    options: [
        {
            name: "token",
            longFlag: "--token",
            valueName: "token",
            descriptionKey: "options.connectorLoginToken",
        },
    ],
    inputSchema: z.object({
        token: z.string().optional(),
        url: z.string(),
    }),
    handler: async (input, context) => {
        const baseUrl = normalizeSelfHostedConnectorUrl(input.url);
        const token = input.token === undefined
            ? undefined
            : normalizeSelfHostedConnectorToken(input.token);

        context.telemetry?.recordProperties({
            auth_mode: token === undefined ? "open" : "token",
        });

        await checkSelfHostedConnectorHealth(baseUrl, token, context);

        // A 200 with a token does not prove the token is valid when the server
        // has authentication disabled entirely; a header-less probe tells the
        // two cases apart so the success output can be honest about it.
        const tokenVerified = token === undefined
            ? undefined
            : !(await acceptsUnauthenticatedRequests(baseUrl, context));

        await context.connectorStore.update(connectorFile => ({
            ...connectorFile,
            selfHosted: {
                ...(token === undefined ? {} : { token }),
                url: baseUrl,
            },
        }));

        context.logger.info(
            {
                tokenConfigured: token !== undefined,
                url: baseUrl,
            },
            "Self-hosted connector configured.",
        );

        writeConnectorLoginOutput(context, {
            accessUrl: createConnectorAccessUrl(baseUrl),
            baseUrl,
            tokenVerified,
        });

        await writeMissingOomolAccountNote(context);
    },
};

async function checkSelfHostedConnectorHealth(
    baseUrl: string,
    token: string | undefined,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<void> {
    const response = await requestSelfHostedConnectorHealth(
        baseUrl,
        token,
        context,
    );

    if (response.status === 401) {
        throw new CliUserError("errors.connectorLogin.unauthorized", 1, {
            accessUrl: createConnectorAccessUrl(baseUrl),
        });
    }

    if (response.status !== 200) {
        throw new CliUserError("errors.connectorLogin.unexpectedStatus", 1, {
            status: response.status,
            url: baseUrl,
        });
    }

    let healthPayload: z.output<typeof connectorHealthResponseSchema>;

    try {
        healthPayload = connectorHealthResponseSchema.parse(
            JSON.parse(await response.text()) as unknown,
        );
    }
    catch {
        throw new CliUserError("errors.connectorLogin.notConnectorServer", 1, {
            url: baseUrl,
        });
    }

    if (healthPayload.success !== true || healthPayload.data?.ok !== true) {
        throw new CliUserError("errors.connectorLogin.notConnectorServer", 1, {
            url: baseUrl,
        });
    }
}

async function acceptsUnauthenticatedRequests(
    baseUrl: string,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<boolean> {
    try {
        const response = await requestSelfHostedConnectorHealth(
            baseUrl,
            undefined,
            context,
        );

        return response.status === 200;
    }
    catch {
        // The authenticated request just succeeded, so a failing probe is a
        // transient error; assume the server enforces authentication.
        return false;
    }
}

// An unresponsive self-hosted server would otherwise block `connector login`
// indefinitely: the retrying fetcher retries failures but enforces no request
// deadline, so the health probe carries its own abort timeout.
const connectorHealthRequestTimeoutMs = 10_000;

async function requestSelfHostedConnectorHealth(
    baseUrl: string,
    token: string | undefined,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<Response> {
    const requestUrl = new URL(`${baseUrl}/v1/health`);

    context.logger.debug(
        {
            ...withRequestTarget(requestUrl.host, requestUrl.pathname),
            tokenProvided: token !== undefined,
        },
        "Self-hosted connector health request started.",
    );

    try {
        return await context.fetcher(requestUrl, {
            headers: token === undefined
                ? {}
                : { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(connectorHealthRequestTimeoutMs),
        });
    }
    catch (error) {
        context.logger.warn(
            {
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                err: error,
            },
            "Self-hosted connector health request failed unexpectedly.",
        );

        throw new CliUserError("errors.connectorLogin.unreachable", 1, {
            message: error instanceof Error ? error.message : String(error),
            url: baseUrl,
        });
    }
}

function writeConnectorLoginOutput(
    context: CliExecutionContext,
    options: {
        accessUrl: string;
        baseUrl: string;
        tokenVerified: boolean | undefined;
    },
): void {
    const colors = createWriterColors(context.stdout);

    writeLine(
        context.stdout,
        `${colors.green("✓")} ${context.translator.t("connector.login.success", {
            url: colors.hex(connectorLoginUrlColor)(options.baseUrl),
        })}`,
    );

    if (options.tokenVerified === true) {
        writeLine(
            context.stdout,
            context.translator.t("connector.login.tokenVerified"),
        );
    }
    else if (options.tokenVerified === false) {
        writeLine(
            context.stdout,
            `${colors.yellow("!")} ${context.translator.t("connector.login.tokenUnverified")}`,
        );
    }
    else {
        writeLine(
            context.stdout,
            context.translator.t("connector.login.noToken", {
                accessUrl: options.accessUrl,
            }),
        );
    }

    writeLine(
        context.stdout,
        context.translator.t("connector.login.manageTokens", {
            accessUrl: options.accessUrl,
        }),
    );
}

async function writeMissingOomolAccountNote(
    context: CliExecutionContext,
): Promise<void> {
    if (buildEnvApiKeyAccount(context.env) !== undefined) {
        return;
    }

    const { currentAccount } = await readCurrentAuth(context);

    if (currentAccount !== undefined) {
        return;
    }

    writeLine(
        context.stdout,
        context.translator.t("connector.login.oomolAccountNote"),
    );
}

function createConnectorAccessUrl(baseUrl: string): string {
    return `${baseUrl}/access`;
}
