import type { Logger } from "pino";

import type { Fetcher } from "../contracts/cli.ts";
import type { AuthAccount } from "../schemas/auth.ts";
import { z } from "zod";
import { CliUserError } from "../contracts/cli.ts";
import {
    withAccountIdentity,
    withRequestTarget,
} from "../logging/log-fields.ts";

const deviceLoginPollIntervalMs = 2_000;

const deviceLoginCodeResponseSchema = z.object({
    code: z.string().min(1),
    expires_in: z.number().int().positive(),
    status: z.literal("waiting"),
    verify_code_url: z.string().url(),
}).passthrough();

const deviceLoginWaitingResponseSchema = z.object({
    status: z.literal("waiting"),
}).passthrough();

const deviceLoginVerifiedResponseSchema = z.object({
    api_key: z.string().min(1),
    endpoint: z.string().min(1),
    id: z.string().min(1),
    name: z.string().min(1),
    status: z.literal("verified"),
}).passthrough();

const deviceLoginResultResponseSchema = z.union([
    deviceLoginWaitingResponseSchema,
    deviceLoginVerifiedResponseSchema,
]);

type DeviceLoginCodeResponse = z.output<typeof deviceLoginCodeResponseSchema>;
type DeviceLoginResultResponse = z.output<typeof deviceLoginResultResponseSchema>;

export interface AuthLoginSession {
    code: string;
    expiresInSeconds: number;
    verificationUrl: string;
    waitForAccount: () => Promise<AuthAccount>;
}

interface StartAuthLoginSessionOptions {
    endpoint: string;
    fetcher: Fetcher;
    logger: Logger;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    pollIntervalMs?: number;
}

export async function startAuthLoginSession(
    options: StartAuthLoginSessionOptions,
): Promise<AuthLoginSession> {
    const now = options.now ?? Date.now;
    const sleep = options.sleep ?? Bun.sleep;
    const pollIntervalMs = options.pollIntervalMs ?? deviceLoginPollIntervalMs;
    const state = Bun.randomUUIDv7();
    const codeResponse = await requestDeviceLoginCode(state, options);
    const expiresAt = now() + (codeResponse.expires_in * 1000);

    options.logger.info(
        {
            expiresInSeconds: codeResponse.expires_in,
        },
        "Auth device login code created.",
    );

    return {
        code: codeResponse.code,
        expiresInSeconds: codeResponse.expires_in,
        verificationUrl: codeResponse.verify_code_url,
        waitForAccount: async () => await waitForVerifiedAccount(
            state,
            expiresAt,
            options,
            { now, sleep, pollIntervalMs },
        ),
    };
}

async function waitForVerifiedAccount(
    state: string,
    expiresAt: number,
    options: Pick<StartAuthLoginSessionOptions, "endpoint" | "fetcher" | "logger">,
    resolved: {
        now: () => number;
        pollIntervalMs: number;
        sleep: (ms: number) => Promise<void>;
    },
): Promise<AuthAccount> {
    while (resolved.now() < expiresAt) {
        const result = await requestDeviceLoginResult(state, options);

        if (result.status === "verified") {
            options.logger.info(
                {
                    ...withAccountIdentity(result.id, result.endpoint),
                    name: result.name,
                },
                "Auth device login completed successfully.",
            );

            return {
                apiKey: result.api_key,
                endpoint: result.endpoint,
                id: result.id,
                name: result.name,
            };
        }

        const remainingMs = expiresAt - resolved.now();

        if (remainingMs <= 0) {
            break;
        }

        await resolved.sleep(Math.min(resolved.pollIntervalMs, remainingMs));
    }

    options.logger.warn(
        {
            timeoutMs: expiresAt - resolved.now(),
        },
        "Auth device login timed out.",
    );
    throw new CliUserError("errors.auth.loginTimeout", 1);
}

async function requestDeviceLoginCode(
    state: string,
    options: StartAuthLoginSessionOptions,
): Promise<DeviceLoginCodeResponse> {
    const rawResponse = await requestDeviceLogin(
        createDeviceLoginCodeUrl(options.endpoint),
        options,
        {
            body: JSON.stringify({
                stat: state,
            }),
            kind: "code",
            method: "POST",
        },
    );

    return parseDeviceLoginResponse(
        rawResponse,
        deviceLoginCodeResponseSchema,
    );
}

async function requestDeviceLoginResult(
    state: string,
    options: StartAuthLoginSessionOptions,
): Promise<DeviceLoginResultResponse> {
    const requestUrl = createDeviceLoginResultUrl(options.endpoint, state);
    const rawResponse = await requestDeviceLogin(
        requestUrl,
        options,
        {
            kind: "result",
            method: "GET",
        },
    );

    return parseDeviceLoginResponse(
        rawResponse,
        deviceLoginResultResponseSchema,
    );
}

async function requestDeviceLogin(
    requestUrl: URL,
    options: Pick<StartAuthLoginSessionOptions, "fetcher" | "logger">,
    requestOptions: {
        body?: string;
        kind: "code" | "result";
        method: "GET" | "POST";
    },
): Promise<string> {
    const requestStartedAt = Date.now();

    options.logger.debug(
        {
            bodyLength: requestOptions.body?.length ?? 0,
            hasBody: requestOptions.body !== undefined,
            kind: requestOptions.kind,
            method: requestOptions.method,
            ...withRequestTarget(requestUrl.host, requestUrl.pathname),
        },
        "Auth device login request started.",
    );

    try {
        const response = await options.fetcher(requestUrl, {
            body: requestOptions.body,
            headers: requestOptions.body === undefined
                ? undefined
                : {
                        "Content-Type": "application/json",
                    },
            method: requestOptions.method,
        });
        const durationMs = Date.now() - requestStartedAt;

        if (!response.ok) {
            options.logger.warn(
                {
                    durationMs,
                    kind: requestOptions.kind,
                    method: requestOptions.method,
                    status: response.status,
                    ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                },
                "Auth device login request returned a non-success status.",
            );
            throw new CliUserError("errors.auth.loginRequestFailed", 1, {
                status: response.status,
            });
        }

        options.logger.debug(
            {
                durationMs,
                kind: requestOptions.kind,
                method: requestOptions.method,
                status: response.status,
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
            },
            "Auth device login request completed.",
        );

        return await response.text();
    }
    catch (error) {
        if (error instanceof CliUserError) {
            throw error;
        }

        options.logger.warn(
            {
                durationMs: Date.now() - requestStartedAt,
                err: error,
                kind: requestOptions.kind,
                method: requestOptions.method,
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
            },
            "Auth device login request failed unexpectedly.",
        );
        throw new CliUserError("errors.auth.loginRequestError", 1, {
            message: error instanceof Error ? error.message : String(error),
        });
    }
}

function parseDeviceLoginResponse<TValue>(
    rawResponse: string,
    schema: z.ZodType<TValue>,
): TValue {
    try {
        return schema.parse(JSON.parse(rawResponse) as unknown);
    }
    catch {
        throw new CliUserError("errors.auth.loginInvalidResponse", 1);
    }
}

function createDeviceLoginCodeUrl(endpoint: string): URL {
    return new URL(`https://api.${endpoint}/v1/auth/device_login/code`);
}

function createDeviceLoginResultUrl(endpoint: string, state: string): URL {
    const requestUrl = new URL(
        `https://api.${endpoint}/v1/auth/device_login/result`,
    );

    requestUrl.searchParams.set("stat", state);
    return requestUrl;
}
