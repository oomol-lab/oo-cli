import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import type { AuthAccount } from "../../schemas/auth.ts";
import type { TerminalColors } from "../../terminal-colors.ts";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import {
    withRequestTarget,
} from "../../logging/log-fields.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { readCurrentAuth } from "../auth/shared.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";

const searchFormatValues = ["json"] as const;
const skillSearchResultLimit = 5;
const skillSearchTitleColor = "#59F78D";
const skillSearchPackageColor = "#CAA8FA";

const skillSearchItemSchema = z.object({
    description: z.string().optional().default(""),
    icon: z.string().optional().default(""),
    name: z.string().optional().default(""),
    packageName: z.string().optional().default(""),
    packageVersion: z.string().optional().default(""),
    title: z.string().optional().default(""),
});

const skillSearchJsonResponseSchema = z.object({
    data: z.array(skillSearchItemSchema).optional().default([]),
}).passthrough();

const skillSearchResponseSchema = z.object({
    data: z.array(skillSearchItemSchema).optional().default([]),
}).passthrough();

type SkillSearchJsonResponse = z.output<typeof skillSearchJsonResponseSchema>;
type SkillSearchResponse = z.output<typeof skillSearchResponseSchema>;
type SkillSearchTextContext = Pick<CliExecutionContext, "stdout" | "translator">;

interface SkillsSearchInput {
    text: string;
    format?: (typeof searchFormatValues)[number];
    keywords?: string;
}

export const skillsSearchCommand: CliCommandDefinition<SkillsSearchInput> = {
    name: "search",
    aliases: ["find"],
    summaryKey: "commands.skills.search.summary",
    descriptionKey: "commands.skills.search.description",
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
            descriptionKey: "options.keywords",
        },
    ],
    inputSchema: z.object({
        text: z.string(),
        format: z.enum(searchFormatValues).optional(),
        keywords: z.string().optional(),
    }),
    mapInputError: (_, rawInput) => createSkillsSearchInputError(rawInput),
    handler: async (input, context) => {
        const account = await requireCurrentSkillsSearchAccount(context);
        const requestUrl = createSkillsSearchRequestUrl(
            account.endpoint,
            input.text,
            parseSkillSearchKeywords(input.keywords),
        );
        const response = parseSkillsSearchResponse(
            await requestSkillsSearch(requestUrl, account.apiKey, context),
        );

        if (input.format === "json") {
            writeJsonOutput(context.stdout, response.json.data);
            return;
        }

        const output = formatSkillsSearchResponseAsText(response.text, context);

        context.stdout.write(
            output === ""
                ? `${context.translator.t("skills.search.text.noResults")}\n`
                : `${output}\n`,
        );
    },
};

function createSkillsSearchInputError(
    rawInput: Record<string, unknown>,
): CliUserError {
    return new CliUserError("errors.skillsSearch.invalidFormat", 2, {
        value: String(rawInput.format ?? ""),
    });
}

async function requireCurrentSkillsSearchAccount(
    context: CliExecutionContext,
): Promise<AuthAccount> {
    const { authFile, currentAccount } = await readCurrentAuth(context);

    if (currentAccount !== undefined) {
        return currentAccount;
    }

    throw new CliUserError(
        authFile.id === ""
            ? "errors.skillsSearch.authRequired"
            : "errors.skillsSearch.activeAccountMissing",
        1,
    );
}

function createSkillsSearchRequestUrl(
    endpoint: string,
    text: string,
    keywords: readonly string[],
): URL {
    const requestUrl = new URL(
        `https://search.${endpoint}/v1/packages/-/skills-search`,
    );

    requestUrl.searchParams.set("text", text);

    for (const keyword of keywords) {
        requestUrl.searchParams.append("keywords", keyword);
    }

    requestUrl.searchParams.set("size", String(skillSearchResultLimit));

    return requestUrl;
}

function parseSkillSearchKeywords(value: string | undefined): string[] {
    if (value === undefined) {
        return [];
    }

    const keywords: string[] = [];
    const seen = new Set<string>();

    for (const segment of value.split(",")) {
        const keyword = segment.trim();

        if (keyword === "" || seen.has(keyword)) {
            continue;
        }

        seen.add(keyword);
        keywords.push(keyword);
    }

    return keywords;
}

