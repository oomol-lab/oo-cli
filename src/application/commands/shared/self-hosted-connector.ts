import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { SelfHostedConnectorConfig } from "../../schemas/connector.ts";

import { getSelfHostedConnectorConfig } from "../../schemas/connector.ts";

// Environment variables that point connector-family commands at a self-hosted
// connector server without touching connector.toml (headless/CI parity with
// OO_API_KEY for the OOMOL services).
const connectorUrlEnvName = "OO_CONNECTOR_URL";
const connectorTokenEnvName = "OO_CONNECTOR_TOKEN";

export interface ResolvedSelfHostedConnector {
    config: SelfHostedConnectorConfig;
    source: "env" | "file";
}

// Reads the OO_CONNECTOR_URL/OO_CONNECTOR_TOKEN override when set to a
// non-empty value, otherwise undefined so callers fall back to connector.toml.
export function readEnvSelfHostedConnectorConfig(
    env: Record<string, string | undefined>,
): SelfHostedConnectorConfig | undefined {
    const url = env[connectorUrlEnvName]?.trim();

    if (url === undefined || url === "") {
        return undefined;
    }

    const token = env[connectorTokenEnvName]?.trim();

    return {
        ...(token === undefined || token === "" ? {} : { token }),
        url,
    };
}

/**
 * Returns the effective self-hosted connector configuration, preferring the
 * env override over connector.toml. Used by connector routing, status
 * displays, and the auth-required error path.
 */
export async function resolveSelfHostedConnector(
    context: Pick<CliExecutionContext, "connectorStore" | "env">,
): Promise<ResolvedSelfHostedConnector | undefined> {
    const envConfig = readEnvSelfHostedConnectorConfig(context.env);

    if (envConfig !== undefined) {
        return { config: envConfig, source: "env" };
    }

    const persistedConfig = getSelfHostedConnectorConfig(
        await context.connectorStore.read(),
    );

    if (persistedConfig !== undefined) {
        return { config: persistedConfig, source: "file" };
    }

    return undefined;
}

/**
 * Like {@link resolveSelfHostedConnector}, but a broken connector.toml
 * degrades to "not configured" instead of failing the caller. For display and
 * error-message call sites (auth login/status, the auth-required error) that
 * must never change their own outcome because of connector-store corruption;
 * connector commands surface the corruption themselves.
 */
export async function resolveSelfHostedConnectorTolerantly(
    context: Pick<CliExecutionContext, "connectorStore" | "env" | "logger">,
): Promise<ResolvedSelfHostedConnector | undefined> {
    try {
        return await resolveSelfHostedConnector(context);
    }
    catch (error) {
        context.logger.warn(
            {
                err: error,
            },
            "Self-hosted connector lookup failed; treating it as unconfigured.",
        );

        return undefined;
    }
}
