import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import type { TerminalColors } from "../../terminal-colors.ts";
import { z } from "zod";
import { createWriterColors } from "../../terminal-colors.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { persistConnectorActionSchemaCache } from "./schema-cache.ts";
import {
    connectorFormatValues,
    listAuthenticatedConnectorServices,
    parseConnectorSearchKeywords,
    searchConnectorActions,
} from "./shared.ts";

export const connectorSearchActionColor = "#59F78D";
export const connectorSearchServiceColor = "#CAA8FA";

type ConnectorSearchTextContext = Pick<CliExecutionContext, "stdout" | "translator">;

interface ConnectorSearchResult {
    authenticated: boolean;
    description: string;
    name: string;
    schemaPath: string;
    service: string;
}

interface ConnectorSearchInput {
    format?: (typeof connectorFormatValues)[number];
    keywords?: string;
    text: string;
}

export const connectorSearchCommand: CliCommandDefinition<ConnectorSearchInput> = {
    name: "search",
    summaryKey: "commands.connector.search.summary",
    descriptionKey: "commands.connector.search.description",
    missingArgumentBehavior: "showHelp",
    arguments: [
        {
            name: "text",
            descriptionKey: "arguments.text",
            required: true,
        },
    ],
    options: [
        ...jsonOutputOptions,
        {
            name: "keywords",
            longFlag: "--keywords",
            valueName: "keywords",
            descriptionKey: "options.connectorKeywords",
        },
    ],
    inputSchema: z.object({
        format: z.enum(connectorFormatValues).optional(),
        keywords: z.string().optional(),
        text: z.string(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const account = await requireCurrentAccount(context);
        const keywords = parseConnectorSearchKeywords(input.keywords);
        const actions = await searchConnectorActions(
            {
                apiKey: account.apiKey,
                endpoint: account.endpoint,
                keywords,
                text: input.text,
            },
            context,
        );

        if (actions.length === 0) {
            if (input.format === "json") {
                writeJsonOutput(context.stdout, []);
                return;
            }

            context.stdout.write(
                `${context.translator.t("connector.search.text.noResults")}\n`,
            );
            return;
        }

        const authenticatedServices = await listAuthenticatedConnectorServices(
            {
                apiKey: account.apiKey,
                endpoint: account.endpoint,
                services: uniqueServices(actions),
            },
            context,
        );
        const results = await Promise.all(actions.map(async action => ({
            authenticated: authenticatedServices.has(action.service),
            description: action.description,
            name: action.name,
            schemaPath: await persistConnectorActionSchemaCache(action, context),
            service: action.service,
        })));

        if (input.format === "json") {
            writeJsonOutput(context.stdout, results);
            return;
        }

        context.stdout.write(
            `${formatConnectorSearchResultsAsText(results, context)}\n`,
        );
    },
};

function uniqueServices(
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

function formatConnectorSearchResultsAsText(
    results: readonly ConnectorSearchResult[],
    context: ConnectorSearchTextContext,
): string {
    const colors = createWriterColors(context.stdout);

    return results
        .map(result => formatConnectorSearchResult(result, context, colors))
        .join("\n\n");
}

function formatConnectorSearchResult(
    result: ConnectorSearchResult,
    context: ConnectorSearchTextContext,
    colors: TerminalColors,
): string {
    const lines = [
        `${colors.hex(connectorSearchServiceColor)(result.service)}.${colors.hex(connectorSearchActionColor)(result.name)}`,
        `${context.translator.t("connector.search.text.authenticated")}: ${formatConnectorAuthenticationLabel(result.authenticated, context, colors)}`,
        `${context.translator.t("connector.search.text.schemaPath")}: ${colors.gray(result.schemaPath)}`,
    ];

    if (result.description !== "") {
        lines.splice(1, 0, result.description);
    }

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
