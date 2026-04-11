import type { CliExecutionContext, SupportedLocale } from "../../contracts/cli.ts";
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
import { requestText } from "../shared/request.ts";

const MAX_SEARCH_TEXT_LENGTH = 200;
const SEARCH_CACHE_ID = "search.intent-response";
const SEARCH_CACHE_MAX_ENTRIES = 100;
const SEARCH_CACHE_TTL_MS = 30_000;
const searchDisplayNameColor = "#59F78D";
const searchBlockTitleColor = "#CAA8FA";

const packageSearchBlockSchema = z.object({
    description: z.string().optional().default(""),
    name: z.string().optional().default(""),
    title: z.string().optional().default(""),
}).passthrough();

const packageSearchPackageSchema = z.object({
    blocks: z.array(packageSearchBlockSchema).optional().default([]),
    description: z.string().optional().default(""),
    displayName: z.string().optional().default(""),
    name: z.string().optional().default(""),
    version: z.string().optional().default(""),
}).passthrough();

const packageSearchJsonResponseSchema = z.object({
    packages: z.array(z.unknown()).optional().default([]),
}).passthrough();

const packageSearchResponseSchema = z.object({
    packages: z.array(packageSearchPackageSchema).optional().default([]),
}).passthrough();

export interface ParsedPackageSearchResponse {
    packages: PackageSearchResponse["packages"];
    rawPackages: PackageSearchJsonResponse["packages"];
}

export type PackageSearchBlock = z.output<typeof packageSearchBlockSchema>;
export type PackageSearchPackage = z.output<typeof packageSearchPackageSchema>;

type PackageSearchJsonResponse = z.output<typeof packageSearchJsonResponseSchema>;
type PackageSearchResponse = z.output<typeof packageSearchResponseSchema>;
type PackageSearchTextContext = Pick<CliExecutionContext, "stdout" | "translator">;

export async function loadPackageSearchResponse(
    options: {
        account: Pick<AuthAccount, "apiKey" | "endpoint" | "id">;
        locale: SupportedLocale;
        text: string;
    },
    context: Pick<CliExecutionContext, "cacheStore" | "fetcher" | "logger">,
): Promise<ParsedPackageSearchResponse> {
    const requestUrl = createPackageSearchRequestUrl(
        options.account.endpoint,
        options.locale,
        options.text,
    );

    return await loadPackageSearchResponseFromUrl(
        requestUrl,
        options.account,
        context,
    );
}

export function formatPackageSearchResultsAsText(
    packages: readonly PackageSearchPackage[],
    context: PackageSearchTextContext,
): string {
    const colors = createWriterColors(context.stdout);

    return packages
        .map(pkg => formatPackageSearchPackageAsText(pkg, context, { colors }))
        .join("\n\n");
}

export function formatPackageSearchPackageAsText(
    pkg: PackageSearchPackage,
    context: PackageSearchTextContext,
    options: {
        colors?: TerminalColors;
        extraLinesAfterDescription?: readonly string[];
    } = {},
): string {
    const colors = options.colors ?? createWriterColors(context.stdout);
    const lines = [readPackageSearchLabel(pkg, context, colors)];

    if (pkg.description !== "") {
        lines.push(pkg.description);
    }

    if (options.extraLinesAfterDescription !== undefined) {
        lines.push(...options.extraLinesAfterDescription);
    }

    if (pkg.blocks.length > 0) {
        lines.push(context.translator.t("labels.blocks"));

        for (const block of pkg.blocks) {
            lines.push(...formatPackageSearchBlock(block, context, colors));
        }
    }

    return lines.join("\n");
}

export function readPackageSearchIds(
    packages: readonly PackageSearchPackage[],
): string[] {
    return packages
        .map(pkg => readPackageSearchId(pkg))
        .filter(packageId => packageId !== "");
}

export function readPackageSearchId(
    pkg: Pick<PackageSearchPackage, "name" | "version">,
): string {
    if (pkg.name === "") {
        return "";
    }

    if (pkg.version === "") {
        return pkg.name;
    }

    return `${pkg.name}@${pkg.version}`;
}

