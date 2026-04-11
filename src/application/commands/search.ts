import type { CliCommandDefinition, CliExecutionContext } from "../contracts/cli.ts";
import type { TerminalColors } from "../terminal-colors.ts";
import type { ConnectorSearchResult } from "./connector/search-provider.ts";
import type {
    PackageSearchBlock,
    PackageSearchPackage,
} from "./package/search-provider.ts";

import { z } from "zod";

import { createWriterColors } from "../terminal-colors.ts";
import {
    formatConnectorSearchResultAsText,
    loadConnectorSearchResults,
} from "./connector/search-provider.ts";
import { jsonOutputOptions, writeJsonOutput } from "./json-output.ts";
import {
    formatPackageSearchPackageAsText,
    loadPackageSearchResponse,
    readPackageSearchId,
} from "./package/search-provider.ts";
import { requireCurrentAccount } from "./shared/auth-utils.ts";
import { createFormatInputError } from "./shared/input-parsing.ts";
import { parseCommaSeparatedKeywords } from "./shared/keywords.ts";

const searchFormatValues = ["json"] as const;
export const mixedSearchKindColor = "#7FDBFF";

interface MixedSearchInput {
    format?: (typeof searchFormatValues)[number];
    keywords?: string;
    text: string;
}

interface MixedPackageSearchItem {
    blocks: {
        description: string;
        name: string;
        title: string;
    }[];
    description: string;
    displayName: string;
    kind: "package";
    packageId: string;
}

interface MixedConnectorSearchItem {
    authenticated: boolean;
    description: string;
    kind: "connector";
    name: string;
    schemaPath: string;
    service: string;
}

type MixedSearchItem = MixedPackageSearchItem | MixedConnectorSearchItem;
type MixedSearchTextContext = Pick<CliExecutionContext, "stdout" | "translator">;

export const mixedSearchCommand: CliCommandDefinition<MixedSearchInput> = {
    name: "search",
    summaryKey: "commands.mixedSearch.summary",
    descriptionKey: "commands.mixedSearch.description",
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
        format: z.enum(searchFormatValues).optional(),
        keywords: z.string().optional(),
        text: z.string(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const account = await requireCurrentAccount(context);
        const keywords = parseCommaSeparatedKeywords(input.keywords);
        const [packageResponse, connectorResults] = await Promise.all([
            loadPackageSearchResponse(
                {
                    account,
                    locale: context.translator.locale,
                    text: input.text,
                },
                context,
            ),
            loadConnectorSearchResults(
                {
                    apiKey: account.apiKey,
                    endpoint: account.endpoint,
                    keywords,
                    text: input.text,
                },
                context,
            ),
        ]);

        if (input.format === "json") {
            writeJsonOutput(
                context.stdout,
                createMixedSearchItems(
                    packageResponse.packages,
                    connectorResults,
                ),
            );
            return;
        }

        const output = formatMixedSearchResultsAsText(
            packageResponse.packages,
            connectorResults,
            context,
        );

        context.stdout.write(
            output === ""
                ? `${context.translator.t("mixedSearch.text.noResults")}\n`
                : `${output}\n`,
        );
    },
};

function createMixedSearchItems(
    packages: readonly PackageSearchPackage[],
    connectorResults: readonly ConnectorSearchResult[],
): MixedSearchItem[] {
    return [
        ...packages.map(createMixedPackageSearchItem),
        ...connectorResults.map(createMixedConnectorSearchItem),
    ];
}

function createMixedPackageSearchItem(
    pkg: PackageSearchPackage,
): MixedPackageSearchItem {
    return {
        blocks: pkg.blocks.map(createMixedPackageSearchBlock),
        description: pkg.description,
        displayName: pkg.displayName,
        kind: "package",
        packageId: readPackageSearchId(pkg),
    };
}

function createMixedPackageSearchBlock(
    block: PackageSearchBlock,
): MixedPackageSearchItem["blocks"][number] {
    return {
        description: block.description,
        name: block.name,
        title: block.title,
    };
}

function createMixedConnectorSearchItem(
    result: ConnectorSearchResult,
): MixedConnectorSearchItem {
    return {
        authenticated: result.authenticated,
        description: result.description,
        kind: "connector",
        name: result.name,
        schemaPath: result.schemaPath,
        service: result.service,
    };
}

function formatMixedSearchResultsAsText(
    packages: readonly PackageSearchPackage[],
    connectorResults: readonly ConnectorSearchResult[],
    context: MixedSearchTextContext,
): string {
    const colors = createWriterColors(context.stdout);
    const packageKindLine = readMixedSearchKindLine("package", context, colors);
    const connectorKindLine = readMixedSearchKindLine("connector", context, colors);

    return [
        ...packages.map(pkg => formatPackageSearchPackageAsText(pkg, context, {
            colors,
            extraLinesAfterDescription: [packageKindLine],
        })),
        ...connectorResults.map(result => formatConnectorSearchResultAsText(result, context, {
            colors,
            extraLinesAfterDescription: [connectorKindLine],
        })),
    ].join("\n\n");
}

function readMixedSearchKindLine(
    kind: MixedSearchItem["kind"],
    context: MixedSearchTextContext,
    colors: TerminalColors,
): string {
    const kindLabelKey = kind === "package"
        ? "mixedSearch.text.kind.package"
        : "mixedSearch.text.kind.connector";
    const kindValue = colors.hex(mixedSearchKindColor)(
        context.translator.t(kindLabelKey),
    );

    return `${context.translator.t("mixedSearch.text.kind")}: ${kindValue}`;
}
