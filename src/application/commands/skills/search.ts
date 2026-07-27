import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import type { AuthAccount } from "../../schemas/auth.ts";
import type { TerminalColors } from "../../terminal-colors.ts";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import {
    bucketTelemetryCount,
    bucketTelemetryStringLength,
} from "../../telemetry/buckets.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { outputFormatOptions, writeJsonOutput } from "../command-output.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { parseCommaSeparatedKeywords } from "../shared/keywords.ts";
import { requestOo } from "../shared/oo-request.ts";

const searchFormatValues = ["json"] as const;
const skillSearchResultLimit = 5;
const skillSearchDisplayNameColor = "#59F78D";
const skillSearchPackageColor = "#CAA8FA";

const skillSearchItemSchema = z.object({
    description: z.string().optional().default(""),
    name: z.string().optional().default(""),
    packageName: z.string().optional().default(""),
    packageVersion: z.string().optional().default(""),
    title: z.string().optional().default(""),
}).transform(item => ({
    description: item.description,
    name: item.name,
    packageName: item.packageName,
    packageVersion: item.packageVersion,
    skillDisplayName: item.title,
}));

const skillSearchResponseSchema = z.object({
    data: z.array(skillSearchItemSchema).optional().default([]),
});

type SkillSearchItem = z.output<typeof skillSearchItemSchema>;
type SkillSearchResponse = z.output<typeof skillSearchResponseSchema>;

type SkillSearchTextContext = Pick<CliExecutionContext, "stdout" | "translator">;

interface SkillsSearchInput {
    text: string;
    format?: (typeof searchFormatValues)[number];
    keywords?: string;
    showSchemaVersion?: boolean;
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
        ...outputFormatOptions,
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
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const keywords = parseCommaSeparatedKeywords(input.keywords);

        context.telemetry?.recordProperties({
            keyword_count_bucket: bucketTelemetryCount(keywords.length),
            query_length_bucket: bucketTelemetryStringLength(input.text),
        });

        const { account } = await requireIdentity(context);
        const response = await requestSkillsSearch(
            input.text,
            keywords,
            account,
            context,
        );

        context.telemetry?.recordProperties({
            result_count_bucket: bucketTelemetryCount(response.data.length),
        });

        if (input.format === "json") {
            writeJsonOutput(context.stdout, response.data, {
                showSchemaVersion: input.showSchemaVersion,
            });
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

async function requestSkillsSearch(
    text: string,
    keywords: readonly string[],
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<SkillSearchResponse> {
    return await requestOo({
        authorization: account.apiKey,
        context,
        errors: { scope: "skillsSearch" },
        host: { endpoint: account.endpoint, service: "search" },
        label: "Skills search",
        logFields: {
            common: {
                keywordCount: keywords.length,
            },
            start: {
                textLength: text.length,
            },
        },
        path: "/v1/packages/-/skills-search",
        // Query entries are appended in insertion order; the blank line keeps
        // the key sorter from breaking the historical wire order
        // (text, keywords, size).
        query: {
            text,

            keywords,
            size: String(skillSearchResultLimit),
        },
        schema: skillSearchResponseSchema,
    });
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
    item: SkillSearchItem,
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
    item: SkillSearchItem,
    context: SkillSearchTextContext,
    colors: TerminalColors,
): string {
    if (item.skillDisplayName !== "") {
        const skillDisplayName = colors.hex(skillSearchDisplayNameColor)(
            item.skillDisplayName,
        );

        if (item.name !== "" && item.skillDisplayName !== item.name) {
            return `${skillDisplayName} (${item.name})`;
        }

        return skillDisplayName;
    }

    if (item.name !== "") {
        return colors.hex(skillSearchDisplayNameColor)(item.name);
    }

    return context.translator.t("skills.search.text.unnamedSkill");
}

function readSkillsSearchPackageLabel(
    item: SkillSearchItem,
): string {
    if (item.packageName === "") {
        return "";
    }

    if (item.packageVersion === "") {
        return item.packageName;
    }

    return `${item.packageName}@${item.packageVersion}`;
}
