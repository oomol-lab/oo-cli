import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { SelfHostedConnectorConfig } from "../../schemas/connector.ts";

import { CliUserError } from "../../contracts/cli.ts";
import { buildEnvApiKeyAccount } from "../shared/auth-env-override.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import {
    readEnvSelfHostedConnectorConfig,
    resolveSelfHostedConnector,
} from "../shared/self-hosted-connector.ts";

// Stable cache identity for self-hosted targets. The self-hosted runtime has
// no account concept, so the schema cache keys on this marker plus the
// normalized base URL.
const selfHostedCacheAccountId = "self-hosted";

export type ConnectorTargetKind = "oomol" | "self_hosted";

export interface ConnectorTarget {
    /**
     * Header value sent as `Authorization`. The OOMOL service expects the raw
     * API key; a self-hosted server expects `Bearer <token>`. Undefined means
     * no header is sent (a self-hosted server with authentication disabled).
     */
    authorization?: string;
    /** Normalized base URL without a trailing slash, e.g. `http://localhost:3000` or `https://connector.oomol.com`. */
    baseUrl: string;
    /** Account dimension of the action schema cache key. */
    cacheAccountId: string;
    /** Endpoint dimension of the action schema cache key. */
    cacheEndpoint: string;
    kind: ConnectorTargetKind;
}

export type ConnectorRequestTarget = Pick<
    ConnectorTarget,
    "authorization" | "baseUrl" | "kind"
>;

/**
 * Resolves which connector server a connector-family command talks to.
 *
 * Precedence:
 * 1. `OO_CONNECTOR_URL` (+ optional `OO_CONNECTOR_TOKEN`) — explicit env
 *    override for a self-hosted server.
 * 2. `OO_API_KEY` — explicit env credential for the OOMOL services; it keeps
 *    its documented "takes precedence over any saved state" contract, so a
 *    persisted connector.toml never hijacks an explicit hosted credential.
 * 3. connector.toml — the persisted self-hosted connector configuration.
 * 4. The active OOMOL account (throws the standard auth-required errors when
 *    nobody is logged in).
 */
export async function resolveConnectorTarget(
    context: CliExecutionContext,
): Promise<ConnectorTarget> {
    const envSelfHosted = readEnvSelfHostedConnectorConfig(context.env);

    if (envSelfHosted !== undefined) {
        return createSelfHostedConnectorTarget(envSelfHosted);
    }

    const envAccount = buildEnvApiKeyAccount(context.env);

    if (envAccount !== undefined) {
        return {
            authorization: envAccount.apiKey,
            baseUrl: `https://connector.${envAccount.endpoint}`,
            cacheAccountId: envAccount.id,
            cacheEndpoint: envAccount.endpoint,
            kind: "oomol",
        };
    }

    const persistedSelfHosted = await resolveSelfHostedConnector(context);

    if (persistedSelfHosted !== undefined) {
        return createSelfHostedConnectorTarget(persistedSelfHosted.config);
    }

    const account = await requireCurrentAccount(context);

    return {
        authorization: account.apiKey,
        baseUrl: `https://connector.${account.endpoint}`,
        cacheAccountId: account.id,
        cacheEndpoint: account.endpoint,
        kind: "oomol",
    };
}

/**
 * Normalizes a self-hosted connector URL to `origin + optional path prefix`
 * without a trailing slash. Request URLs are built by string concatenation on
 * this base so a path prefix (e.g. behind a reverse proxy) survives; the
 * two-argument `new URL(path, base)` form must not be used because it drops
 * path prefixes.
 */
export function normalizeSelfHostedConnectorUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim();

    if (trimmed === "") {
        throw new CliUserError("errors.connectorLogin.invalidUrl", 2, {
            url: rawUrl,
        });
    }

    let parsed: URL;

    try {
        parsed = new URL(trimmed);
    }
    catch {
        throw new CliUserError("errors.connectorLogin.invalidUrl", 2, {
            url: trimmed,
        });
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new CliUserError("errors.connectorLogin.invalidUrl", 2, {
            url: trimmed,
        });
    }

    if (parsed.search !== "" || parsed.hash !== "") {
        throw new CliUserError("errors.connectorLogin.invalidUrl", 2, {
            url: trimmed,
        });
    }

    // `parsed.origin` drops any embedded `user:pass@` credentials, so accepting
    // such a URL would silently discard them. Reject it instead, mirroring the
    // query/hash rejection above, so the failure is explicit.
    if (parsed.username !== "" || parsed.password !== "") {
        throw new CliUserError("errors.connectorLogin.invalidUrl", 2, {
            url: trimmed,
        });
    }

    let pathname = parsed.pathname;

    while (pathname.endsWith("/")) {
        pathname = pathname.slice(0, -1);
    }

    return `${parsed.origin}${pathname}`;
}

/**
 * Validates a self-hosted connector token: it must survive trimming and must
 * not contain whitespace or control characters (which would either fail the
 * server's exact `Bearer <token>` comparison or break the HTTP header).
 */
export function normalizeSelfHostedConnectorToken(rawToken: string): string {
    const trimmed = rawToken.trim();

    if (trimmed === "" || hasWhitespaceOrControlCharacter(trimmed)) {
        throw new CliUserError("errors.connectorLogin.invalidToken", 2);
    }

    return trimmed;
}

function createSelfHostedConnectorTarget(
    config: SelfHostedConnectorConfig,
): ConnectorTarget {
    const baseUrl = normalizeSelfHostedConnectorUrl(config.url);

    return {
        ...(config.token === undefined
            ? {}
            : { authorization: `Bearer ${config.token}` }),
        baseUrl,
        cacheAccountId: selfHostedCacheAccountId,
        cacheEndpoint: baseUrl,
        kind: "self_hosted",
    };
}

function hasWhitespaceOrControlCharacter(value: string): boolean {
    for (const character of value) {
        const codePoint = character.codePointAt(0) ?? 0;

        if (codePoint <= 0x20 || codePoint === 0x7F) {
            return true;
        }
    }

    return false;
}
