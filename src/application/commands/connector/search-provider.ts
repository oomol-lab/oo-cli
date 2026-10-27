import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";

import type { TeamIdentity } from "../team/identity.ts";
import type { ConnectorSchemaRequestTarget } from "./schema-cache.ts";
import type { ConnectorActionAccessStatus } from "./shared.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { warmConnectorActionSchemas } from "./schema-cache.ts";

import { searchConnectorActions } from "./shared.ts";

export const connectorSearchActionColor = "#59F78D";
export const connectorSearchServiceColor = "#CAA8FA";

export interface ConnectorSearchResult {
    appId?: string;
    teamId?: string;
    teamName?: string;
    accessStatus: ConnectorActionAccessStatus;
    authenticated: boolean;
    description: string;
    name: string;
    service: string;
}

type ConnectorSearchTextContext = Pick<CliExecutionContext, "stdout" | "translator">;

export async function loadConnectorSearchResults(
    options: {
        allTeams?: boolean;
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
        allTeams: options.allTeams,
        identity: options.identity,
        target: options.target,
        text: options.text,
    }, context);

    await warmConnectorActionSchemas(actions, options.target.cacheScope, context);

    return actions.map(action => ({
        appId: action.appId,
        teamId: action.teamId,
        teamName: action.teamName,
        accessStatus: action.accessStatus,
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
        `${context.translator.t("connector.search.text.accessStatus")}: ${formatConnectorAccessStatusLabel(result.accessStatus, context, colors)}`,
    );

    if (result.teamId !== undefined) {
        const team = result.teamName === undefined
            ? result.teamId
            : `${result.teamName} (${result.teamId})`;
        lines.push(`${context.translator.t("connector.search.text.team")}: ${team}`);
    }
    if (result.appId !== undefined) {
        lines.push(`${context.translator.t("connector.search.text.appId")}: ${result.appId}`);
    }
    return lines.join("\n");
}

function formatConnectorAccessStatusLabel(
    accessStatus: ConnectorActionAccessStatus,
    context: Pick<CliExecutionContext, "translator">,
    colors: TerminalColors,
): string {
    if (accessStatus === "available") {
        return colors.green(
            context.translator.t("connector.search.text.accessStatus.available"),
        );
    }

    return colors.yellow(
        context.translator.t("connector.search.text.accessStatus.connectionRequired"),
    );
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
