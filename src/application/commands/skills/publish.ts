import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { SkillPublishVisibility } from "./package-conversion.ts";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { resolveRequestLanguage } from "../../../i18n/locale.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { compareSemver, isSemver } from "../../semver.ts";
import { loadPackageInfo, parsePackageSpecifier } from "../package/shared.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { parseEnumOption } from "../shared/input-parsing.ts";
import { writeLine } from "../shared/output.ts";
import { directoryExists } from "./bundled-skill-observation.ts";
import { checkLocalSkillAuthoringEnvironment } from "./check.ts";
import { confirmInteractiveValue } from "./interactive-prompts.ts";
import { resolveLocalSkillCanonicalDirectoryPath } from "./managed-skill-paths.ts";
import {
    convertSkillDirectoryToPackage,
    defaultSkillPublishVisibility,
    publishConvertedSkillPackage,
    readLocalSkillPackageMetadata,
    skillPublishVisibilityValues,
    writePublishedSkillMetadata,
} from "./package-conversion.ts";

interface SkillsPublishInput {
    skill: string;
    visibility?: string;
}

interface PublishLocalSkillPackageResult {
    hubUrl: string;
    packageName: string;
    skillDirectoryPath: string;
    skillId: string;
    version: string;
}

interface ResolveSkillPublishVersionRequest {
    account: AuthAccount;
    context: Pick<
        CliExecutionContext,
        "cacheStore" | "fetcher" | "logger" | "stdin" | "stdout" | "translator"
    >;
    packageName: string;
    requestedVersion: string;
    skillId: string;
}

interface PublishLocalSkillPackageDependencies {
    checkAuthoringEnvironment?: typeof checkLocalSkillAuthoringEnvironment;
    convertSkillDirectoryToPackage?: typeof convertSkillDirectoryToPackage;
    createTemporaryPackageRoot?: () => Promise<string>;
    publishConvertedSkillPackage?: typeof publishConvertedSkillPackage;
    removeTemporaryPackageRoot?: (path: string) => Promise<void>;
    requireCurrentAccount?: typeof requireCurrentAccount;
    resolveFinalPublishVersion?: (
        request: ResolveSkillPublishVersionRequest,
    ) => Promise<string>;
    writePublishedSkillMetadata?: typeof writePublishedSkillMetadata;
}

export const skillsPublishCommand: CliCommandDefinition<SkillsPublishInput> = {
    name: "publish",
    summaryKey: "commands.skills.publish.summary",
    descriptionKey: "commands.skills.publish.description",
    arguments: [
        {
            name: "skill",
            descriptionKey: "arguments.skill",
            required: true,
        },
    ],
    options: [
        {
            name: "visibility",
            longFlag: "--visibility",
            valueName: "visibility",
            descriptionKey: "options.visibility",
        },
    ],
    inputSchema: z.object({
        skill: z.string(),
        visibility: z.string().optional(),
    }),
    handler: async (input, context) => {
        const visibility = parseSkillPublishVisibility(input.visibility)
            ?? defaultSkillPublishVisibility;
        const result = await publishLocalSkillPackage(
            input.skill,
            context,
            visibility,
        );

        writeLine(
            context.stdout,
            context.translator.t("skills.publish.success", {
                hubUrl: result.hubUrl,
                name: result.skillId,
                packageName: result.packageName,
                visibility: context.translator.t(
                    `skills.publish.visibility.${visibility}`,
                ),
                version: result.version,
            }),
        );
    },
};

export async function publishLocalSkillPackage(
    skillId: string,
    context: CliExecutionContext,
    visibility: SkillPublishVisibility = defaultSkillPublishVisibility,
    dependencies: PublishLocalSkillPackageDependencies = {},
): Promise<PublishLocalSkillPackageResult> {
    const checkAuthoringEnvironment
        = dependencies.checkAuthoringEnvironment ?? checkLocalSkillAuthoringEnvironment;
    const requireAccount = dependencies.requireCurrentAccount ?? requireCurrentAccount;
    const resolveFinalPublishVersion = dependencies.resolveFinalPublishVersion
        ?? resolveRequestedSkillPublishVersion;
    const createTemporaryPackageRoot = dependencies.createTemporaryPackageRoot
        ?? createDefaultTemporaryPackageRoot;
    const removeTemporaryPackageRoot = dependencies.removeTemporaryPackageRoot
        ?? removeDefaultTemporaryPackageRoot;
    const convertDirectory = dependencies.convertSkillDirectoryToPackage
        ?? convertSkillDirectoryToPackage;
    const publishPackage = dependencies.publishConvertedSkillPackage
        ?? publishConvertedSkillPackage;
    const writeMetadata = dependencies.writePublishedSkillMetadata
        ?? writePublishedSkillMetadata;

    await checkAuthoringEnvironment(context);

    const skillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
        context.settingsStore.getFilePath(),
        skillId,
    );

    if (!(await directoryExists(skillDirectoryPath))) {
        throw new CliUserError("errors.skills.publish.localSkillMissing", 1, {
            name: skillId,
            path: skillDirectoryPath,
        });
    }

    const account = await requireAccount(context);
    const packageName = resolveCanonicalSkillPackageName(account.name, skillId);
    const hubUrl = createSkillPackageHubUrl(account.endpoint, packageName);
    const skillMetadata = await readLocalSkillPackageMetadata({
        skillDirectoryPath,
        skillId,
    });
    const version = await resolveFinalPublishVersion({
        account,
        context,
        packageName,
        requestedVersion: skillMetadata.requestedVersion,
        skillId,
    });
    let packageRootDirectoryPath: string | undefined;

    try {
        packageRootDirectoryPath = await createTemporaryPackageRoot();

        await convertDirectory({
            packageName,
            packageRootDirectoryPath,
            skillDirectoryPath,
            skillId,
            version,
        });
        await publishPackage({
            account,
            context,
            packageRootDirectoryPath,
            visibility,
        });
        await writeMetadata({
            packageName,
            skillDirectoryPath,
            version,
        });
    }
    finally {
        if (packageRootDirectoryPath !== undefined) {
            await removeTemporaryPackageRoot(packageRootDirectoryPath);
        }
    }

    return {
        hubUrl,
        packageName,
        skillDirectoryPath,
        skillId,
        version,
    };
}

