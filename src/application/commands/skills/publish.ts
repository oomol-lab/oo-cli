import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { PackageInfoResponse } from "../shared/package-info.ts";
import type { ManagedSkillHostInstallation } from "./managed-skill-hosts.ts";

import type { SkillPublishVisibility } from "./package-conversion.ts";
import { cp, lstat, mkdir, mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { resolveRequestLanguage } from "../../../i18n/locale.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { compareSemver, isSemver } from "../../semver.ts";
import { isEnvOverrideAccount } from "../shared/auth-env-override.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { parseEnumOption } from "../shared/input-parsing.ts";
import { writeLine } from "../shared/output.ts";
import { loadPackageInfo, parsePackageSpecifier } from "../shared/package-info.ts";
import {
    isNodeNotFoundError,
    removePath,
} from "./bundled-skill-filesystem.ts";
import {
    confirmInteractiveValue,
    selectInteractiveValue,
} from "./interactive-prompts.ts";
import { readSkillMetadataFileState, writeLocalSkillMetadata } from "./local-skill-ownership.ts";
import {
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallations,
} from "./managed-skill-hosts.ts";
import { writeManagedSkillMetadata } from "./managed-skill-metadata.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import {
    convertSkillDirectoryToPackage,
    publishConvertedSkillPackage,
    readLocalSkillPackageMetadata,
    skillPublishVisibilityValues,
    writePublishedSkillMetadata,
} from "./package-conversion.ts";
import {
    publishPreparedRegistrySkillPublication,
    validateRegistrySkillPublicationTargets,
} from "./registry-skill-publication.ts";
import { isSkillIdReference } from "./skill-id.ts";

interface SkillsPublishInput {
    force?: boolean;
    path: string;
    visibility?: string;
    yes?: boolean;
}

interface PublishLocalSkillPackageResult {
    hubUrl: string;
    packageName: string;
    skillDirectoryPath: string;
    skillId: string;
    visibility: SkillPublishVisibility;
    version: string;
}

interface PublishSkillPackageOptions {
    force?: boolean;
    yes?: boolean;
}

interface LocalSkillPublishSource {
    kind: "local";
    skillDirectoryPath: string;
    skillId: string;
}

interface RegistrySkillPublishSource {
    kind: "registry";
    packageName: string;
    skillDirectoryPath: string;
    skillId: string;
}

interface PathSkillPublishSource {
    kind: "path";
    skillDirectoryPath: string;
    skillId: string;
}

type SkillPublishSource
    = | LocalSkillPublishSource
        | PathSkillPublishSource
        | RegistrySkillPublishSource;

interface ResolveSkillPublishVersionRequest {
    account: AuthAccount;
    context: Pick<
        CliExecutionContext,
        "cacheStore" | "fetcher" | "logger" | "stdin" | "stdout" | "translator"
    >;
    packageName: string;
    requestedVersion: string;
    skillId: string;
    yes: boolean;
}

interface ResolveSkillPublishPlanRequest extends ResolveSkillPublishVersionRequest {
    requestedVisibility?: SkillPublishVisibility;
}

interface ResolvedSkillPublishPlan {
    version: string;
    visibility: SkillPublishVisibility;
}

interface PublishSkillPackageDependencies {
    convertSkillDirectoryToPackage?: typeof convertSkillDirectoryToPackage;
    createTemporaryPackageRoot?: () => Promise<string>;
    publishConvertedSkillPackage?: typeof publishConvertedSkillPackage;
    removeTemporaryPackageRoot?: (path: string) => Promise<void>;
    requireCurrentAccount?: typeof requireCurrentAccount;
    resolveFinalPublishVersion?: (
        request: ResolveSkillPublishVersionRequest,
    ) => Promise<string>;
    resolveFinalPublishPlan?: (
        request: ResolveSkillPublishPlanRequest,
    ) => Promise<ResolvedSkillPublishPlan>;
    writePublishedSkillMetadata?: typeof writePublishedSkillMetadata;
}

