import type { Logger } from "pino";

import type { CliExecutionContext, Fetcher } from "../contracts/cli.ts";
import type { AuthAccount } from "../schemas/auth.ts";
import { z } from "zod";
import { getUnexpectedRequestErrorMessage } from "../commands/shared/request.ts";
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

const fastLoginProfileResponseSchema = z.object({
    api_key: z.string().min(1),
    endpoint: z.string().min(1),
    id: z.string().min(1),
    name: z.string().min(1),
}).passthrough();

type DeviceLoginCodeResponse = z.output<typeof deviceLoginCodeResponseSchema>;
type DeviceLoginResultResponse = z.output<typeof deviceLoginResultResponseSchema>;

interface AuthAccountResponse {
    api_key: string;
    endpoint: string;
    id: string;
    name: string;
}

interface AuthLoginRequestOptions {
    fetcher: Fetcher;
    logger: Logger;
    translator: Pick<CliExecutionContext["translator"], "t">;
}

export interface AuthLoginSession {
    expiresInSeconds: number;
    verificationUrl: string;
    waitForAccount: () => Promise<AuthAccount>;
}

interface StartAuthLoginSessionOptions extends AuthLoginRequestOptions {
    endpoint: string;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    pollIntervalMs?: number;
}

interface RequestAuthAccountWithSessionTokenOptions extends AuthLoginRequestOptions {
    endpoint: string;
    sessionToken: string;
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
        expiresInSeconds: codeResponse.expires_in,
        verificationUrl: createDeviceLoginVerificationUrl(
            codeResponse.verify_code_url,
            codeResponse.code,
        ),
        waitForAccount: async () => await waitForVerifiedAccount(
            state,
            expiresAt,
            options,
            { now, sleep, pollIntervalMs },
        ),
    };
}

export async function requestAuthAccountWithSessionToken(
    options: RequestAuthAccountWithSessionTokenOptions,
): Promise<AuthAccount> {
    const requestUrl = createFastLoginProfileWithSessionTokenUrl(
        options.endpoint,
        options.sessionToken,
    );
    const rawResponse = await requestAuthLogin(
        requestUrl,
        options,
        {
            kind: "profile_with_session_token",
            method: "GET",
            redactedValues: [options.sessionToken],
            requestDescription: "fast login",
        },
    );
    const profile = parseAuthLoginResponse(
        rawResponse,
        fastLoginProfileResponseSchema,
    );

    options.logger.info(
        {
            ...withAccountIdentity(profile.id, profile.endpoint),
            name: profile.name,
        },
        "Auth fast login completed successfully.",
    );

    return createAuthAccount(profile);
}

async function waitForVerifiedAccount(
    state: string,
    expiresAt: number,
    options: Pick<
        StartAuthLoginSessionOptions,
        "endpoint" | "fetcher" | "logger" | "translator"
    >,
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

            return createAuthAccount(result);
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
    const rawResponse = await requestAuthLogin(
        createDeviceLoginCodeUrl(options.endpoint),
        options,
        {
            body: JSON.stringify({
                stat: state,
            }),
            kind: "code",
            method: "POST",
            requestDescription: "device login",
        },
    );

    return parseAuthLoginResponse(
        rawResponse,
        deviceLoginCodeResponseSchema,
    );
}

async function requestDeviceLoginResult(
    state: string,
    options: StartAuthLoginSessionOptions,
): Promise<DeviceLoginResultResponse> {
    const requestUrl = createDeviceLoginResultUrl(options.endpoint, state);
    const rawResponse = await requestAuthLogin(
        requestUrl,
        options,
        {
            kind: "result",
            method: "GET",
            requestDescription: "device login",
        },
    );

    return parseAuthLoginResponse(
        rawResponse,
        deviceLoginResultResponseSchema,
    );
}

async function requestAuthLogin(
    requestUrl: URL,
    options: AuthLoginRequestOptions,
    requestOptions: {
        body?: string;
        kind: "code" | "profile_with_session_token" | "result";
        method: "GET" | "POST";
        redactedValues?: readonly string[];
        requestDescription: "device login" | "fast login";
    },
): Promise<string> {
    const redactedValues = requestOptions.redactedValues ?? [];
    const requestStartedAt = Date.now();

    options.logger.debug(
        {
            bodyLength: requestOptions.body?.length ?? 0,
            hasBody: requestOptions.body !== undefined,
            kind: requestOptions.kind,
            method: requestOptions.method,
            ...withRequestTarget(requestUrl.host, requestUrl.pathname),
        },
        `Auth ${requestOptions.requestDescription} request started.`,
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
                `Auth ${requestOptions.requestDescription} request returned a non-success status.`,
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
            `Auth ${requestOptions.requestDescription} request completed.`,
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
                err: createRedactedError(error, redactedValues),
                kind: requestOptions.kind,
                method: requestOptions.method,
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
            },
            `Auth ${requestOptions.requestDescription} request failed unexpectedly.`,
        );

        throw new CliUserError("errors.auth.loginRequestError", 1, {
            message: redactSensitiveValues(
                getUnexpectedRequestErrorMessage(error, options.translator),
                redactedValues,
            ),
        });
    }
}

function parseAuthLoginResponse<TValue>(
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

function createAuthAccount(response: AuthAccountResponse): AuthAccount {
    return {
        apiKey: response.api_key,
        endpoint: response.endpoint,
        id: response.id,
        name: response.name,
    };
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

function createDeviceLoginVerificationUrl(
    verificationUrl: string,
    userCode: string,
): string {
    const url = new URL(verificationUrl);

    url.searchParams.set("user_code", userCode);
    return url.toString();
}

function createFastLoginProfileWithSessionTokenUrl(
    endpoint: string,
    sessionToken: string,
): URL {
    const requestUrl = new URL(
        `https://api.${endpoint}/v1/auth/fast_login/profile_with_session_token`,
    );

    requestUrl.searchParams.set("session_token", sessionToken);
    return requestUrl;
}

function createRedactedError(
    error: unknown,
    sensitiveValues: readonly string[],
): unknown {
    if (!(error instanceof Error)) {
        return redactSensitiveValues(String(error), sensitiveValues);
    }

    return {
        message: redactSensitiveValues(error.message, sensitiveValues),
        name: error.name,
        stack: error.stack === undefined
            ? undefined
            : redactSensitiveValues(error.stack, sensitiveValues),
    };
}

function redactSensitiveValues(
    value: string,
    sensitiveValues: readonly string[],
): string {
    let redactedValue = value;

    for (const sensitiveValue of sensitiveValues) {
        if (sensitiveValue === "") {
            continue;
        }

        redactedValue = redactedValue
            .replaceAll(sensitiveValue, "<redacted>")
            .replaceAll(encodeURIComponent(sensitiveValue), "<redacted>")
            .replaceAll(encodeSearchParamValue(sensitiveValue), "<redacted>");
    }

    return redactedValue;
}

function encodeSearchParamValue(value: string): string {
    const params = new URLSearchParams();

    params.set("value", value);
    return params.toString().slice("value=".length);
}
