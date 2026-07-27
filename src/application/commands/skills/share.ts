import type {
    CliCommandDefinition,
    CliExecutionContext,
} from "../../contracts/cli.ts";
import type { Translator } from "../../contracts/translator.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { PackageInfoResponse } from "../shared/package-info.ts";

import { readFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { resolveRequestLanguage } from "../../../i18n/locale.ts";
import { requireIdentity } from "../../auth/identity.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { withPackageIdentity } from "../../logging/log-fields.ts";
import { requestOo } from "../shared/oo-request.ts";
import { writeLine } from "../shared/output.ts";
import { loadPackageInfo, parsePackageSpecifier } from "../shared/package-info.ts";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import {
    confirmInteractiveValue,
    requestInteractiveText,
} from "./interactive-prompts.ts";
import { findLocalSkillSources } from "./local-skill-source.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
} from "./managed-skill-paths.ts";
import { createSkillPackageHubUrl } from "./publish.ts";
import {
    isSkillDirectoryAbsent,
    managedMetadataOfKind,
    readSkillDirectoryState,
} from "./skill-directory-state.ts";
import {
    isSkillFrontmatterRecord,
    parseSkillMarkdownMatter,
    toNonBlankString,
} from "./skill-frontmatter.ts";
import { isSkillIdReference } from "./skill-id.ts";

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
}

interface SkillSharePackageLineOptions {
    hubUrl: string;
    installPackageSpecifier: string;
    packageName: string;
    shareKind: SkillShareKind;
    skillId: string;
    translator: Translator;
    visibility: SkillShareVisibility;
}

type SkillShareKind = "package" | "skill";
type SkillSharePackageLineVariant
    = | "privatePackage"
        | "privateSkill"
        | "publicPackage"
        | "publicSkill";
type SkillShareVisibility = "private" | "public";

type SkillShareContext = Pick<
    CliExecutionContext,
    | "cacheStore"
    | "cwd"
    | "env"
    | "fetcher"
    | "logger"
    | "settingsStore"
    | "stdin"
    | "stdout"
    | "translator"
>;

const defaultSkillShareDays = 7;
const maxSkillShareDays = 7;
const skillInstallGuideUrl
    = "https://static.oomol.com/oo-cli/skill-install-guide/install.md";

const skillShareSubjectKeys = {
    package: "skills.share.subject.package",
    skill: "skills.share.subject.skill",
} as const satisfies Record<SkillShareKind, string>;

const skillShareVisibilityKeys = {
    private: "skills.share.visibility.private",
    public: "skills.share.visibility.public",
} as const satisfies Record<SkillShareVisibility, string>;

