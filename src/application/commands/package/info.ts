import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { TerminalColors } from "../../terminal-colors.ts";
import type { PackageInfoResponse } from "./shared.ts";
import { z } from "zod";
import { resolveRequestLanguage } from "../../../i18n/locale.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import {
    isPackageInfoInputHandleOptional,
    isPackageInfoSchemaObject,
    loadPackageInfo,
    parsePackageSpecifier,
} from "./shared.ts";

const packageInfoFormatValues = ["json"] as const;
const packageInfoDisplayNameColor = "#59F78D";
const packageInfoBlockTitleColor = "#CAA8FA";

type PackageInfoFormat = (typeof packageInfoFormatValues)[number];
type PackageInfoTextContext = Pick<CliExecutionContext, "stdout" | "translator">;

interface PackageInfoInput {
    format?: PackageInfoFormat;
    packageSpecifier: string;
}

export const packageInfoCommand: CliCommandDefinition<PackageInfoInput> = {
    name: "info",
    summaryKey: "commands.package.info.summary",
    descriptionKey: "commands.package.info.description",
    missingArgumentBehavior: "showHelp",
    arguments: [
        {
            name: "packageSpecifier",
            descriptionKey: "arguments.packageSpecifier",
            required: true,
        },
    ],
    options: [...jsonOutputOptions],
    inputSchema: z.object({
        format: z.enum(packageInfoFormatValues).optional(),
        packageSpecifier: z.string(),
    }),
    mapInputError: (_, rawInput) => createPackageInfoInputError(rawInput),
    handler: async (input, context) => {
        const account = await requireCurrentPackageInfoAccount(context);
        const packageSpecifier = parsePackageSpecifier(input.packageSpecifier);
        const response = await loadPackageInfo(
            packageSpecifier,
            account,
            resolveRequestLanguage(context.translator.locale),
            context,
        );

        if (input.format === "json") {
            writeJsonOutput(context.stdout, response);
            return;
        }

        context.stdout.write(`${formatPackageInfoResponseAsText(response, context)}\n`);
    },
};

function createPackageInfoInputError(rawInput: Record<string, unknown>): CliUserError {
    return new CliUserError("errors.packageInfo.invalidFormat", 2, {
        value: String(rawInput.format ?? ""),
    });
}

async function requireCurrentPackageInfoAccount(
    context: CliExecutionContext,
): Promise<AuthAccount> {
    return requireCurrentAccount(
        context,
        "errors.packageInfo.authRequired",
        "errors.packageInfo.activeAccountMissing",
    );
}

function formatPackageInfoResponseAsText(
    response: PackageInfoResponse,
    context: PackageInfoTextContext,
): string {
    const colors = createPackageInfoColors(context);
    const lines = [readPackageInfoLabel(response, colors)];

    if (response.description !== "") {
        lines.push(response.description);
    }

    if (response.blocks.length > 0) {
        lines.push("");

        for (const [index, block] of response.blocks.entries()) {
            if (index > 0) {
                lines.push("");
            }

            lines.push(...formatPackageInfoBlock(block, context, colors));
        }
    }

    return lines.join("\n");
}

function formatPackageInfoBlock(
    block: PackageInfoResponse["blocks"][number],
    context: PackageInfoTextContext,
    colors: TerminalColors,
): string[] {
    const lines = [readPackageInfoBlockLabel(block, colors)];

    if (block.description !== "") {
        lines.push(`  ${block.description}`);
    }

    lines.push(
        ...formatPackageInfoInputHandleSection(
            context.translator.t("packageInfo.text.inputHandle"),
            block.inputHandle,
            context,
        ),
    );
    lines.push(
        ...formatPackageInfoOutputHandleSection(
            context.translator.t("packageInfo.text.outputHandle"),
            block.outputHandle,
        ),
    );

    return lines;
}

function formatPackageInfoInputHandleSection(
    title: string,
    handleMap: PackageInfoResponse["blocks"][number]["inputHandle"],
    context: PackageInfoTextContext,
): string[] {
    const handleEntries = Object.entries(handleMap).map(([handleName, handle]) => ({
        handleName,
        description: handle.description,
        requirementLabel: readPackageInfoRequirementLabel(handle, context),
        schemaSummary: formatPackageInfoSchemaSummary(handle.schema),
    }));

    if (handleEntries.length === 0) {
        return [];
    }

    const lines = [`  ${title}`];
    const handleNameWidth = Math.max(
        ...handleEntries.map(handle => handle.handleName.length),
    );
    const schemaWidth = Math.max(
        ...handleEntries.map(handle => handle.schemaSummary.length),
    );
    const requirementWidth = Math.max(
        ...handleEntries.map(handle => handle.requirementLabel.length),
    );

    for (const handle of handleEntries) {
        const handleName = handle.handleName.padEnd(handleNameWidth, " ");
        const schemaSummary = handle.schemaSummary.padEnd(schemaWidth, " ");
        const requirementLabel = handle.requirementLabel.padEnd(requirementWidth, " ");
        let line = `    - ${handleName}  ${schemaSummary}  ${requirementLabel}`;

        if (handle.description !== "") {
            line += `  ${handle.description}`;
        }

        lines.push(line.trimEnd());
    }

    return lines;
}

