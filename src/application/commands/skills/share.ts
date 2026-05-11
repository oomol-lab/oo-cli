import type {
    CliCommandDefinition,
    CliExecutionContext,
    SupportedLocale,
} from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { PackageInfoResponse } from "../package/shared.ts";

import { readFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { resolveRequestLanguage } from "../../../i18n/locale.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { withPackageIdentity } from "../../logging/log-fields.ts";
import { loadPackageInfo, parsePackageSpecifier } from "../package/shared.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { writeLine } from "../shared/output.ts";
import { requestText } from "../shared/request.ts";
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
    days?: string;
    downloads?: string;
    skill?: string;
    yes?: boolean;
}

interface SkillShareTarget {
    packageName?: string;
    packageNameFallback: string;
    skillId: string;
    sourceKind: "local" | "package" | "path" | "registry";
}

interface SkillShareLimits {
    days: number;
    downloads?: number;
}

interface SkillSharePromptOptions extends SkillSharePackageLineOptions {
    installCommand: string;
    locale: SupportedLocale;
}

interface SkillSharePackageLineOptions {
    hubUrl: string;
    installPackageSpecifier: string;
    packageName: string;
    shareKind: SkillShareKind;
    skillId: string;
    visibility: SkillShareVisibility;
}

type SkillShareKind = "package" | "skill";
type SkillShareVisibility = "private" | "public";

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

const defaultSkillShareDays = 7;
const maxSkillShareDays = 7;

const packageShareResponseSchema = z.object({
    shareID: z.string().trim().min(1),
}).passthrough();

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
            name: "downloads",
            longFlag: "--downloads",
            valueName: "downloads",
            descriptionKey: "options.downloads",
        },
        {
            name: "days",
            longFlag: "--days",
            valueName: "days",
            descriptionKey: "options.days",
        },
        {
            name: "yes",
            longFlag: "--yes",
            shortFlag: "-y",
            descriptionKey: "options.yes",
        },
    ],
    inputSchema: z.object({
        days: z.string().optional(),
        downloads: z.string().optional(),
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
    const limits = parseSkillShareLimits(input);
    const account = await requireCurrentAccount(context);
    const target = await resolveSkillShareTarget(input.skill, context);
    const packageInfo = await loadSharePackageInfo(target, account, context);
    const shareKind = resolveSkillShareKind(target);
    const visibility = resolveSkillShareVisibility(packageInfo);

    await confirmSkillShareTarget(
        {
            ...target,
            packageName: packageInfo.packageName,
        },
        context,
        input.yes === true,
        shareKind,
    );

    const installPackageSpecifier = visibility === "public"
        ? packageInfo.packageName
        : await createPrivateSkillPackageShareSpecifier(
                packageInfo.packageName,
                limits,
                account,
                context,
            );

    context.logger.info(
        {
            packageName: packageInfo.packageName,
            packageVersion: packageInfo.packageVersion,
            shareKind,
            skillId: target.skillId,
            sourceKind: target.sourceKind,
            visibility,
        },
        "Share prompt generated.",
    );

    writeLine(
        context.stdout,
        context.translator.t(resolveSkillShareSuccessMessageKey(shareKind), {
            packageName: packageInfo.packageName,
            skillName: target.skillId,
            visibility: renderSkillShareVisibilityLabel(
                context.translator.locale,
                visibility,
            ),
        }),
    );
    writeLine(context.stdout, "");
    writeLine(
        context.stdout,
        renderSkillSharePrompt({
            hubUrl: createSkillPackageHubUrl(account.endpoint, packageInfo.packageName),
            installCommand: createSkillShareInstallCommand(
                installPackageSpecifier,
                shareKind,
                target.skillId,
            ),
            installPackageSpecifier,
            locale: context.translator.locale,
            packageName: packageInfo.packageName,
            shareKind,
            skillId: target.skillId,
            visibility,
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
        packageNameFallback: packageSpecifier.packageName,
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
    const trimmedPromptedReference = promptedReference.trim();

    if (trimmedPromptedReference === "") {
        throw new CliUserError("errors.skills.share.referenceRequired", 1);
    }

    return trimmedPromptedReference;
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
            ),
            packageNameFallback: skillId,
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

    return {
        packageName: metadata?.packageName,
        packageNameFallback: skillId,
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
        ),
        packageNameFallback: skillId,
        skillId,
        sourceKind: "path",
    };
}

async function readPublishedSkillPackageName(
    skillDirectoryPath: string,
): Promise<string | undefined> {
    const skillFilePath = join(skillDirectoryPath, "SKILL.md");
    try {
        const parsed = parseSkillMarkdownMatter(
            await readFile(skillFilePath, "utf8"),
        );

        return readPublishedSkillPackageNameFromFrontmatter(parsed.data);
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return undefined;
        }

        throw error;
    }
}

function readPublishedSkillPackageNameFromFrontmatter(
    frontmatter: Readonly<Record<PropertyKey, unknown>>,
): string | undefined {
    if (!isSkillFrontmatterRecord(frontmatter.metadata)) {
        return undefined;
    }

    return toNonBlankString(frontmatter.metadata.packageName);
}

async function loadSharePackageInfo(
    target: SkillShareTarget,
    account: AuthAccount,
    context: Pick<
        CliExecutionContext,
        "cacheStore" | "fetcher" | "logger" | "translator"
    >,
): Promise<PackageInfoResponse> {
    const packageName = resolveSkillSharePackageName(target);

    try {
        return await loadPackageInfo(
            parsePackageSpecifier(packageName),
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
                name: packageName,
            });
        }

        throw error;
    }
}

