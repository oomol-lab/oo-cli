import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import type { TerminalColors } from "../../terminal-colors.ts";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { requestText } from "../shared/request.ts";

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

const skillSearchResponseSchema = z.object({
    data: z.array(skillSearchItemSchema).optional().default([]),
}).passthrough();

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
        const account = await requireCurrentAccount(context, "errors.skillsSearch.authRequired", "errors.skillsSearch.activeAccountMissing");
        const requestUrl = createSkillsSearchRequestUrl(
            account.endpoint,
            input.text,
            parseSkillSearchKeywords(input.keywords),
        );
        const response = parseSkillsSearchResponse(
            await requestSkillsSearch(requestUrl, account.apiKey, context),
        );

        if (input.format === "json") {
            writeJsonOutput(context.stdout, response.data);
            return;
        }

        const output = formatSkillsSearchResponseAsText(response, context);

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
    const keywordCount = requestUrl.searchParams.getAll("keywords").length;

    return await requestText({
        context,
        createRequestFailedError: status => new CliUserError(
            "errors.skillsSearch.requestFailed",
            1,
            {
                status,
            },
        ),
        createUnexpectedError: error => new CliUserError(
            "errors.skillsSearch.requestError",
            1,
            {
                message: error instanceof Error ? error.message : String(error),
            },
        ),
        fields: {
            common: {
                keywordCount,
            },
            start: {
                textLength: requestUrl.searchParams.get("text")?.length ?? 0,
            },
        },
        init: {
            headers: {
                Authorization: apiKey,
            },
        },
        requestLabel: "Skills search",
        requestUrl,
    });
}

function parseSkillsSearchResponse(rawResponse: string): SkillSearchResponse {
    try {
        return skillSearchResponseSchema.parse(
            JSON.parse(rawResponse) as unknown,
        );
    }
    catch {
        throw new CliUserError("errors.skillsSearch.invalidResponse", 1);
    }
}

function formatSkillsSearchResponseAsText(
    response: SkillSearchResponse,
    context: SkillSearchTextContext,
): string {
    const colors = createWriterColors(context.stdout);

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
