import type { SerializedError } from "pino";

import pino from "pino";

// URL log-sanitization policy: query values, userinfo credentials, and
// fragments must never reach a log line — presigned/signed URLs carry
// short-lived secrets there (signatures, tokens). The origin, path, and query
// parameter names stay as diagnostics. Apply sanitizeUrlForLogging to every
// URL that flows into a log field; the logger's err serializer applies the
// same policy to URL-bearing error properties (Bun fetch errors expose the
// full request URL on `path`).

/** Placeholder for credential-bearing values in log output. */
export const redactedLogValue = "REDACTED";

const unparseableUrlPlaceholder = "<unparseable-url>";

export function sanitizeUrlForLogging(input: string | URL): string {
    let url: URL;

    try {
        url = new URL(input);
    }
    catch {
        // Never echo the raw input: an unparseable value may still embed secrets.
        return unparseableUrlPlaceholder;
    }

    url.username = "";
    url.password = "";
    url.hash = "";

    // Materialized before mutation; set() also collapses duplicate parameters
    // into a single redacted entry, which keeps every parameter name visible.
    for (const name of new Set(url.searchParams.keys())) {
        url.searchParams.set(name, redactedLogValue);
    }

    return url.toString();
}

/** Sanitizes http(s) URLs and leaves every other string untouched. */
export function sanitizeIfHttpUrl(value: string): string {
    return isHttpUrl(value) ? sanitizeUrlForLogging(value) : value;
}

export function serializeErrorForLogging(error: Error): SerializedError {
    const serialized = pino.stdSerializers.err(error);

    if (typeof serialized !== "object" || serialized === null) {
        return serialized;
    }

    const path: unknown = serialized.path;

    // Local filesystem paths (fs errors) stay as-is; only URL-shaped values
    // can carry query credentials.
    if (typeof path === "string" && isHttpUrl(path)) {
        serialized.path = sanitizeUrlForLogging(path);
    }

    const params: unknown = serialized.params;

    // CliUserError.params is enumerable and reaches the serialized output;
    // message params built from URLs must follow the same policy.
    if (typeof params === "object" && params !== null) {
        serialized.params = sanitizeUrlRecordValues(params as Record<string, unknown>);
    }

    return serialized;
}

function sanitizeUrlRecordValues(
    record: Record<string, unknown>,
): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
        sanitized[key] = typeof value === "string" ? sanitizeIfHttpUrl(value) : value;
    }

    return sanitized;
}

function isHttpUrl(value: string): boolean {
    const prefix = value.slice(0, "https://".length).toLowerCase();

    return prefix.startsWith("http://") || prefix === "https://";
}
