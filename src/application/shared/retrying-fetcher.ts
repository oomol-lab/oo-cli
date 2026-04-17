import type { Logger } from "pino";

import type { Fetcher } from "../contracts/cli.ts";
import { withRequestTarget } from "../logging/log-fields.ts";

const defaultRetryableStatusCodes = [429, 502, 503, 504] as const;
const retryBaseDelayMs = 1_000;
const retryMaxDelayMs = 30_000;
const defaultRetryMaxRetries = 2;

export interface CreateRetryingFetcherOptions {
    fetcher: Fetcher;
    logger: Logger;
    maxRetries?: number;
    retryableStatusCodes?: readonly number[];
    sleep?: (delayMs: number) => Promise<void>;
}

export function createRetryingFetcher(
    options: CreateRetryingFetcherOptions,
): Fetcher {
    const maxRetries = options.maxRetries ?? defaultRetryMaxRetries;
    const retryableStatusCodes = new Set(
        options.retryableStatusCodes ?? defaultRetryableStatusCodes,
    );
    const sleep = options.sleep ?? Bun.sleep;

    return async (input, init) => {
        for (let attempt = 0; ; attempt += 1) {
            let response: Response | undefined;
            let error: unknown;

            try {
                response = await options.fetcher(input, init);
            }
            catch (caught) {
                error = caught;
            }

            if (response !== undefined) {
                if (
                    attempt >= maxRetries
                    || !retryableStatusCodes.has(response.status)
                ) {
                    return response;
                }
            }
            else if (
                attempt >= maxRetries
                || !shouldRetryAfterError(error, init)
            ) {
                throw error;
            }

            const retryAttempt = attempt + 1;
            const retryDelayMs = Math.min(
                retryMaxDelayMs,
                2 ** attempt * retryBaseDelayMs,
            );
            const logFields = {
                ...readRetryLogFields(input, init),
                maxRetries,
                retryAttempt,
                retryDelayMs,
            };

            if (response !== undefined) {
                options.logger.warn(
                    { ...logFields, status: response.status },
                    "HTTP request retry scheduled after a retryable response.",
                );
            }
            else {
                options.logger.warn(
                    { ...logFields, err: error },
                    "HTTP request retry scheduled after a network failure.",
                );
            }

            await sleep(retryDelayMs);
        }
    };
}

function shouldRetryAfterError(
    error: unknown,
    init: RequestInit | undefined,
): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    // Caller cancelled the request; retrying would re-issue a known-aborted call.
    if (init?.signal?.aborted === true) {
        return false;
    }

    if (error.name === "AbortError") {
        return false;
    }

    return true;
}

function readRetryLogFields(
    input: Parameters<Fetcher>[0],
    init: Parameters<Fetcher>[1],
): Record<string, string> {
    const requestUrl = readRequestUrl(input);
    const fields: Record<string, string> = {
        method: readRequestMethod(input, init),
    };

    if (requestUrl === undefined) {
        return fields;
    }

    Object.assign(
        fields,
        withRequestTarget(requestUrl.host, requestUrl.pathname),
    );

    return fields;
}

function readRequestMethod(
    input: Parameters<Fetcher>[0],
    init: Parameters<Fetcher>[1],
): string {
    return init?.method ?? (input instanceof Request ? input.method : "GET");
}

function readRequestUrl(
    input: Parameters<Fetcher>[0],
): URL | undefined {
    if (input instanceof Request) {
        return new URL(input.url);
    }

    try {
        return input instanceof URL ? input : new URL(input);
    }
    catch {
        return undefined;
    }
}