function resolveSkillSharePackageName(target: SkillShareTarget): string {
    return parsePackageSpecifier(
        target.packageName ?? target.packageNameFallback,
    ).packageName;
}

function resolveSkillShareKind(target: SkillShareTarget): SkillShareKind {
    if (target.sourceKind === "package" || target.packageName === undefined) {
        return "package";
    }

    return "skill";
}

function resolveSkillShareSuccessMessageKey(shareKind: SkillShareKind): string {
    return shareKind === "skill"
        ? "skills.share.success"
        : "skills.share.packageSuccess";
}

function resolveSkillShareVisibility(
    packageInfo: PackageInfoResponse,
): SkillShareVisibility {
    if (packageInfo.access === "private" || packageInfo.access === "restricted") {
        return "private";
    }

    return "public";
}

function renderSkillShareVisibilityLabel(
    locale: SupportedLocale,
    visibility: SkillShareVisibility,
): string {
    if (locale === "zh") {
        return visibility === "public" ? "公开" : "私有";
    }

    return visibility;
}

function parseSkillShareLimits(input: SkillsShareInput): SkillShareLimits {
    return {
        days: parseSkillShareNumberOption(input.days, {
            defaultValue: defaultSkillShareDays,
            max: maxSkillShareDays,
            optionName: "--days",
        }) ?? defaultSkillShareDays,
        downloads: parseSkillShareNumberOption(input.downloads, {
            defaultValue: undefined,
            optionName: "--downloads",
        }),
    };
}

function parseSkillShareNumberOption(
    value: string | undefined,
    options: {
        defaultValue?: number;
        max?: number;
        optionName: string;
    },
): number | undefined {
    if (value === undefined) {
        return options.defaultValue;
    }

    const trimmedValue = value.trim();

    if (trimmedValue === "") {
        return options.defaultValue;
    }

    const parsedValue = Number(trimmedValue);

    if (Number.isNaN(parsedValue)) {
        throw createInvalidSkillShareNumberError(options.optionName, value);
    }

    if (
        !Number.isSafeInteger(parsedValue)
        || parsedValue < 1
        || (options.max !== undefined && parsedValue > options.max)
    ) {
        return options.defaultValue;
    }

    return parsedValue;
}

function createInvalidSkillShareNumberError(
    optionName: string,
    value: string,
): CliUserError {
    return new CliUserError("errors.skills.share.invalidNumberOption", 2, {
        option: optionName,
        value,
    });
}

async function createPrivateSkillPackageShareSpecifier(
    packageName: string,
    limits: SkillShareLimits,
    account: AuthAccount,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<string> {
    const shareId = await requestPrivateSkillPackageShare(
        packageName,
        limits,
        account,
        context,
    );

    return `${packageName}#${shareId}`;
}

async function requestPrivateSkillPackageShare(
    packageName: string,
    limits: SkillShareLimits,
    account: AuthAccount,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<string> {
    const rawResponse = await requestText({
        context,
        createRequestFailedError: status => new CliUserError(
            "errors.skills.share.requestFailed",
            1,
            { status },
        ),
        createUnexpectedError: error => new CliUserError(
            "errors.skills.share.requestError",
            1,
            {
                message: error instanceof Error ? error.message : String(error),
            },
        ),
        fields: {
            common: withPackageIdentity(packageName),
        },
        init: {
            body: JSON.stringify(createPrivateSkillPackageShareRequestBody(limits)),
            headers: {
                "Authorization": account.apiKey,
                "Content-Type": "application/json",
            },
            method: "POST",
        },
        requestLabel: "Skills private package share",
        requestUrl: createPrivateSkillPackageShareRequestUrl(
            account.endpoint,
            packageName,
        ),
    });

    try {
        return packageShareResponseSchema.parse(
            JSON.parse(rawResponse) as unknown,
        ).shareID;
    }
    catch {
        throw new CliUserError("errors.skills.share.invalidResponse", 1);
    }
}

function createPrivateSkillPackageShareRequestBody(
    limits: SkillShareLimits,
): { days: number; downloads?: number } {
    return {
        ...(limits.downloads === undefined ? {} : { downloads: limits.downloads }),
        days: limits.days,
    };
}

function createPrivateSkillPackageShareRequestUrl(
    endpoint: string,
    packageName: string,
): URL {
    return new URL(
        `https://registry.${endpoint}/-/oomol/package-shares/share/${encodeURIComponent(packageName)}`,
    );
}

async function confirmSkillShareTarget(
    target: SkillShareTarget & { packageName: string },
    context: SkillShareContext,
    yes: boolean,
    shareKind: SkillShareKind,
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
        prompt: context.translator.t(
            shareKind === "skill"
                ? "skills.share.confirm.prompt"
                : "skills.share.confirm.packagePrompt",
            params,
        ),
    });

    if (!confirmed) {
        throw new CliUserError("errors.skills.share.cancelled", 1, params);
    }
}