function formatPackageInfoOutputHandleSection(
    title: string,
    handleMap: PackageInfoResponse["blocks"][number]["outputHandle"],
): string[] {
    const handleEntries = Object.entries(handleMap).map(([handleName, handle]) => ({
        handleName,
        description: handle.description,
        schemaSummary: formatPackageInfoSchemaSummary(handle.schema),
    }));

    if (handleEntries.length === 0) {
        return [];
    }

    const lines = [`  ${title}`];
    const handleNameWidth = Math.max(
        ...handleEntries.map(handle => handle.handleName.length),
    );
    const schemaWidth = Math.max(
        ...handleEntries.map(handle => handle.schemaSummary.length),
    );

    for (const handle of handleEntries) {
        const handleName = handle.handleName.padEnd(handleNameWidth, " ");
        const schemaSummary = handle.schemaSummary.padEnd(schemaWidth, " ");
        let line = `    - ${handleName}  ${schemaSummary}`;

        if (handle.description !== "") {
            line += `  ${handle.description}`;
        }

        lines.push(line.trimEnd());
    }

    return lines;
}

function readPackageInfoRequirementLabel(
    handle: PackageInfoResponse["blocks"][number]["inputHandle"][string],
    context: PackageInfoTextContext,
): string {
    if (isPackageInfoInputHandleOptional(handle)) {
        return context.translator.t("packageInfo.text.optional");
    }

    return context.translator.t("packageInfo.text.required");
}

function formatPackageInfoSchemaSummary(schema: unknown): string {
    const typeNames = readPackageInfoSchemaTypeNames(schema);
    const contentMediaTypeLabel = readPackageInfoContentMediaTypeLabel(schema);
    const summary = typeNames.length > 0 ? typeNames.join(" | ") : "unknown";

    if (contentMediaTypeLabel === "") {
        return summary;
    }

    return `${summary} (${contentMediaTypeLabel})`;
}

function readPackageInfoSchemaTypeNames(schema: unknown): string[] {
    if (!isPackageInfoSchemaObject(schema)) {
        return [];
    }

    const directTypeNames = readPackageInfoDirectTypeNames(schema);

    if (directTypeNames.length > 0) {
        return Array.from(new Set(
            directTypeNames.map((typeName) => {
                if (typeName === "array") {
                    return readPackageInfoArrayTypeName(schema);
                }

                return typeName;
            }),
        ));
    }

    const anyOfTypeNames = readPackageInfoVariantTypeNames(schema.anyOf);

    if (anyOfTypeNames.length > 0) {
        return anyOfTypeNames;
    }

    const oneOfTypeNames = readPackageInfoVariantTypeNames(schema.oneOf);

    if (oneOfTypeNames.length > 0) {
        return oneOfTypeNames;
    }

    return [];
}

function readPackageInfoDirectTypeNames(schema: Record<string, unknown>): string[] {
    if (typeof schema.type === "string") {
        return [schema.type];
    }

    if (!Array.isArray(schema.type)) {
        return [];
    }

    return schema.type.filter((typeName): typeName is string => typeof typeName === "string");
}

function readPackageInfoVariantTypeNames(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return Array.from(new Set(
        value.flatMap(item => readPackageInfoSchemaTypeNames(item)),
    ));
}

function readPackageInfoArrayTypeName(schema: Record<string, unknown>): string {
    const itemTypeNames = readPackageInfoSchemaTypeNames(schema.items);

    if (itemTypeNames.length === 0) {
        return "Array<unknown>";
    }

    return `Array<${itemTypeNames.join(" | ")}>`;
}

function readPackageInfoContentMediaTypeLabel(schema: unknown): string {
    if (!isPackageInfoSchemaObject(schema)) {
        return "";
    }

    if (typeof schema.contentMediaType !== "string" || schema.contentMediaType === "") {
        return "";
    }

    return schema.contentMediaType.startsWith("oomol/")
        ? schema.contentMediaType.slice("oomol/".length)
        : schema.contentMediaType;
}

function readPackageInfoLabel(
    response: PackageInfoResponse,
    colors: TerminalColors,
): string {
    const packageId = `${response.packageName}@${response.packageVersion}`;

    if (response.displayName !== "") {
        const displayName = colors.hex(packageInfoDisplayNameColor)(response.displayName);

        if (response.displayName !== packageId) {
            return `${displayName} (${packageId})`;
        }

        return displayName;
    }

    return packageId;
}

function readPackageInfoBlockLabel(
    block: PackageInfoResponse["blocks"][number],
    colors: TerminalColors,
): string {
    if (block.title !== "") {
        const title = colors.hex(packageInfoBlockTitleColor)(block.title);

        if (block.blockName !== "" && block.title !== block.blockName) {
            return `- ${title} (${block.blockName})`;
        }

        return `- ${title}`;
    }

    if (block.blockName !== "") {
        return `- ${block.blockName}`;
    }

    return "- unnamed-block";
}

function createPackageInfoColors(
    context: Pick<CliExecutionContext, "stdout">,
): TerminalColors {
    return createWriterColors(context.stdout);
}