export const skillsPublishCommand: CliCommandDefinition<SkillsPublishInput> = {
    name: "publish",
    summaryKey: "commands.skills.publish.summary",
    descriptionKey: "commands.skills.publish.description",
    arguments: [
        {
            name: "path",
            descriptionKey: "arguments.filePath",
            required: true,
        },
    ],
    options: [
        {
            name: "force",
            longFlag: "--force",
            descriptionKey: "options.force",
        },
        {
            name: "visibility",
            longFlag: "--visibility",
            valueName: "visibility",
            descriptionKey: "options.visibility",
        },
        {
            name: "yes",
            longFlag: "--yes",
            shortFlag: "-y",
            descriptionKey: "options.yes",
        },
    ],
    inputSchema: z.object({
        force: z.boolean().optional(),
        path: z.string(),
        visibility: z.string().optional(),
        yes: z.boolean().optional(),
    }),
    handler: async (input, context) => {
        const visibility = parseSkillPublishVisibility(input.visibility);

        const result = await publishSkillPackage(
            input.path,
            context,
            visibility,
            {
                force: input.force === true,
                yes: input.yes === true,
            },
        );

        writeLine(
            context.stdout,
            context.translator.t("skills.publish.success", {
                hubUrl: result.hubUrl,
                name: result.skillId,
                packageName: result.packageName,
                visibility: context.translator.t(
                    `skills.publish.visibility.${result.visibility}`,
                ),
                version: result.version,
            }),
        );
    },
};

export async function publishSkillPackage(
    skillPath: string,
    context: CliExecutionContext,
    visibility?: SkillPublishVisibility,
    options: PublishSkillPackageOptions = {},
    dependencies: PublishSkillPackageDependencies = {},
): Promise<PublishLocalSkillPackageResult> {
    const source = await resolveSkillPublishSource(skillPath, context);
    const yes = options.yes === true;
    const force = options.force === true;
    const requireAccount = dependencies.requireCurrentAccount ?? requireCurrentAccount;

    const account = await requireAccount(context);
    const packageName = await resolveSkillPublishPackageName(account, source);

    context.telemetry?.recordProperties({
        force,
        source_kind: source.kind,
    });

    await confirmSkillPublishSource(
        {
            packageName,
            source,
            yes,
        },
        context,
    );

    return await publishResolvedSkillPackage(
        {
            account,
            force,
            packageName,
            skillDirectoryPath: source.skillDirectoryPath,
            skillId: source.skillId,
            sourceKind: source.kind,
            yes,
        },
        context,
        visibility,
        dependencies,
    );
}

async function publishResolvedSkillPackage(
    request: {
        account: AuthAccount;
        force: boolean;
        packageName: string;
        skillDirectoryPath: string;
        skillId: string;
        sourceKind: SkillPublishSource["kind"];
        yes: boolean;
    },
    context: CliExecutionContext,
    requestedVisibility: SkillPublishVisibility | undefined,
    dependencies: PublishSkillPackageDependencies,
): Promise<PublishLocalSkillPackageResult> {
    const resolveFinalPublishPlan = dependencies.resolveFinalPublishPlan
        ?? ((planRequest: ResolveSkillPublishPlanRequest) =>
            resolveRequestedSkillPublishPlan(
                planRequest,
                dependencies.resolveFinalPublishVersion,
            ));
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
    const hubUrl = createSkillPackageHubUrl(
        request.account.endpoint,
        request.packageName,
    );
    const skillMetadata = await readLocalSkillPackageMetadata({
        skillDirectoryPath: request.skillDirectoryPath,
        skillId: request.skillId,
    });
    if (request.sourceKind === "local") {
        await writeLocalSkillMetadata(request.skillDirectoryPath);
    }

    const publishPlan = await resolveFinalPublishPlan({
        account: request.account,
        context,
        packageName: request.packageName,
        requestedVersion: skillMetadata.requestedVersion,
        requestedVisibility,
        skillId: request.skillId,
        yes: request.yes,
    });
    context.telemetry?.recordProperties({
        visibility: publishPlan.visibility,
    });
    const registryHostInstallations = request.sourceKind === "registry"
        ? resolveManagedSkillHostInstallations(
                await resolveAvailableManagedSkillHosts(context.env),
                request.skillId,
            )
        : [];

    if (request.sourceKind === "registry") {
        await validateRegistrySkillPublicationTargets({
            hostInstallations: registryHostInstallations,
            skillName: request.skillId,
        });
    }

    let packageRootDirectoryPath: string | undefined;

    try {
        packageRootDirectoryPath = await createTemporaryPackageRoot();

        await convertDirectory({
            packageName: request.packageName,
            packageRootDirectoryPath,
            skillDirectoryPath: request.skillDirectoryPath,
            skillId: request.skillId,
            version: publishPlan.version,
        });
        await publishPackage({
            account: request.account,
            context,
            packageRootDirectoryPath,
            visibility: publishPlan.visibility,
        });
        await writeMetadata({
            packageName: request.packageName,
            skillDirectoryPath: request.skillDirectoryPath,
            version: publishPlan.version,
        });
        if (request.sourceKind === "registry") {
            await writeManagedSkillMetadata(request.skillDirectoryPath, {
                icon: skillMetadata.icon,
                packageName: request.packageName,
                version: publishPlan.version,
            });
            await synchronizePublishedRegistrySkill({
                hostInstallations: registryHostInstallations,
                icon: skillMetadata.icon,
                packageName: request.packageName,
                settingsFilePath: context.settingsStore.getFilePath(),
                skillDirectoryPath: request.skillDirectoryPath,
                skillId: request.skillId,
                version: publishPlan.version,
            });
        }
    }
    finally {
        if (packageRootDirectoryPath !== undefined) {
            await removeTemporaryPackageRoot(packageRootDirectoryPath);
        }
    }

    return {
        hubUrl,
        packageName: request.packageName,
        skillDirectoryPath: request.skillDirectoryPath,
        skillId: request.skillId,
        visibility: publishPlan.visibility,
        version: publishPlan.version,
    };
}

