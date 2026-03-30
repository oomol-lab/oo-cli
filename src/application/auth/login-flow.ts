import type { ServerResponse } from "node:http";
import type { Logger } from "pino";
import type { Translator } from "../contracts/translator.ts";
import type { AuthAccount } from "../schemas/auth.ts";
import { Buffer } from "node:buffer";
import { createServer } from "node:http";

import { CliUserError } from "../contracts/cli.ts";
import {
    withAccountIdentity,
    withPath,
} from "../logging/log-fields.ts";

const loginCallbackPath = "/v1/login/callback";
const loginTimeoutMs = 5 * 60 * 1000;

export interface AuthLoginSession {
    redirectUrl: string;
    waitForAccount: () => Promise<AuthAccount>;
}

export async function startAuthLoginSession(
    options: {
        logger: Logger;
        translator: Translator;
    },
): Promise<AuthLoginSession> {
    return await new Promise((resolve, reject) => {
        const server = createServer();
        let resolveAccount: (account: AuthAccount) => void = () => {};
        let rejectAccount: (error: unknown) => void = () => {};
        const state = { settled: false };
        const accountPromise = new Promise<AuthAccount>((innerResolve, innerReject) => {
            resolveAccount = innerResolve;
            rejectAccount = innerReject;
        });
        const timer = setTimeout(() => {
            if (state.settled) {
                return;
            }

            state.settled = true;
            options.logger.warn(
                {
                    timeoutMs: loginTimeoutMs,
                },
                "Auth login callback timed out.",
            );
            rejectAccount(new CliUserError("errors.auth.loginTimeout", 1));
            void closeServer(server).catch(() => undefined);
        }, loginTimeoutMs);

        server.on("request", (request, response) => {
            void handleRequest({
                rejectAccount,
                requestUrl: request.url ?? "",
                resolveAccount,
                response,
                server,
                state,
                logger: options.logger,
                translator: options.translator,
            });
        });

        server.once("error", (error) => {
            clearTimeout(timer);
            options.logger.error(
                {
                    err: error,
                },
                "Auth login callback server failed.",
            );
            reject(error);
        });

        server.listen(0, "127.0.0.1", () => {
            const address = server.address();

            if (!address || typeof address === "string") {
                clearTimeout(timer);
                reject(new Error("Failed to resolve the auth callback address."));
                return;
            }

            options.logger.debug(
                {
                    port: address.port,
                },
                "Auth login callback server is listening.",
            );

            resolve({
                redirectUrl: `http://127.0.0.1:${address.port}${loginCallbackPath}`,
                async waitForAccount(): Promise<AuthAccount> {
                    try {
                        return await accountPromise;
                    }
                    finally {
                        clearTimeout(timer);
                    }
                },
            });
        });
    });
}

interface HandleRequestOptions {
    rejectAccount: (error: unknown) => void;
    requestUrl: string;
    resolveAccount: (account: AuthAccount) => void;
    response: ServerResponse;
    server: ReturnType<typeof createServer>;
    state: { settled: boolean };
    logger: Logger;
    translator: Translator;
}

async function handleRequest(options: HandleRequestOptions): Promise<void> {
    const url = new URL(options.requestUrl, "http://127.0.0.1");
    const apiKey = url.searchParams.get("apiKey");
    const endpoint = url.searchParams.get("endpoint");
    const id = url.searchParams.get("id");
    const name = url.searchParams.get("name");

    options.logger.debug(
        {
            hasApiKey: apiKey !== null,
            hasEndpoint: endpoint !== null,
            hasId: id !== null,
            hasName: name !== null,
            ...withPath(url.pathname),
            settled: options.state.settled,
        },
        "Auth login callback received.",
    );

    if (url.pathname !== loginCallbackPath) {
        options.logger.warn(
            {
                ...withPath(url.pathname),
            },
            "Auth login callback used an unexpected path.",
        );
        writeHttpResponse(
            options.response,
            404,
            options.translator.t("auth.login.callbackNotFound"),
        );
        return;
    }

    if (options.state.settled) {
        options.logger.warn(
            {
                ...withPath(url.pathname),
            },
            "Auth login callback was received after the session had already settled.",
        );
        writeHttpResponse(
            options.response,
            409,
            options.translator.t("auth.login.callbackAlreadyUsed"),
        );
        return;
    }

    if (
        !apiKey
        || !endpoint
        || !id
        || !name
    ) {
        options.logger.warn(
            {
                hasApiKey: apiKey !== null,
                hasEndpoint: endpoint !== null,
                hasId: id !== null,
                hasName: name !== null,
            },
            "Auth login callback was missing required fields.",
        );
        writeHttpResponse(
            options.response,
            400,
            options.translator.t("auth.login.callbackInvalid"),
        );
        return;
    }

    let decodedApiKey = "";

    try {
        decodedApiKey = decodeApiKey(apiKey);
    }
    catch {
        options.logger.warn(
            {
                ...withAccountIdentity(id, endpoint),
                name,
            },
            "Auth login callback contained an invalid api key payload.",
        );
        writeHttpResponse(
            options.response,
            400,
            options.translator.t("auth.login.callbackInvalid"),
        );
        return;
    }

    options.state.settled = true;
    writeHttpResponse(
        options.response,
        200,
        options.translator.t("auth.login.callbackSuccess"),
    );
    options.logger.info(
        {
            ...withAccountIdentity(id, endpoint),
            name,
        },
        "Auth login callback completed successfully.",
    );
    options.resolveAccount({
        apiKey: decodedApiKey,
        endpoint,
        id,
        name,
    });
    await closeServer(options.server);
}

function decodeApiKey(encodedApiKey: string): string {
    const apiKey = Buffer.from(encodedApiKey, "base64").toString("utf8");

    if (apiKey === "") {
        throw new Error("The decoded auth api key is empty.");
    }

    return apiKey;
}

function writeHttpResponse(
    response: ServerResponse,
    statusCode: number,
    body: string,
): void {
    response.writeHead(statusCode, {
        "Content-Type": "text/plain; charset=utf-8",
    });
    response.end(body);
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}
