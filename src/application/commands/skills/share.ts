import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { PackageInfoResponse } from "../package/shared.ts";

import { readFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { resolveRequestLanguage } from "../../../i18n/locale.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { loadPackageInfo, parsePackageSpecifier } from "../package/shared.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { writeLine } from "../shared/output.ts";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import { directoryExists } from "./bundled-skill-observation.ts";
import {
    confirmInteractiveValue,
    requestInteractiveText,
} from "./interactive-prompts.ts";
import { readManagedSkillMetadata } from "./managed-skill-metadata.ts";
import {
    resolveLocalSkillCanonicalDirectoryPath,
    resolveManagedSkillCanonicalDirectoryPath,
} from "./managed-skill-paths.ts";
import { createSkillPackageHubUrl } from "./publish.ts";
import {
    isSkillFrontmatterRecord,
    parseSkillMarkdownMatter,
    toNonBlankString,
} from "./skill-frontmatter.ts";

interface SkillsShareInput {
    skill?: string;
    yes?: boolean;
}

interface SkillShareTarget {
    packageName: string;
    skillId: string;
    sourceKind: "local" | "package" | "path" | "registry";
}

type SkillShareContext = Pick<
    CliExecutionContext,
    | "cacheStore"
    | "cwd"
    | "fetcher"
    | "logger"
    | "settingsStore"
    | "stdin"
    | "stdout"
    | "translator"
>;

export const skillsShareCommand: CliCommandDefinition<SkillsShareInput> = {
    name: "share",
    summaryKey: "commands.skills.share.summary",
    descriptionKey: "commands.skills.share.description",
    arguments: [
        {
            name: "skill",
            descriptionKey: "arguments.skill",
            required: false,
        },
    ],
    options: [
        {
            name: "yes",
            longFlag: "--yes",
            shortFlag: "-y",
            descriptionKey: "options.yes",
        },
    ],
    inputSchema: z.object({
        skill: z.string().optional(),
        yes: z.boolean().optional(),
    }),
    handler: async (input, context) => {
        await shareSkill(input, context);
    },
};

async function shareSkill(
    input: SkillsShareInput,
    context: CliExecutionContext,
): Promise<void> {
    const account = await requireCurrentAccount(context);
    const target = await resolveSkillShareTarget(input.skill, context);
    const packageInfo = await loadPublicSharePackageInfo(target, account, context);

    await confirmSkillShareTarget(target, context, input.yes === true);

    context.logger.info(
        {
            packageName: packageInfo.packageName,
            packageVersion: packageInfo.packageVersion,
            skillId: target.skillId,
            sourceKind: target.sourceKind,
        },
        "Skill share prompt generated.",
    );

    writeLine(
        context.stdout,
        context.translator.t("skills.share.success", {
            packageName: packageInfo.packageName,
            skillName: target.skillId,
        }),
    );
    writeLine(context.stdout, "");
    writeLine(
        context.stdout,
        renderSkillSharePrompt({
            hubUrl: createSkillPackageHubUrl(account.endpoint, packageInfo.packageName),
            packageName: packageInfo.packageName,
            skillId: target.skillId,
        }),
    );
}

async function resolveSkillShareTarget(
    rawReference: string | undefined,
    context: SkillShareContext,
): Promise<SkillShareTarget> {
    const reference = await readSkillShareReference(rawReference, context);

    if (isSkillIdReference(reference)) {
        const managedTarget = await resolveManagedSkillShareTarget(
            reference,
            context.settingsStore.getFilePath(),
        );

        if (managedTarget !== undefined) {
            return managedTarget;
        }
    }

    const pathTarget = await resolvePathSkillShareTarget(reference, context);

    if (pathTarget !== undefined) {
        return pathTarget;
    }

    const packageSpecifier = parsePackageSpecifier(reference);

    return {
        packageName: packageSpecifier.packageName,
        skillId: resolveSkillIdFromPackageName(packageSpecifier.packageName),
        sourceKind: "package",
    };
}

async function readSkillShareReference(
    rawReference: string | undefined,
    context: SkillShareContext,
): Promise<string> {
    const reference = rawReference?.trim();

    if (reference !== undefined && reference !== "") {
        return reference;
    }

    if (context.stdin.isTTY !== true) {
        throw new CliUserError("errors.skills.share.referenceRequired", 1);
    }

    const promptedReference = await requestInteractiveText(context, {
        prompt: context.translator.t("skills.share.reference.prompt"),
    });

    if (promptedReference === "") {
        throw new CliUserError("errors.skills.share.referenceRequired", 1);
    }

    return promptedReference;
}

async function resolveManagedSkillShareTarget(
    skillId: string,
    settingsFilePath: string,
): Promise<SkillShareTarget | undefined> {
    const localSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
        settingsFilePath,
        skillId,
    );

    if (await directoryExists(localSkillDirectoryPath)) {
        return {
            packageName: await readPublishedSkillPackageName(
                localSkillDirectoryPath,
                skillId,
            ),
            skillId,
            sourceKind: "local",
        };
    }

    const registrySkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
        settingsFilePath,
        skillId,
    );

    if (!(await directoryExists(registrySkillDirectoryPath))) {
        return undefined;
    }

    const metadata = await readManagedSkillMetadata(registrySkillDirectoryPath);

    if (metadata === undefined) {
        throw new CliUserError("errors.skills.share.notPublished", 1, {
            name: skillId,
        });
    }

    return {
        packageName: metadata.packageName,
        skillId,
        sourceKind: "registry",
    };
}