async function synchronizePublishedRegistrySkill(options: {
    hostInstallations: readonly ManagedSkillHostInstallation[];
    icon?: string;
    packageName: string;
    settingsFilePath: string;
    skillDirectoryPath: string;
    skillId: string;
    version: string;
}): Promise<void> {
    const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
        options.settingsFilePath,
        options.skillId,
    );

    if (!(await areSamePath(options.skillDirectoryPath, canonicalSkillDirectoryPath))) {
        await copyRegistrySkillToCanonical(
            options.skillDirectoryPath,
            canonicalSkillDirectoryPath,
        );
    }

    await writeManagedSkillMetadata(canonicalSkillDirectoryPath, {
        icon: options.icon,
        packageName: options.packageName,
        version: options.version,
    });

    await publishPreparedRegistrySkillPublication({
        canonicalSkillDirectoryPath,
        hostInstallations: [...options.hostInstallations],
        packageName: options.packageName,
        packageVersion: options.version,
        skillName: options.skillId,
    });
}

async function copyRegistrySkillToCanonical(
    sourceSkillDirectoryPath: string,
    canonicalSkillDirectoryPath: string,
): Promise<void> {
    await removePath(canonicalSkillDirectoryPath);
    await mkdir(dirname(canonicalSkillDirectoryPath), { recursive: true });
    await cp(sourceSkillDirectoryPath, canonicalSkillDirectoryPath, {
        dereference: true,
        force: true,
        recursive: true,
    });
}

async function areSamePath(leftPath: string, rightPath: string): Promise<boolean> {
    if (resolve(leftPath) === resolve(rightPath)) {
        return true;
    }

    try {
        return await realpath(leftPath) === await realpath(rightPath);
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return false;
        }

        throw error;
    }
}

async function resolveSkillPublishPackageName(
    account: Pick<AuthAccount, "id" | "name">,
    source: SkillPublishSource,
): Promise<string> {
    const scopedPackageName = await readSkillPublishSourceScopedPackageName(source);

    if (scopedPackageName !== undefined) {
        return scopedPackageName;
    }

    // The OO_API_KEY env override has no account scope, so deriving a canonical
    // package name from its synthetic account name would produce an invalid
    // identifier. Require an explicit scoped packageName instead.
    if (isEnvOverrideAccount(account)) {
        throw new CliUserError("errors.skills.publish.envApiKeyPackageName", 1);
    }

    return resolveCanonicalSkillPackageName(account.name, source.skillId);
}

async function readSkillPublishSourceScopedPackageName(
    source: SkillPublishSource,
): Promise<string | undefined> {
    switch (source.kind) {
        case "registry":
            return readScopedPackageName(source.packageName);
        case "local":
        case "path":
            return readScopedPackageName(await readSkillFrontmatterPackageName(source));
    }
}

async function readSkillFrontmatterPackageName(
    source: LocalSkillPublishSource | PathSkillPublishSource,
): Promise<string | undefined> {
    const metadata = await readLocalSkillPackageMetadata({
        skillDirectoryPath: source.skillDirectoryPath,
        skillId: source.skillId,
    });

    return metadata.packageName;
}

