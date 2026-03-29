import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import type { AuthAccount } from "../../schemas/auth.ts";
import type { TerminalColors } from "../../terminal-colors.ts";
import { z } from "zod";
import { resolveRequestLanguage } from "../../../i18n/locale.ts";
import { CliUserError } from "../../contracts/cli.ts";
import {
    withAccountIdentity,
    withPath,
} from "../../logging/log-fields.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { readCurrentAuth } from "../auth/shared.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { requestText } from "../shared/request.ts";

const MAX_SEARCH_TEXT_LENGTH = 200;
const SEARCH_CACHE_ID = "search.intent-response";
const SEARCH_CACHE_MAX_ENTRIES = 100;
const SEARCH_CACHE_TTL_MS = 30_000;
const searchFormatValues = ["json"] as const;
const searchDisplayNameColor = "#59F78D";
const searchBlockTitleColor = "#CAA8FA";

const searchBlockSchema = z.object({
    description: z.string().optional().default(""),
    name: z.string().optional().default(""),
    title: z.string().optional().default(""),
}).passthrough();

const searchPackageSchema = z.object({
    blocks: z.array(searchBlockSchema).optional().default([]),
    description: z.string().optional().default(""),
    displayName: z.string().optional().default(""),
    name: z.string().optional().default(""),
    version: z.string().optional().default(""),
}).passthrough();

const searchJsonResponseSchema = z.object({
    packages: z.array(z.unknown()).optional().default([]),
}).passthrough();

const searchResponseSchema = z.object({
    packages: z.array(searchPackageSchema).optional().default([]),
}).passthrough();

interface ParsedSearchResponse {
    json: SearchJsonResponse;
    text: SearchResponse;
}

type SearchJsonResponse = z.output<typeof searchJsonResponseSchema>;
type SearchResponse = z.output<typeof searchResponseSchema>;
type SearchTextContext = Pick<CliExecutionContext, "stdout" | "translator">;

interface SearchInput {
    text: string;
    format?: (typeof searchFormatValues)[number];
    onlyPackageId?: boolean;
}

