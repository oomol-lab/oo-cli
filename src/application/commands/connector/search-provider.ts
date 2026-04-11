import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";

import { createWriterColors } from "../../terminal-colors.ts";

import { persistConnectorActionSchemaCache } from "./schema-cache.ts";
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
    schemaPath: string;
    service: string;
}

type ConnectorSearchTextContext = Pick<CliExecutionContext, "stdout" | "translator">;

export async function loadConnectorSearchResults(
    options: {
        apiKey: string;
        endpoint: string;
        keywords: readonly string[];
        text: string;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "settingsStore">,
): Promise<ConnectorSearchResult[]> {
    const actions = await searchConnectorActions(options, context);

    if (actions.length === 0) {
        return [];
    }

    const authenticatedServices = await listAuthenticatedConnectorServices(
        {
            apiKey: options.apiKey,
            endpoint: options.endpoint,
            services: readUniqueConnectorServices(actions),
        },
        context,
    );

    return await Promise.all(actions.map(async action => ({
        authenticated: authenticatedServices.has(action.service),
        description: action.description,
        name: action.name,
        schemaPath: await persistConnectorActionSchemaCache(action, context),
        service: action.service,
    })));
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
        extraLinesAfterDescription?: readonly string[];
    } = {},
): string {
    const colors = options.colors ?? createWriterColors(context.stdout);
    const lines = [
        `${colors.hex(connectorSearchServiceColor)(result.service)}.${colors.hex(connectorSearchActionColor)(result.name)}`,
    ];

    if (result.description !== "") {
        lines.push(result.description);
    }

    if (options.extraLinesAfterDescription !== undefined) {
        lines.push(...options.extraLinesAfterDescription);
    }

    lines.push(
        `${context.translator.t("connector.search.text.authenticated")}: ${formatConnectorAuthenticationLabel(result.authenticated, context, colors)}`,
        `${context.translator.t("connector.search.text.schemaPath")}: ${colors.gray(result.schemaPath)}`,
    );

    return lines.join("\n");
}

function readUniqueConnectorServices(
    actions: readonly Pick<ConnectorSearchResult, "service">[],
): string[] {
    const services: string[] = [];
    const seen = new Set<string>();

    for (const action of actions) {
        if (seen.has(action.service)) {
            continue;
        }

        seen.add(action.service);
        services.push(action.service);
    }

    return services;
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