async function requestSkillsSearch(
    requestUrl: URL,
    apiKey: string,
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<string> {
    const requestStartedAt = Date.now();
    const keywordCount = requestUrl.searchParams.getAll("keywords").length;

    context.logger.debug(
        {
            keywordCount,
            textLength: requestUrl.searchParams.get("text")?.length ?? 0,
            ...withRequestTarget(requestUrl.host, requestUrl.pathname),
        },
        "Skills search request started.",
    );

    try {
        const response = await context.fetcher(requestUrl, {
            headers: {
                Authorization: apiKey,
            },
        });
        const durationMs = Date.now() - requestStartedAt;

        if (!response.ok) {
            context.logger.warn(
                {
                    durationMs,
                    keywordCount,
                    status: response.status,
                    ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                },
                "Skills search request returned a non-success status.",
            );
            throw new CliUserError("errors.skillsSearch.requestFailed", 1, {
                status: response.status,
            });
        }

        context.logger.debug(
            {
                durationMs,
                keywordCount,
                status: response.status,
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
            },
            "Skills search request completed.",
        );

        return await response.text();
    }
    catch (error) {
        if (error instanceof CliUserError) {
            throw error;
        }

        context.logger.warn(
            {
                durationMs: Date.now() - requestStartedAt,
                err: error,
                keywordCount,
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
            },
            "Skills search request failed unexpectedly.",
        );
        throw new CliUserError("errors.skillsSearch.requestError", 1, {
            message: error instanceof Error ? error.message : String(error),
        });
    }
}

function parseSkillsSearchResponse(rawResponse: string): {
    json: SkillSearchJsonResponse;
    text: SkillSearchResponse;
} {
    try {
        const parsed = JSON.parse(rawResponse) as unknown;

        return {
            json: skillSearchJsonResponseSchema.parse(parsed),
            text: skillSearchResponseSchema.parse(parsed),
        };
    }
    catch {
        throw new CliUserError("errors.skillsSearch.invalidResponse", 1);
    }
}

function formatSkillsSearchResponseAsText(
    response: SkillSearchResponse,
    context: SkillSearchTextContext,
): string {
    const colors = createSkillsSearchColors(context);

    return response.data
        .map(item => formatSkillsSearchItem(item, context, colors))
        .join("\n\n");
}

function formatSkillsSearchItem(
    item: SkillSearchResponse["data"][number],
    context: SkillSearchTextContext,
    colors: TerminalColors,
): string {
    const lines = [readSkillsSearchItemLabel(item, context, colors)];

    if (item.description !== "") {
        lines.push(item.description);
    }

    const packageLabel = readSkillsSearchPackageLabel(item);

    if (packageLabel !== "") {
        lines.push(
            `${context.translator.t("skills.search.text.package")}: ${colors.hex(skillSearchPackageColor)(packageLabel)}`,
        );
    }

    return lines.join("\n");
}

function readSkillsSearchItemLabel(
    item: SkillSearchResponse["data"][number],
    context: SkillSearchTextContext,
    colors: TerminalColors,
): string {
    if (item.title !== "") {
        const title = colors.hex(skillSearchTitleColor)(item.title);

        if (item.name !== "" && item.title !== item.name) {
            return `${title} (${item.name})`;
        }

        return title;
    }

    if (item.name !== "") {
        return colors.hex(skillSearchTitleColor)(item.name);
    }

    return context.translator.t("skills.search.text.unnamedSkill");
}

function readSkillsSearchPackageLabel(
    item: SkillSearchResponse["data"][number],
): string {
    if (item.packageName === "") {
        return "";
    }

    if (item.packageVersion === "") {
        return item.packageName;
    }

    return `${item.packageName}@${item.packageVersion}`;
}

function createSkillsSearchColors(
    context: Pick<CliExecutionContext, "stdout">,
): TerminalColors {
    return createWriterColors(context.stdout);
}