function parseSkillPublishVisibility(
    value: string | undefined,
): SkillPublishVisibility | undefined {
    return parseEnumOption(
        value,
        skillPublishVisibilityValues,
        "errors.skills.publish.invalidVisibility",
    );
}

async function resolveRequestedSkillPublishVersion(
    request: ResolveSkillPublishVersionRequest,
): Promise<string> {
    const packageSpecifier = parsePackageSpecifier(request.packageName);
    const packageInfo = await loadLatestPackageInfoOrUndefined(request);

    if (packageInfo === undefined) {
        return request.requestedVersion;
    }

    if (!isSemver(packageInfo.packageVersion)) {
        throw new CliUserError("errors.skills.publish.remotePackageInvalidVersion", 1, {
            name: request.skillId,
            packageName: request.packageName,
            version: packageInfo.packageVersion,
        });
    }

    if (packageInfo.blocks.length > 0) {
        await confirmRemotePackageBlocksPublish(request, packageInfo.packageVersion);
    }

    if (compareSemver(request.requestedVersion, packageInfo.packageVersion) > 0) {
        return request.requestedVersion;
    }

    return incrementSemverPatch(packageInfo.packageVersion);

    async function loadLatestPackageInfoOrUndefined(
        versionRequest: ResolveSkillPublishVersionRequest,
    ) {
        try {
            return await loadPackageInfo(
                packageSpecifier,
                versionRequest.account,
                resolveRequestLanguage(versionRequest.context.translator.locale),
                versionRequest.context,
            );
        }
        catch (error) {
            if (isPackageInfoNotFoundError(error)) {
                return undefined;
            }

            throw error;
        }
    }
}

async function confirmRemotePackageBlocksPublish(
    request: ResolveSkillPublishVersionRequest,
    packageVersion: string,
): Promise<void> {
    const params = {
        name: request.skillId,
        packageName: request.packageName,
        version: packageVersion,
    };

    if (request.context.stdin.isTTY !== true) {
        throw new CliUserError(
            "errors.skills.publish.remotePackageHasBlocksConfirmationRequired",
            1,
            params,
        );
    }

    const confirmed = await confirmInteractiveValue(
        request.context,
        {
            invalidMessage: request.context.translator.t(
                "skills.publish.remoteBlocks.invalid",
            ),
            prompt: request.context.translator.t(
                "skills.publish.remoteBlocks.prompt",
                params,
            ),
        },
    );

    if (!confirmed) {
        throw new CliUserError("errors.skills.publish.remotePackageHasBlocks", 1, params);
    }
}

function resolveCanonicalSkillPackageName(
    accountName: string,
    skillId: string,
): string {
    return `@${accountName.trim().toLowerCase()}/${skillId.trim().toLowerCase()}`;
}

function createSkillPackageHubUrl(endpoint: string, packageName: string): string {
    return `https://hub.${endpoint}/package/${packageName}`;
}

async function createDefaultTemporaryPackageRoot(): Promise<string> {
    const temporaryDirectoryPath = tmpdir();

    return await mkdtemp(join(temporaryDirectoryPath, "oo-skill-publish-"));
}

async function removeDefaultTemporaryPackageRoot(path: string): Promise<void> {
    await rm(path, { force: true, recursive: true });
}

function isPackageInfoNotFoundError(error: unknown): boolean {
    return error instanceof CliUserError
        && error.key === "errors.packageInfo.requestFailed"
        && error.params?.status === 404;
}

function incrementSemverPatch(version: string): string {
    const buildMetadataIndex = version.indexOf("+");
    const versionWithoutBuild = buildMetadataIndex < 0
        ? version
        : version.slice(0, buildMetadataIndex);
    const prereleaseIndex = versionWithoutBuild.indexOf("-");
    const coreVersion = prereleaseIndex < 0
        ? versionWithoutBuild
        : versionWithoutBuild.slice(0, prereleaseIndex);
    const [major, minor, patch] = coreVersion.split(".");

    return `${major}.${minor}.${Number.parseInt(patch!, 10) + 1}`;
}