const skillSharePackageLineKeys = {
    privatePackage: [
        "skills.share.prompt.privatePackageIntro",
        "skills.share.prompt.packageLine",
        "skills.share.prompt.hubLine",
        "skills.share.prompt.installPackageSpecifierLine",
    ],
    privateSkill: [
        "skills.share.prompt.privateSkillIntro",
        "skills.share.prompt.packageLine",
        "skills.share.prompt.skillLine",
        "skills.share.prompt.hubLine",
        "skills.share.prompt.installPackageSpecifierLine",
    ],
    publicPackage: [
        "skills.share.prompt.publicPackageIntro",
        "skills.share.prompt.packageLine",
        "skills.share.prompt.hubLine",
    ],
    publicSkill: [
        "skills.share.prompt.publicSkillIntro",
        "skills.share.prompt.packageLine",
        "skills.share.prompt.skillLine",
        "skills.share.prompt.hubLine",
    ],
} as const satisfies Record<SkillSharePackageLineVariant, readonly string[]>;

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
    const { account } = await requireIdentity(context);
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
                context.translator,
                visibility,
            ),
        }),
    );
    writeLine(context.stdout, "");
    writeLine(
        context.stdout,
        renderSkillSharePrompt({
            hubUrl: createSkillPackageHubUrl(account.endpoint, packageInfo.packageName),
            installCommand: createSkillShareInstallCommand(installPackageSpecifier),
            installPackageSpecifier,
            packageName: packageInfo.packageName,
            shareKind,
            skillId: target.skillId,
            translator: context.translator,
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
        const localTarget = await resolveLocalSkillShareTarget(reference, context);

        if (localTarget !== undefined) {
            return localTarget;
        }

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

async function resolveLocalSkillShareTarget(
    skillId: string,
    context: Pick<CliExecutionContext, "env">,
): Promise<SkillShareTarget | undefined> {
    const sources = await findLocalSkillSources({
        context: {
            env: context.env,
        },
        skillName: skillId,
    });

    if (sources.length === 0) {
        return undefined;
    }

    if (sources.length > 1) {
        throw new CliUserError("errors.skills.share.localSkillAmbiguous", 1, {
            agents: sources.map(source => source.agentName).join(", "),
            name: skillId,
        });
    }

    const source = sources[0]!;

    return {
        packageName: await readPublishedSkillPackageName(source.path),
        packageNameFallback: skillId,
        skillId,
        sourceKind: "local",
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
    const registrySkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
        settingsFilePath,
        skillId,
    );
    const canonicalState = await readSkillDirectoryState(
        registrySkillDirectoryPath,
    );

    if (isSkillDirectoryAbsent(canonicalState)) {
        return undefined;
    }

    return {
        packageName: managedMetadataOfKind(canonicalState, "registry")?.packageName,
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
    translator: Translator,
    visibility: SkillShareVisibility,
): string {
    return translator.t(skillShareVisibilityKeys[visibility]);
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
    const parsed = await requestOo({
        authorization: account.apiKey,
        context,
        errors: { scope: "skills.share" },
        host: { endpoint: account.endpoint, service: "registry" },
        jsonBody: createPrivateSkillPackageShareRequestBody(limits),
        label: "Skills private package share",
        logFields: {
            common: withPackageIdentity(packageName),
        },
        method: "POST",
        path: `/-/oomol/package-shares/share/${encodeURIComponent(packageName)}`,
        schema: packageShareResponseSchema,
    });

    return parsed.shareID;
}

function createPrivateSkillPackageShareRequestBody(
    limits: SkillShareLimits,
): { days: number; downloads?: number } {
    return {
        ...(limits.downloads === undefined ? {} : { downloads: limits.downloads }),
        days: limits.days,
    };
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
    const packageLines = createSkillSharePackageLines(options);
    const subject = options.translator.t(
        skillShareSubjectKeys[options.shareKind],
    );
    const content = [
        options.translator.t("skills.share.prompt.intro", { subject }),
        "",
        ...packageLines,
        "",
        options.translator.t("skills.share.prompt.installPreparationLabel"),
        skillInstallGuideUrl,
        "",
        options.translator.t("skills.share.prompt.runInstruction"),
        "",
        options.installCommand,
    ].join("\n");

    return [
        "```text",
        content,
        "```",
    ].join("\n");
}

function createSkillSharePackageLines(
    options: SkillSharePackageLineOptions,
): string[] {
    const params = {
        hubUrl: options.hubUrl,
        installPackageSpecifier: options.installPackageSpecifier,
        packageName: options.packageName,
        skillId: options.skillId,
    };

    return skillSharePackageLineKeys[
        resolveSkillSharePackageLineVariant(options)
    ].map(key => options.translator.t(key, params));
}

function resolveSkillSharePackageLineVariant(
    options: Pick<SkillSharePackageLineOptions, "shareKind" | "visibility">,
): SkillSharePackageLineVariant {
    if (options.visibility === "public" && options.shareKind === "skill") {
        return "publicSkill";
    }

    if (options.visibility === "public") {
        return "publicPackage";
    }

    if (options.shareKind === "skill") {
        return "privateSkill";
    }

    return "privatePackage";
}

function createSkillShareInstallCommand(
    installPackageSpecifier: string,
): string {
    // `oo skills install` installs every published skill of the package and no
    // longer exposes a `--skill` selector or a `-y` confirmation flag.
    return `oo skills install ${installPackageSpecifier}`;
}

function resolveSkillIdFromPackageName(packageName: string): string {
    const separatorIndex = packageName.lastIndexOf("/");

    if (separatorIndex < 0 || separatorIndex === packageName.length - 1) {
        return packageName;
    }

    return packageName.slice(separatorIndex + 1);
}