function renderSkillSharePrompt(options: SkillSharePromptOptions): string {
    const content = options.locale === "zh"
        ? renderChineseSkillSharePrompt(options)
        : renderEnglishSkillSharePrompt(options);

    return [
        "```text",
        content,
        "```",
    ].join("\n");
}

function renderEnglishSkillSharePrompt(
    options: Omit<SkillSharePromptOptions, "locale">,
): string {
    const packageLines = createEnglishSkillSharePackageLines(options);
    const subject = options.shareKind === "skill" ? "skill" : "package";

    return [
        `Please help me install this OO ${subject}. Assume I may not have OO CLI installed yet, and guide me from installing OO CLI through logging in and installing the ${subject}.`,
        "",
        ...packageLines,
        "",
        `Complete these steps in one continuous setup flow. Do not stop after installing OO CLI; continue through login and ${subject} installation in the same session.`,
        "",
        `1. Install OO CLI.`,
        `2. Run \`oo login\` and sign in or create an OO account.`,
        `3. Install the ${subject} with the command below.`,
        "",
        `macOS / Linux:`,
        "curl -fsSL https://cli.oomol.com/install.sh | bash",
        "oo login",
        options.installCommand,
        "",
        `Windows PowerShell:`,
        "irm https://cli.oomol.com/install.ps1 | iex",
        "oo login",
        options.installCommand,
    ].join("\n");
}

function renderChineseSkillSharePrompt(
    options: Omit<SkillSharePromptOptions, "locale">,
): string {
    const packageLines = createChineseSkillSharePackageLines(options);
    const subject = options.shareKind === "skill" ? "skill" : "package";

    return [
        `请帮我安装这个 OO ${subject}。假设我可能还没有安装 OO CLI，请从安装 OO CLI 开始，引导我登录并安装这个 ${subject}。`,
        "",
        ...packageLines,
        "",
        `请在一个连续的设置流程中完成以下步骤。不要在安装 OO CLI 后停下；请在同一会话中继续登录并安装 ${subject}。`,
        "",
        "1. 安装 OO CLI。",
        "2. 运行 `oo login` 并登录或创建 OO 账号。",
        `3. 使用下面的命令安装 ${subject}。`,
        "",
        "macOS / Linux:",
        "curl -fsSL https://cli.oomol.com/install.sh | bash",
        "oo login",
        options.installCommand,
        "",
        "Windows PowerShell:",
        "irm https://cli.oomol.com/install.ps1 | iex",
        "oo login",
        options.installCommand,
    ].join("\n");
}

function createEnglishSkillSharePackageLines(
    options: SkillSharePackageLineOptions,
): string[] {
    if (options.visibility === "public" && options.shareKind === "skill") {
        return [
            `The skill is already published and public:`,
            `Package: ${options.packageName}`,
            `Skill: ${options.skillId}`,
            `Hub: ${options.hubUrl}`,
        ];
    }

    if (options.visibility === "public") {
        return [
            `The package is already published and public:`,
            `Package: ${options.packageName}`,
            `Hub: ${options.hubUrl}`,
        ];
    }

    if (options.shareKind === "skill") {
        return [
            `This private OO skill must be installed with this exact temporary share specifier:`,
            `Install package specifier: ${options.installPackageSpecifier}`,
            `Skill: ${options.skillId}`,
        ];
    }

    return [
        `This private OO package must be installed with this exact temporary share specifier:`,
        `Install package specifier: ${options.installPackageSpecifier}`,
    ];
}

function createChineseSkillSharePackageLines(
    options: SkillSharePackageLineOptions,
): string[] {
    if (options.visibility === "public" && options.shareKind === "skill") {
        return [
            "这个 skill 已经发布并且是公开的：",
            `Package: ${options.packageName}`,
            `Skill: ${options.skillId}`,
            `Hub: ${options.hubUrl}`,
        ];
    }

    if (options.visibility === "public") {
        return [
            "这个 package 已经发布并且是公开的：",
            `Package: ${options.packageName}`,
            `Hub: ${options.hubUrl}`,
        ];
    }

    if (options.shareKind === "skill") {
        return [
            "这个私有 OO skill 必须使用下面这个临时分享标识精确安装：",
            `Install package specifier: ${options.installPackageSpecifier}`,
            `Skill: ${options.skillId}`,
        ];
    }

    return [
        "这个私有 OO package 必须使用下面这个临时分享标识精确安装：",
        `Install package specifier: ${options.installPackageSpecifier}`,
    ];
}

function createSkillShareInstallCommand(
    installPackageSpecifier: string,
    shareKind: SkillShareKind,
    skillId: string,
): string {
    if (shareKind === "package") {
        return `oo skills install ${installPackageSpecifier} -y`;
    }

    return `oo skills install ${installPackageSpecifier} --skill ${skillId} -y`;
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
