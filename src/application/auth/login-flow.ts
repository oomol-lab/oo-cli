import type { ServerResponse } from "node:http";
import type { Translator } from "../contracts/translator.ts";
import type { AuthAccount } from "../schemas/auth.ts";
import { Buffer } from "node:buffer";
import { createServer } from "node:http";

import { CliUserError } from "../contracts/cli.ts";

const loginCallbackPath = "/v1/login/callback";
const loginTimeoutMs = 5 * 60 * 1000;

export interface AuthLoginSession {
    redirectUrl: string;
    waitForAccount: () => Promise<AuthAccount>;
}

export async function startAuthLoginSession(
    translator: Translator,
): Promise<AuthLoginSession> {
    return await new Promise((resolve, reject) => {
        const server = createServer();
        let resolveAccount: (account: AuthAccount) => void = () => {};
        let rejectAccount: (error: unknown) => void = () => {};
        let settled = false;
        const accountPromise = new Promise<AuthAccount>((innerResolve, innerReject) => {
            resolveAccount = innerResolve;
            rejectAccount = innerReject;
        });
        const timer = setTimeout(() => {
            if (settled) {
                return;
            }

            settled = true;
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
                settled,
                setSettled(value) {
                    settled = value;
                },
                translator,
            });
        });

        server.once("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });

        server.listen(0, "127.0.0.1", () => {
            const address = server.address();

            if (!address || typeof address === "string") {
                clearTimeout(timer);
                reject(new Error("Failed to resolve the auth callback address."));
                return;
            }

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
    settled: boolean;
    setSettled: (value: boolean) => void;
    translator: Translator;
}

async function handleRequest(options: HandleRequestOptions): Promise<void> {
    const url = new URL(options.requestUrl, "http://127.0.0.1");

    if (url.pathname !== loginCallbackPath) {
        writeHttpResponse(
            options.response,
            404,
            options.translator.t("auth.login.callbackNotFound"),
        );
        return;
    }

    if (options.settled) {
        writeHttpResponse(
            options.response,
            409,
            options.translator.t("auth.login.callbackAlreadyUsed"),
        );
        return;
    }

    const callbackFields = {
        apiKey: url.searchParams.get("apiKey") ?? "",
        endpoint: url.searchParams.get("endpoint") ?? "",
        id: url.searchParams.get("id") ?? "",
        name: url.searchParams.get("name") ?? "",
    };

    if (
        callbackFields.apiKey === ""
        || callbackFields.endpoint === ""
        || callbackFields.id === ""
        || callbackFields.name === ""
    ) {
        writeHttpResponse(
            options.response,
            400,
            options.translator.t("auth.login.callbackInvalid"),
        );
        return;
    }

    let apiKey = "";

    try {
        apiKey = decodeApiKey(callbackFields.apiKey);
    }
    catch {
        writeHttpResponse(
            options.response,
            400,
            options.translator.t("auth.login.callbackInvalid"),
        );
        return;
    }

    options.setSettled(true);
    writeHttpResponse(
        options.response,
        200,
        options.translator.t("auth.login.callbackSuccess"),
    );
    options.resolveAccount({
        apiKey,
        endpoint: callbackFields.endpoint,
        id: callbackFields.id,
        name: callbackFields.name,
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