async function resolvePathSkillShareTarget(
    reference: string,
    context: SkillShareContext,
): Promise<SkillShareTarget | undefined> {
    const skillDirectoryPath = isAbsolute(reference)
        ? resolve(reference)
        : resolve(context.cwd, reference);
    const skillFilePath = join(skillDirectoryPath, "SKILL.md");
    let content: string;

    try {
        content = await readFile(skillFilePath, "utf8");
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return undefined;
        }

        throw error;
    }

    const parsed = parseSkillMarkdownMatter(content);
    const skillId = toNonBlankString(parsed.data.name) ?? basename(skillDirectoryPath);

    return {
        packageName: readPublishedSkillPackageNameFromFrontmatter(
            parsed.data,
            skillId,
        ),
        skillId,
        sourceKind: "path",
    };
}

async function readPublishedSkillPackageName(
    skillDirectoryPath: string,
    skillId: string,
): Promise<string> {
    const skillFilePath = join(skillDirectoryPath, "SKILL.md");
    const parsed = parseSkillMarkdownMatter(await readFile(skillFilePath, "utf8"));

    return readPublishedSkillPackageNameFromFrontmatter(parsed.data, skillId);
}

function readPublishedSkillPackageNameFromFrontmatter(
    frontmatter: Readonly<Record<PropertyKey, unknown>>,
    skillId: string,
): string {
    if (!isSkillFrontmatterRecord(frontmatter.metadata)) {
        throw new CliUserError("errors.skills.share.notPublished", 1, {
            name: skillId,
        });
    }

    const packageName = toNonBlankString(frontmatter.metadata.packageName);

    if (packageName === undefined) {
        throw new CliUserError("errors.skills.share.notPublished", 1, {
            name: skillId,
        });
    }

    return packageName;
}

async function loadPublicSharePackageInfo(
    target: SkillShareTarget,
    account: AuthAccount,
    context: Pick<
        CliExecutionContext,
        "cacheStore" | "fetcher" | "logger" | "translator"
    >,
): Promise<PackageInfoResponse> {
    const packageInfo = await loadSharePackageInfo(target, account, context);

    if (packageInfo.access !== "public") {
        throw new CliUserError("errors.skills.share.notPublic", 1, {
            packageName: target.packageName,
            visibility: packageInfo.access ?? "unknown",
        });
    }

    return packageInfo;
}

async function loadSharePackageInfo(
    target: SkillShareTarget,
    account: AuthAccount,
    context: Pick<
        CliExecutionContext,
        "cacheStore" | "fetcher" | "logger" | "translator"
    >,
): Promise<PackageInfoResponse> {
    try {
        return await loadPackageInfo(
            parsePackageSpecifier(target.packageName),
            account,
            resolveRequestLanguage(context.translator.locale),
            context,
        );
    }
    catch (error) {
        if (
            error instanceof CliUserError
            && error.key === "errors.packageInfo.requestFailed"
            && error.params?.status === 404
        ) {
            throw new CliUserError("errors.skills.share.notPublished", 1, {
                name: target.skillId,
            });
        }

        throw error;
    }
}

async function confirmSkillShareTarget(
    target: SkillShareTarget,
    context: SkillShareContext,
    yes: boolean,
): Promise<void> {
    const params = {
        name: target.skillId,
        packageName: target.packageName,
    };

    if (yes) {
        return;
    }

    if (context.stdin.isTTY !== true) {
        throw new CliUserError(
            "errors.skills.share.confirmationRequired",
            1,
            params,
        );
    }

    const confirmed = await confirmInteractiveValue(context, {
        invalidMessage: context.translator.t("skills.share.confirm.invalid"),
        prompt: context.translator.t("skills.share.confirm.prompt", params),
    });

    if (!confirmed) {
        throw new CliUserError("errors.skills.share.cancelled", 1, params);
    }
}

function renderSkillSharePrompt(options: {
    hubUrl: string;
    packageName: string;
    skillId: string;
}): string {
    return [
        `Please help me install this public OO skill. Assume I may not have OO CLI installed yet, and guide me from installing OO CLI through logging in and installing the skill.`,
        "",
        `The skill is already published and public:`,
        `Package: ${options.packageName}`,
        `Skill: ${options.skillId}`,
        `Hub: ${options.hubUrl}`,
        "",
        `Complete these steps in one continuous setup flow. Do not stop after installing OO CLI; continue through login and skill installation in the same session.`,
        "",
        `1. Install OO CLI.`,
        `2. Run \`oo login\` and sign in or create an OO account.`,
        `3. Install the skill with the command below.`,
        "",
        `macOS / Linux:`,
        "```bash",
        "curl -fsSL https://cli.oomol.com/install.sh | bash",
        "oo login",
        `oo skills install ${options.packageName} --skill ${options.skillId} -y`,
        "```",
        "",
        `Windows PowerShell:`,
        "```powershell",
        "irm https://cli.oomol.com/install.ps1 | iex",
        "oo login",
        `oo skills install ${options.packageName} --skill ${options.skillId} -y`,
        "```",
    ].join("\n");
}

function isSkillIdReference(value: string): boolean {
    const trimmedValue = value.trim();

    return trimmedValue !== ""
        && trimmedValue !== "."
        && trimmedValue !== ".."
        && basename(trimmedValue) === trimmedValue;
}

function resolveSkillIdFromPackageName(packageName: string): string {
    const separatorIndex = packageName.lastIndexOf("/");

    if (separatorIndex < 0 || separatorIndex === packageName.length - 1) {
        return packageName;
    }

    return packageName.slice(separatorIndex + 1);
}
