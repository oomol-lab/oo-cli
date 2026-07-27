import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";

import type { TeamIdentity } from "../team/identity.ts";
import type { ConnectorSchemaRequestTarget } from "./schema-cache.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { warmConnectorActionSchemas } from "./schema-cache.ts";

import { searchConnectorActions } from "./shared.ts";

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
        identity?: TeamIdentity | undefined;
        target: ConnectorSchemaRequestTarget;
        text: string;
    },
    context: Pick<
        CliExecutionContext,
        "cacheStore" | "fetcher" | "logger" | "settingsStore" | "translator"
    >,
): Promise<ConnectorSearchResult[]> {
    const actions = await searchConnectorActions({
        identity: options.identity,
        target: options.target,
        text: options.text,
    }, context);

    await warmConnectorActionSchemas(actions, options.target.cacheScope, context);

    return actions.map(action => ({
        authenticated: action.authenticated,
        description: action.description,
        name: action.name,
        service: action.service,
    }));
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