function readScopedPackageName(packageName: string | undefined): string | undefined {
    if (packageName === undefined) {
        return undefined;
    }

    const packageNameParts = packageName.split("#");
    const scopedPackageName = packageNameParts[0]!;

    if (
        packageNameParts.length > 2
        || scopedPackageName === ""
        || (packageNameParts[1] !== undefined && packageNameParts[1] === "")
        || !scopedPackageName.startsWith("@")
    ) {
        return undefined;
    }

    const scopedPackageNameSegments = scopedPackageName.split("/");

    if (scopedPackageNameSegments.length !== 2) {
        return undefined;
    }

    const [scope, name] = scopedPackageNameSegments;

    if (scope === "@" || name === "") {
        return undefined;
    }

    return scopedPackageName;
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

async function resolveSkillPublishSource(
    skillReference: string,
    context: Pick<CliExecutionContext, "cwd">,
): Promise<SkillPublishSource> {
    const normalizedReference = skillReference.trim();

    if (normalizedReference === "") {
        throw createSkillPublishSourceMissingError(skillReference);
    }
    const pathSkillSource = await resolvePathSkillPublishSource(
        normalizedReference,
        context.cwd,
    );

    if (pathSkillSource !== undefined) {
        return pathSkillSource;
    }

    throw createSkillPublishSourceMissingError(skillReference);
}

async function resolvePathSkillPublishSource(
    skillReference: string,
    cwd: string,
): Promise<SkillPublishSource | undefined> {
    const resolvedPath = isAbsolute(skillReference)
        ? resolve(skillReference)
        : resolve(cwd, skillReference);
    const skillDirectoryPath = await resolveSkillDirectoryPath(resolvedPath);

    if (skillDirectoryPath === undefined) {
        return undefined;
    }

    const skillId = basename(skillDirectoryPath);

    if (!isSkillIdReference(skillId)) {
        return undefined;
    }

    const metadataState = await readSkillMetadataFileState(skillDirectoryPath);

    if (metadataState.exists && metadataState.metadata === undefined) {
        throw new CliUserError("errors.skills.publish.invalidOwnershipMetadata", 1, {
            path: resolveManagedSkillMetadataFilePath(skillDirectoryPath),
        });
    }

    switch (metadataState.metadata?.kind) {
        case "bundled":
            throw createBundledSkillPublishError(skillId);
        case "local":
            return {
                kind: "local",
                skillDirectoryPath,
                skillId,
            };
        case "registry":
            return {
                kind: "registry",
                packageName: metadataState.metadata.packageName,
                skillDirectoryPath,
                skillId,
            };
        case undefined:
            return {
                kind: "path",
                skillDirectoryPath,
                skillId,
            };
    }
}

async function confirmSkillPublishSource(
    options: {
        packageName: string;
        source: SkillPublishSource;
        yes: boolean;
    },
    context: Pick<CliExecutionContext, "stdin" | "stdout" | "translator">,
): Promise<void> {
    switch (options.source.kind) {
        case "local":
        case "path":
            return;
        case "registry": {
            const sourcePackageName = readScopedPackageName(options.source.packageName)
                ?? options.source.packageName;

            if (
                normalizePackageNameForComparison(sourcePackageName)
                === normalizePackageNameForComparison(options.packageName)
            ) {
                return;
            }

            await confirmRegistrySkillPackagePublish(
                {
                    ...options.source,
                    packageName: sourcePackageName,
                },
                options.packageName,
                context,
                options.yes,
            );
        }
    }
}

async function confirmRegistrySkillPackagePublish(
    source: RegistrySkillPublishSource,
    targetPackageName: string,
    context: Pick<CliExecutionContext, "stdin" | "stdout" | "translator">,
    yes: boolean,
): Promise<void> {
    if (yes) {
        return;
    }

    const params = {
        name: source.skillId,
        packageName: source.packageName,
        targetPackageName,
    };

    if (context.stdin.isTTY !== true) {
        throw new CliUserError(
            "errors.skills.publish.registryPackageConfirmationRequired",
            1,
            params,
        );
    }

    const confirmed = await confirmInteractiveValue(
        context,
        {
            invalidMessage: context.translator.t(
                "skills.publish.confirm.invalid",
            ),
            prompt: context.translator.t(
                "skills.publish.registryPackage.prompt",
                params,
            ),
        },
    );

    if (!confirmed) {
        throw new CliUserError(
            "errors.skills.publish.registryPackageMismatch",
            1,
            params,
        );
    }
}

async function resolveSkillDirectoryPath(
    resolvedPath: string,
): Promise<string | undefined> {
    let pathStats: Awaited<ReturnType<typeof stat>>;

    try {
        pathStats = await stat(resolvedPath);
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return undefined;
        }

        throw error;
    }

    if (pathStats.isFile() && basename(resolvedPath) === "SKILL.md") {
        return dirname(resolvedPath);
    }

    if (pathStats.isDirectory() && await hasSkillMarkdownFile(resolvedPath)) {
        return resolvedPath;
    }

    return undefined;
}

