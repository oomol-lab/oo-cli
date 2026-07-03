import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";

import type { ConnectorActionSearchResult } from "./shared.ts";
import type { ConnectorTarget } from "./target.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { cacheConnectorActionSchemas } from "./schema-cache.ts";

import {
    listAuthenticatedConnectorServices,
    searchConnectorActions,
} from "./shared.ts";

export const connectorSearchActionColor = "#59F78D";
export const connectorSearchServiceColor = "#CAA8FA";

export interface ConnectorSearchResult {
    authenticated: boolean;
    description: string;
    name: string;
    service: string;
}

type ConnectorSearchTextContext = Pick<CliExecutionContext, "stdout" | "translator">;

export async function loadConnectorSearchResults(
    options: {
        target: Pick<
            ConnectorTarget,
            "authorization" | "baseUrl" | "cacheAccountId" | "cacheEndpoint" | "kind"
        >;
        text: string;
    },
    context: Pick<
        CliExecutionContext,
        "cacheStore" | "fetcher" | "logger" | "settingsStore" | "translator"
    >,
): Promise<ConnectorSearchResult[]> {
    const actions = await searchConnectorActions({
        target: options.target,
        text: options.text,
    }, context);

    await warmConnectorActionSchemaCache(actions, options.target, context);

    const authenticatedServices = await loadAuthenticatedConnectorServices(
        actions,
        options.target,
        context,
    );

    return actions.map(action => ({
        authenticated: authenticatedServices === undefined
            ? action.authenticated
            : authenticatedServices.has(action.service),
        description: action.description,
        name: action.name,
        service: action.service,
    }));
}

async function warmConnectorActionSchemaCache(
    actions: readonly ConnectorActionSearchResult[],
    target: Pick<ConnectorTarget, "cacheAccountId" | "cacheEndpoint">,
    context: Pick<CliExecutionContext, "cacheStore" | "logger" | "settingsStore">,
): Promise<void> {
    const cacheableActions = actions.filter(action =>
        action.inputSchema !== undefined && action.outputSchema !== undefined);

    if (cacheableActions.length === 0) {
        return;
    }

    try {
        await cacheConnectorActionSchemas(cacheableActions, target, context);
    }
    catch (error) {
        // Cache warming is a best-effort optimization; search results must
        // still be returned when the local cache cannot be written.
        context.logger.warn(
            {
                err: error,
            },
            "Failed to warm connector action schemas during search.",
        );
    }
}

/**
 * The self-hosted runtime omits the per-result `authenticated` field from
 * search responses, so the connected-service set is reconstructed from its
 * `/v1/apps/authenticated` endpoint. Best-effort: on failure the results keep
 * their default (`false`) and search output is still returned.
 */
async function loadAuthenticatedConnectorServices(
    actions: readonly ConnectorActionSearchResult[],
    target: Pick<ConnectorTarget, "authorization" | "baseUrl" | "kind">,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<Set<string> | undefined> {
    if (target.kind !== "self_hosted" || actions.length === 0) {
        return undefined;
    }

    const serviceNames = [...new Set(actions.map(action => action.service))];

    try {
        return new Set(await listAuthenticatedConnectorServices(
            {
                serviceNames,
                target,
            },
            context,
        ));
    }
    catch (error) {
        context.logger.warn(
            {
                err: error,
            },
            "Failed to load authenticated services for self-hosted connector search results.",
        );

        return undefined;
    }
}

export function formatConnectorSearchResultsAsText(
    results: readonly ConnectorSearchResult[],
    context: ConnectorSearchTextContext,
): string {
    const colors = createWriterColors(context.stdout);

    return results
        .map(result => formatConnectorSearchResultAsText(result, context, {
            colors,
        }))
        .join("\n\n");
}

export function formatConnectorSearchResultAsText(
    result: ConnectorSearchResult,
    context: ConnectorSearchTextContext,
    options: {
        colors?: TerminalColors;
    } = {},
): string {
    const colors = options.colors ?? createWriterColors(context.stdout);
    const lines = [
        `${colors.hex(connectorSearchServiceColor)(result.service)}.${colors.hex(connectorSearchActionColor)(result.name)}`,
    ];

    if (result.description !== "") {
        lines.push(result.description);
    }

    lines.push(
        `${context.translator.t("connector.search.text.authenticated")}: ${formatConnectorAuthenticationLabel(result.authenticated, context, colors)}`,
    );

    return lines.join("\n");
}

function formatConnectorAuthenticationLabel(
    authenticated: boolean,
    context: Pick<CliExecutionContext, "translator">,
    colors: TerminalColors,
): string {
    if (authenticated) {
        return colors.green(
            context.translator.t("connector.search.text.authenticated.yes"),
        );
    }

    return colors.yellow(
        context.translator.t("connector.search.text.authenticated.no"),
    );
}