function createPackageSearchRequestUrl(
    endpoint: string,
    locale: SupportedLocale,
    text: string,
): URL {
    const requestUrl = new URL(
        `https://search.${endpoint}/v1/packages/-/intent-search`,
    );

    requestUrl.searchParams.set("q", truncatePackageSearchText(text));
    requestUrl.searchParams.set("lang", resolveRequestLanguage(locale));

    return requestUrl;
}

function truncatePackageSearchText(text: string): string {
    const characters = Array.from(text);

    if (characters.length <= MAX_SEARCH_TEXT_LENGTH) {
        return text;
    }

    return characters.slice(0, MAX_SEARCH_TEXT_LENGTH).join("");
}

async function requestPackageSearch(
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

async function loadPackageSearchResponseFromUrl(
    requestUrl: URL,
    account: Pick<AuthAccount, "apiKey" | "endpoint" | "id">,
    context: Pick<CliExecutionContext, "cacheStore" | "fetcher" | "logger">,
): Promise<ParsedPackageSearchResponse> {
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
    const logFields = {
        ...withAccountIdentity(account.id, account.endpoint),
        ...withPath(requestUrl.pathname),
    };
    const cached = tryReadPackageSearchCache(
        searchCache,
        cacheKey,
        logFields,
        context,
    );

    if (cached !== undefined) {
        return cached;
    }

    const rawResponse = await requestPackageSearch(
        requestUrl,
        account.apiKey,
        context,
    );
    const response = parsePackageSearchResponse(rawResponse);

    searchCache.set(cacheKey, rawResponse);
    context.logger.debug(
        {
            ...logFields,
            packageCount: response.packages.length,
        },
        "Search response cached.",
    );

    return response;
}

function tryReadPackageSearchCache(
    cache: { delete: (key: string) => void; get: (key: string) => string | null },
    cacheKey: string,
    logFields: Record<string, unknown>,
    context: Pick<CliExecutionContext, "logger">,
): ParsedPackageSearchResponse | undefined {
    const cachedResponse = cache.get(cacheKey);

    if (cachedResponse === null) {
        context.logger.debug(logFields, "Search response cache miss.");
        return undefined;
    }

    context.logger.debug(logFields, "Search response cache hit.");

    try {
        return parsePackageSearchResponse(cachedResponse);
    }
    catch (error) {
        if (
            !(error instanceof CliUserError)
            || error.key !== "errors.search.invalidResponse"
        ) {
            throw error;
        }

        cache.delete(cacheKey);
        context.logger.warn(
            logFields,
            "Search response cache entry was invalidated after a parse failure.",
        );

        return undefined;
    }
}

function parsePackageSearchResponse(
    rawResponse: string,
): ParsedPackageSearchResponse {
    try {
        const parsed = JSON.parse(rawResponse) as unknown;

        return {
            packages: packageSearchResponseSchema.parse(parsed).packages,
            rawPackages: packageSearchJsonResponseSchema.parse(parsed).packages,
        };
    }
    catch {
        throw new CliUserError("errors.search.invalidResponse", 1);
    }
}

function formatPackageSearchBlock(
    block: PackageSearchBlock,
    context: PackageSearchTextContext,
    colors: TerminalColors,
): string[] {
    const label = readPackageSearchBlockLabel(block, context, colors);

    if (block.description === "") {
        return [label];
    }

    return [label, `  ${block.description}`];
}

function readPackageSearchLabel(
    pkg: PackageSearchPackage,
    context: PackageSearchTextContext,
    colors: TerminalColors,
): string {
    const packageId = readPackageSearchId(pkg);

    if (pkg.displayName !== "") {
        const displayName = colors.hex(searchDisplayNameColor)(pkg.displayName);

        if (packageId !== "" && pkg.displayName !== packageId) {
            return `${displayName} (${packageId})`;
        }

        return displayName;
    }

    if (packageId !== "") {
        return packageId;
    }

    return context.translator.t("search.text.unnamedPackage");
}

function readPackageSearchBlockLabel(
    block: PackageSearchBlock,
    context: PackageSearchTextContext,
    colors: TerminalColors,
): string {
    if (block.title !== "") {
        const title = colors.hex(searchBlockTitleColor)(block.title);

        if (block.name !== "" && block.title !== block.name) {
            return `- ${title} (${block.name})`;
        }

        return `- ${title}`;
    }

    if (block.name !== "") {
        return `- ${block.name}`;
    }

    return `- ${context.translator.t("search.text.unnamedBlock")}`;
}