async function hasSkillMarkdownFile(
    directoryPath: string,
): Promise<boolean> {
    try {
        const skillFileStats = await lstat(join(directoryPath, "SKILL.md"));

        return skillFileStats.isFile();
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return false;
        }

        throw error;
    }
}

function normalizePackageNameForComparison(packageName: string): string {
    return packageName.trim().toLowerCase();
}

function createBundledSkillPublishError(skillId: string): CliUserError {
    return new CliUserError("errors.skills.publish.bundledSkill", 1, {
        name: skillId,
    });
}

function createSkillPublishSourceMissingError(skillReference: string): CliUserError {
    return new CliUserError("errors.skills.publish.skillNotFound", 1, {
        name: skillReference,
    });
}

async function resolveRequestedSkillPublishPlan(
    request: ResolveSkillPublishPlanRequest,
    resolveFinalPublishVersion?: (
        request: ResolveSkillPublishVersionRequest,
    ) => Promise<string>,
): Promise<ResolvedSkillPublishPlan> {
    const packageSpecifier = parsePackageSpecifier(request.packageName);
    const packageInfo = resolveFinalPublishVersion === undefined
        ? await loadLatestPackageInfoOrUndefined(request, packageSpecifier)
        : undefined;
    const version = resolveFinalPublishVersion === undefined
        ? await resolveRequestedSkillPublishVersion(request, packageInfo)
        : await resolveFinalPublishVersion(request);
    const visibility = await resolveRequestedSkillPublishVisibility(
        request,
        packageInfo,
    );

    return {
        version,
        visibility,
    };
}

async function resolveRequestedSkillPublishVersion(
    request: ResolveSkillPublishVersionRequest,
    packageInfo: PackageInfoResponse | undefined,
): Promise<string> {
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
}

async function loadLatestPackageInfoOrUndefined(
    request: ResolveSkillPublishVersionRequest,
    packageSpecifier: ReturnType<typeof parsePackageSpecifier>,
): Promise<PackageInfoResponse | undefined> {
    try {
        return await loadPackageInfo(
            packageSpecifier,
            request.account,
            resolveRequestLanguage(request.context.translator.locale),
            request.context,
        );
    }
    catch (error) {
        if (isPackageInfoNotFoundError(error)) {
            return undefined;
        }

        throw error;
    }
}

async function resolveRequestedSkillPublishVisibility(
    request: ResolveSkillPublishPlanRequest,
    packageInfo: PackageInfoResponse | undefined,
): Promise<SkillPublishVisibility> {
    if (request.requestedVisibility !== undefined) {
        return request.requestedVisibility;
    }

    const existingVisibility = readExistingSkillPublishVisibility(packageInfo);

    if (existingVisibility !== undefined) {
        return existingVisibility;
    }

    return await selectNewSkillPublishVisibility(request);
}

function readExistingSkillPublishVisibility(
    packageInfo: PackageInfoResponse | undefined,
): SkillPublishVisibility | undefined {
    switch (packageInfo?.access) {
        case "public":
            return "public";
        case "private":
        case "restricted":
            return "private";
        case undefined:
            return undefined;
    }
}

async function selectNewSkillPublishVisibility(
    request: ResolveSkillPublishPlanRequest,
): Promise<SkillPublishVisibility> {
    const params = {
        name: request.skillId,
        packageName: request.packageName,
    };

    if (request.context.stdin.isTTY !== true) {
        throw new CliUserError(
            "errors.skills.publish.visibilityRequired",
            1,
            params,
        );
    }

    return await selectInteractiveValue(request.context, {
        invalidMessage: request.context.translator.t(
            "skills.publish.visibility.invalid",
        ),
        prompt: request.context.translator.t(
            "skills.publish.visibility.prompt",
            params,
        ),
        values: skillPublishVisibilityValues,
    });
}

async function confirmRemotePackageBlocksPublish(
    request: ResolveSkillPublishVersionRequest,
    packageVersion: string,
): Promise<void> {
    if (request.yes) {
        return;
    }

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

export function createSkillPackageHubUrl(endpoint: string, packageName: string): string {
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
