import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import {
    formatPackageSearchResultsAsText,
    loadPackageSearchResponse,
    readPackageSearchIds,
} from "./search-provider.ts";

const searchFormatValues = ["json"] as const;

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
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const account = await requireCurrentAccount(context);
        const response = await loadPackageSearchResponse(
            {
                account,
                locale: context.translator.locale,
                text: input.text,
            },
            context,
        );

        if (input.onlyPackageId === true) {
            const packageIds = readPackageSearchIds(response.packages);

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
            writeJsonOutput(context.stdout, response.rawPackages);
            return;
        }

        const output = formatPackageSearchResultsAsText(
            response.packages,
            context,
        );

        context.stdout.write(
            output === ""
                ? `${context.translator.t("search.text.noResults")}\n`
                : `${output}\n`,
        );
    },
};