export const packageSearchCommand: CliCommandDefinition<SearchInput> = {
    name: "search",
    summaryKey: "commands.search.summary",
    descriptionKey: "commands.search.description",
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
            name: "onlyPackageId",
            longFlag: "--only-package-id",
            descriptionKey: "options.onlyPackageId",
        },
    ],
    inputSchema: z.object({
        text: z.string(),
        format: z.enum(searchFormatValues).optional(),
        onlyPackageId: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createSearchInputError(rawInput),
    handler: async (input, context) => {
        const account = await requireCurrentSearchAccount(context);
        const query = truncateSearchText(input.text);
        const requestUrl = new URL(
            `https://search.${account.endpoint}/v1/packages/-/intent-search`,
        );

        requestUrl.searchParams.set("q", query);
        requestUrl.searchParams.set(
            "lang",
            resolveRequestLanguage(context.translator.locale),
        );

        const response = await loadSearchResponse(
            requestUrl,
            account,
            context,
        );

        if (input.onlyPackageId === true) {
            const packageIds = readSearchPackageIds(response.text);

            if (input.format === "json") {
                writeJsonOutput(context.stdout, packageIds);
                return;
            }

            context.stdout.write(
                packageIds.length === 0
                    ? `${context.translator.t("search.text.noResults")}\n`
                    : `${packageIds.join("\n")}\n`,
            );
            return;
        }

        if (input.format === "json") {
            writeJsonOutput(context.stdout, response.json.packages);
            return;
        }

        const output = formatSearchResponseAsText(response.text, context);

        context.stdout.write(
            output === ""
                ? `${context.translator.t("search.text.noResults")}\n`
                : `${output}\n`,
        );
    },
};

function createSearchInputError(rawInput: Record<string, unknown>): CliUserError {
    return new CliUserError("errors.search.invalidFormat", 2, {
        value: String(rawInput.format ?? ""),
    });
}

async function requireCurrentSearchAccount(
    context: CliExecutionContext,
): Promise<AuthAccount> {
    const { authFile, currentAccount } = await readCurrentAuth(context);

    if (currentAccount !== undefined) {
        return currentAccount;
    }

    throw new CliUserError(
        authFile.id === ""
            ? "errors.search.authRequired"
            : "errors.search.activeAccountMissing",
        1,
    );
}

function truncateSearchText(text: string): string {
    const characters = Array.from(text);

    if (characters.length <= MAX_SEARCH_TEXT_LENGTH) {
        return text;
    }

    return characters.slice(0, MAX_SEARCH_TEXT_LENGTH).join("");
}

async function requestSearch(
    requestUrl: URL,
    apiKey: string,
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<string> {
    return await requestText({
        context,
        createRequestFailedError: status => new CliUserError(
            "errors.search.requestFailed",
            1,
            {
                status,
            },
        ),
        createUnexpectedError: error => new CliUserError(
            "errors.search.requestError",
            1,
            {
                message: error instanceof Error ? error.message : String(error),
            },
        ),
        fields: {
            start: {
                queryLength: requestUrl.searchParams.get("q")?.length ?? 0,
                requestLanguage: requestUrl.searchParams.get("lang") ?? "",
            },
        },
        init: {
            headers: {
                Authorization: apiKey,
            },
        },
        requestLabel: "Search",
        requestUrl,
    });
}

async function loadSearchResponse(
    requestUrl: URL,
    account: Pick<AuthAccount, "apiKey" | "endpoint" | "id">,
    context: Pick<CliExecutionContext, "cacheStore" | "fetcher" | "logger">,
): Promise<ParsedSearchResponse> {
    const searchCache = context.cacheStore.getCache<string>({
        id: SEARCH_CACHE_ID,
        defaultTtlMs: SEARCH_CACHE_TTL_MS,
        maxEntries: SEARCH_CACHE_MAX_ENTRIES,
    });
    const cacheKey = JSON.stringify({
        accountId: account.id,
        endpoint: account.endpoint,
        requestUrl: requestUrl.toString(),
    });
    const cachedResponse = searchCache.get(cacheKey);

    if (cachedResponse !== null) {
        context.logger.debug(
            {
                ...withAccountIdentity(account.id, account.endpoint),
                ...withPath(requestUrl.pathname),
                queryLength: requestUrl.searchParams.get("q")?.length ?? 0,
            },
            "Search response cache hit.",
        );

        try {
            return parseSearchResponse(cachedResponse);
        }
        catch (error) {
            if (
                !(error instanceof CliUserError)
                || error.key !== "errors.search.invalidResponse"
            ) {
                throw error;
            }

            searchCache.delete(cacheKey);
            context.logger.warn(
                {
                    ...withAccountIdentity(account.id, account.endpoint),
                    ...withPath(requestUrl.pathname),
                },
                "Search response cache entry was invalidated after a parse failure.",
            );
        }
    }
    else {
        context.logger.debug(
            {
                ...withAccountIdentity(account.id, account.endpoint),
                ...withPath(requestUrl.pathname),
                queryLength: requestUrl.searchParams.get("q")?.length ?? 0,
            },
            "Search response cache miss.",
        );
    }

    const rawResponse = await requestSearch(requestUrl, account.apiKey, context);
    const response = parseSearchResponse(rawResponse);

    searchCache.set(cacheKey, rawResponse);
    context.logger.debug(
        {
            ...withAccountIdentity(account.id, account.endpoint),
            packageCount: response.text.packages.length,
            ...withPath(requestUrl.pathname),
        },
        "Search response cached.",
    );

    return response;
}

function parseSearchResponse(rawResponse: string): ParsedSearchResponse {
    try {
        const parsed = JSON.parse(rawResponse) as unknown;

        return {
            json: searchJsonResponseSchema.parse(parsed),
            text: searchResponseSchema.parse(parsed),
        };
    }
    catch {
        throw new CliUserError("errors.search.invalidResponse", 1);
    }
}

function formatSearchResponseAsText(
    response: SearchResponse,
    context: SearchTextContext,
): string {
    const colors = createSearchColors(context);

    return response.packages
        .map(pkg => formatSearchPackage(pkg, context, colors))
        .join("\n\n");
}

function readSearchPackageIds(response: SearchResponse): string[] {
    return response.packages.flatMap((pkg) => {
        const packageId = readPackageId(pkg);

        if (packageId === "") {
            return [];
        }

        return [packageId];
    });
}

function formatSearchPackage(
    pkg: SearchResponse["packages"][number],
    context: SearchTextContext,
    colors: TerminalColors,
): string {
    const lines = [readPackageLabel(pkg, context, colors)];

    if (pkg.description !== "") {
        lines.push(pkg.description);
    }

    if (pkg.blocks.length > 0) {
        lines.push(context.translator.t("search.text.blocks"));

        for (const block of pkg.blocks) {
            lines.push(...formatSearchBlock(block, context, colors));
        }
    }

    return lines.join("\n");
}

function formatSearchBlock(
    block: SearchResponse["packages"][number]["blocks"][number],
    context: SearchTextContext,
    colors: TerminalColors,
): string[] {
    const label = readBlockLabel(block, context, colors);

    if (block.description === "") {
        return [label];
    }

    return [label, `  ${block.description}`];
}

function readPackageLabel(
    pkg: SearchResponse["packages"][number],
    context: SearchTextContext,
    colors: TerminalColors,
): string {
    const packageId = readPackageId(pkg);

    if (pkg.displayName !== "") {
        const displayName = colors.hex(searchDisplayNameColor)(pkg.displayName);

        if (
            packageId !== ""
            && pkg.displayName !== packageId
        ) {
            return `${displayName} (${packageId})`;
        }

        return displayName;
    }

    if (packageId !== "") {
        return packageId;
    }

    return context.translator.t("search.text.unnamedPackage");
}

function readPackageId(pkg: SearchResponse["packages"][number]): string {
    if (pkg.name === "") {
        return "";
    }

    if (pkg.version === "") {
        return pkg.name;
    }

    return `${pkg.name}@${pkg.version}`;
}

function readBlockLabel(
    block: SearchResponse["packages"][number]["blocks"][number],
    context: SearchTextContext,
    colors: TerminalColors,
): string {
    if (block.title !== "") {
        const title = colors.hex(searchBlockTitleColor)(block.title);

        if (
            block.name !== ""
            && block.title !== block.name
        ) {
            return `- ${title} (${block.name})`;
        }

        return `- ${title}`;
    }

    if (block.name !== "") {
        return `- ${block.name}`;
    }

    return `- ${context.translator.t("search.text.unnamedBlock")}`;
}

function createSearchColors(
    context: Pick<CliExecutionContext, "stdout">,
): TerminalColors {
    return createWriterColors(context.stdout);
}
