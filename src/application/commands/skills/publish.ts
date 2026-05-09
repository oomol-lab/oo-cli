import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { PackageInfoResponse } from "../package/shared.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";
import type { LocalSkillHostPublicationTarget } from "./init.ts";

import type { SkillPublishVisibility } from "./package-conversion.ts";
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { resolveRequestLanguage } from "../../../i18n/locale.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { compareSemver, isSemver } from "../../semver.ts";
import { loadPackageInfo, parsePackageSpecifier } from "../package/shared.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { parseEnumOption } from "../shared/input-parsing.ts";
import { writeLine } from "../shared/output.ts";
import {
    isNodeNotFoundError,
    publishBundledSkillInstallation,
    removePath,
} from "./bundled-skill-filesystem.ts";
import { directoryExists } from "./bundled-skill-observation.ts";
import {
    resolveBundledSkillCanonicalRootDirectoryPath,
    resolveBundledSkillHomeDirectory,
} from "./bundled-skill-paths.ts";
import { checkLocalSkillAuthoringEnvironment } from "./check.ts";
import {
    availableBundledSkillAgentNames,
    availableBundledSkillNames,
} from "./embedded-assets.ts";
import {
    resolveLocalSkillPublicationTargets,
} from "./init.ts";
import {
    confirmInteractiveValue,
    selectInteractiveValue,
} from "./interactive-prompts.ts";
import { writeLocalSkillMetadata } from "./local-skill-ownership.ts";
import {
    findDriftedLocalSkillCopies,
} from "./local-skill-publication.ts";
import { createMissingManagedSkillHostError } from "./managed-skill-hosts.ts";
import {
    parseManagedSkillMetadataContent,
    readManagedSkillMetadata,
} from "./managed-skill-metadata.ts";
import {
    isLocalSkillPathContained,
    resolveLocalSkillCanonicalDirectoryPath,
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import {
    convertSkillDirectoryToPackage,
    publishConvertedSkillPackage,
    readLocalSkillPackageMetadata,
    skillPublishVisibilityValues,
    writePublishedSkillMetadata,
    writeSkillFrontmatterMetadata,
} from "./package-conversion.ts";

interface SkillsPublishInput {
    agent?: string;
    force?: boolean;
    skill: string;
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
    agentName?: BundledSkillAgentName;
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

interface AdoptableSkillPublishSource {
    kind: "adoptable";
    skillDirectoryPath: string;
    skillId: string;
}

type SkillPublishSource
    = | AdoptableSkillPublishSource
        | LocalSkillPublishSource
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
            name: "skill",
            descriptionKey: "arguments.skill",
            required: true,
        },
    ],
    options: [
        {
            name: "agent",
            longFlag: "--agent",
            valueName: "agent",
            descriptionKey: "options.agent",
        },
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
        agent: z.string().optional(),
        force: z.boolean().optional(),
        skill: z.string(),
        visibility: z.string().optional(),
        yes: z.boolean().optional(),
    }),
    handler: async (input, context) => {
        const agentName = parseSkillPublishAgent(input.agent);
        const visibility = parseSkillPublishVisibility(input.visibility);

        const result = await publishSkillPackage(
            input.skill,
            context,
            visibility,
            {
                agentName,
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

export async function publishLocalSkillPackage(
    skillId: string,
    context: CliExecutionContext,
    visibility?: SkillPublishVisibility,
    dependencies: PublishLocalSkillPackageDependencies = {},
): Promise<PublishLocalSkillPackageResult> {
    const checkAuthoringEnvironment
        = dependencies.checkAuthoringEnvironment ?? checkLocalSkillAuthoringEnvironment;
    const requireAccount = dependencies.requireCurrentAccount ?? requireCurrentAccount;

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
    context.telemetry?.recordProperties({
        adopted: false,
        force: false,
        package_name: packageName,
        skill_id: skillId,
        source_kind: "local",
    });

    return await publishResolvedSkillPackage(
        {
            account,
            force: false,
            packageName,
            skillDirectoryPath,
            skillId,
            sourceKind: "local",
            yes: false,
        },
        context,
        visibility,
        dependencies,
    );
}

export async function publishSkillPackage(
    skillReference: string,
    context: CliExecutionContext,
    visibility?: SkillPublishVisibility,
    options: PublishSkillPackageOptions = {},
    dependencies: PublishLocalSkillPackageDependencies = {},
): Promise<PublishLocalSkillPackageResult> {
    const source = await resolveSkillPublishSource(skillReference, context, {
        agentName: options.agentName,
    });
    const yes = options.yes === true;
    const force = options.force === true;
    const checkAuthoringEnvironment
        = dependencies.checkAuthoringEnvironment ?? checkLocalSkillAuthoringEnvironment;
    const requireAccount = dependencies.requireCurrentAccount ?? requireCurrentAccount;

    await checkAuthoringEnvironment(context);

    const account = await requireAccount(context);
    const packageName = resolveCanonicalSkillPackageName(account.name, source.skillId);
    context.telemetry?.recordProperties({
        adopted: source.kind === "adoptable",
        force,
        package_name: packageName,
        skill_id: source.skillId,
        source_kind: source.kind,
    });

    const publishSource = await confirmAndPrepareSkillPublishSource(
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
            skillDirectoryPath: publishSource.skillDirectoryPath,
            skillId: publishSource.skillId,
            sourceKind: publishSource.kind,
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
        sourceKind: "local" | "registry";
        yes: boolean;
    },
    context: CliExecutionContext,
    requestedVisibility: SkillPublishVisibility | undefined,
    dependencies: PublishLocalSkillPackageDependencies,
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
        await validateLocalSkillCopiesBeforePublish({
            context,
            force: request.force,
            localSkillDirectoryPath: request.skillDirectoryPath,
            skillId: request.skillId,
        });
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

async function validateLocalSkillCopiesBeforePublish(options: {
    context: CliExecutionContext;
    force: boolean;
    localSkillDirectoryPath: string;
    skillId: string;
}): Promise<void> {
    const driftedCopies = await findDriftedLocalSkillCopies({
        context: options.context,
        skillName: options.skillId,
    });

    if (driftedCopies.length === 0) {
        return;
    }

    const paths = driftedCopies.map(copy => copy.path).join(", ");

    options.context.logger.warn(
        {
            paths: driftedCopies.map(copy => copy.path),
            skillName: options.skillId,
        },
        "Local skill publish found agent copies that differ from canonical storage.",
    );

    if (!options.force) {
        throw new CliUserError("errors.skills.publish.localCopyDrift", 1, {
            localPath: options.localSkillDirectoryPath,
            name: options.skillId,
            paths,
        });
    }

    writeLine(
        options.context.stderr,
        options.context.translator.t("warnings.skills.publishLocalCopyDriftIgnored", {
            localPath: options.localSkillDirectoryPath,
            name: options.skillId,
            paths,
        }),
    );
}

function parseSkillPublishAgent(
    value: string | undefined,
): BundledSkillAgentName | undefined {
    return parseEnumOption(
        value,
        availableBundledSkillAgentNames,
        "errors.skills.publish.invalidAgent",
    );
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
    context: Pick<CliExecutionContext, "cwd" | "env" | "settingsStore">,
    options: PublishSkillPackageOptions,
): Promise<SkillPublishSource> {
    const normalizedReference = skillReference.trim();

    if (normalizedReference === "") {
        throw createSkillPublishSourceMissingError(skillReference);
    }

    const settingsFilePath = context.settingsStore.getFilePath();

    if (isSkillIdReference(normalizedReference)) {
        const localSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            settingsFilePath,
            normalizedReference,
        );

        if (await directoryExists(localSkillDirectoryPath)) {
            return {
                kind: "local",
                skillDirectoryPath: localSkillDirectoryPath,
                skillId: normalizedReference,
            };
        }

        await rejectBundledSkillPublishIfMatched(
            settingsFilePath,
            normalizedReference,
        );

        const registrySkillSource = await resolveRegistrySkillPublishSource(
            settingsFilePath,
            normalizedReference,
        );

        if (registrySkillSource !== undefined) {
            return registrySkillSource;
        }

        if (options.agentName !== undefined) {
            const agentSkillSource = await resolveAgentSkillPublishSource(
                context.env,
                normalizedReference,
                options.agentName,
            );

            if (agentSkillSource !== undefined) {
                return agentSkillSource;
            }
        }
    }

    const pathSkillSource = await resolvePathSkillPublishSource(
        normalizedReference,
        context.cwd,
        settingsFilePath,
    );

    if (pathSkillSource !== undefined) {
        return pathSkillSource;
    }

    throw createSkillPublishSourceMissingError(skillReference);
}

async function rejectBundledSkillPublishIfMatched(
    settingsFilePath: string,
    skillId: string,
): Promise<void> {
    if (isBundledSkillName(skillId)) {
        throw createBundledSkillPublishError(skillId);
    }

    const bundledSkillDirectoryPath = await findExistingBundledSkillDirectoryPath(
        settingsFilePath,
        skillId,
    );

    if (bundledSkillDirectoryPath !== undefined) {
        throw createBundledSkillPublishError(skillId);
    }
}

async function findExistingBundledSkillDirectoryPath(
    settingsFilePath: string,
    skillId: string,
): Promise<string | undefined> {
    const bundledSkillDirectoryPaths = availableBundledSkillAgentNames.map(
        agentName => join(
            resolveBundledSkillCanonicalRootDirectoryPath(
                settingsFilePath,
                agentName,
            ),
            skillId,
        ),
    );

    for (const bundledSkillDirectoryPath of bundledSkillDirectoryPaths) {
        if (await directoryExists(bundledSkillDirectoryPath)) {
            return bundledSkillDirectoryPath;
        }
    }

    return undefined;
}

async function resolveRegistrySkillPublishSource(
    settingsFilePath: string,
    skillId: string,
): Promise<RegistrySkillPublishSource | undefined> {
    const skillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
        settingsFilePath,
        skillId,
    );

    if (!(await directoryExists(skillDirectoryPath))) {
        return undefined;
    }

    const metadata = await readManagedSkillMetadata(skillDirectoryPath);

    if (metadata?.packageName === undefined) {
        throw new CliUserError("errors.skills.publish.registryMetadataMissing", 1, {
            name: skillId,
            path: resolveManagedSkillMetadataFilePath(skillDirectoryPath),
        });
    }

    return {
        kind: "registry",
        packageName: metadata.packageName,
        skillDirectoryPath,
        skillId,
    };
}

async function resolveAgentSkillPublishSource(
    env: Record<string, string | undefined>,
    skillId: string,
    agentName: BundledSkillAgentName,
): Promise<AdoptableSkillPublishSource | undefined> {
    const homeDirectory = resolveBundledSkillHomeDirectory(env, agentName);
    const skillDirectoryPath = resolveManagedSkillDirectoryPath(
        homeDirectory,
        skillId,
    );

    if (!(await isSkillDirectoryWithSkillFile(skillDirectoryPath))) {
        return undefined;
    }

    return {
        kind: "adoptable",
        skillDirectoryPath,
        skillId,
    };
}

async function resolvePathSkillPublishSource(
    skillReference: string,
    cwd: string,
    settingsFilePath: string,
): Promise<SkillPublishSource | undefined> {
    const skillDirectoryPath = isAbsolute(skillReference)
        ? resolve(skillReference)
        : resolve(cwd, skillReference);

    if (!(await isSkillDirectoryWithSkillFile(skillDirectoryPath))) {
        return undefined;
    }

    const skillId = basename(skillDirectoryPath);

    if (!isSkillIdReference(skillId)) {
        return undefined;
    }

    const localSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
        settingsFilePath,
        skillId,
    );

    if (resolve(localSkillDirectoryPath) === skillDirectoryPath) {
        return {
            kind: "local",
            skillDirectoryPath,
            skillId,
        };
    }

    if (isBundledSkillName(skillId)) {
        throw createBundledSkillPublishError(skillId);
    }

    const bundledSkillDirectoryPath = await findExistingBundledSkillDirectoryPath(
        settingsFilePath,
        skillId,
    );

    if (
        bundledSkillDirectoryPath !== undefined
        && resolve(bundledSkillDirectoryPath) === skillDirectoryPath
    ) {
        throw createBundledSkillPublishError(skillId);
    }

    const registrySkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
        settingsFilePath,
        skillId,
    );

    if (resolve(registrySkillDirectoryPath) === skillDirectoryPath) {
        return await resolveRegistrySkillPublishSource(settingsFilePath, skillId);
    }

    return {
        kind: "adoptable",
        skillDirectoryPath,
        skillId,
    };
}

async function confirmAndPrepareSkillPublishSource(
    options: {
        packageName: string;
        source: SkillPublishSource;
        yes: boolean;
    },
    context: Pick<CliExecutionContext, "env" | "settingsStore" | "stdin" | "stdout" | "translator">,
): Promise<LocalSkillPublishSource | RegistrySkillPublishSource> {
    switch (options.source.kind) {
        case "local":
            return options.source;
        case "registry": {
            if (
                normalizePackageNameForComparison(options.source.packageName)
                === normalizePackageNameForComparison(options.packageName)
            ) {
                return options.source;
            }

            await confirmRegistrySkillPackagePublish(
                options.source,
                options.packageName,
                context,
                options.yes,
            );

            return options.source;
        }
        case "adoptable": {
            const localSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
                context.settingsStore.getFilePath(),
                options.source.skillId,
            );
            const publicationTargets = await resolveAdoptedLocalSkillPublicationTargets({
                context,
                source: options.source,
            });

            await validateAdoptableSkillPublishSource(options.source);

            await confirmAdoptableSkillPublish(
                {
                    localSkillDirectoryPath,
                    packageName: options.packageName,
                    source: options.source,
                },
                context,
                options.yes,
            );

            await adoptSkillPublishSource({
                context,
                localSkillDirectoryPath,
                publicationTargets,
                source: options.source,
            });

            return {
                kind: "local",
                skillDirectoryPath: localSkillDirectoryPath,
                skillId: options.source.skillId,
            };
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

async function confirmAdoptableSkillPublish(
    options: {
        localSkillDirectoryPath: string;
        packageName: string;
        source: AdoptableSkillPublishSource;
    },
    context: Pick<CliExecutionContext, "stdin" | "stdout" | "translator">,
    yes: boolean,
): Promise<void> {
    if (yes) {
        return;
    }

    const params = {
        localPath: options.localSkillDirectoryPath,
        name: options.source.skillId,
        packageName: options.packageName,
        path: options.source.skillDirectoryPath,
    };

    if (context.stdin.isTTY !== true) {
        throw new CliUserError(
            "errors.skills.publish.adoptionConfirmationRequired",
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
                "skills.publish.adoption.prompt",
                params,
            ),
        },
    );

    if (!confirmed) {
        throw new CliUserError("errors.skills.publish.adoptionCancelled", 1, params);
    }
}

async function adoptSkillPublishSource(
    options: {
        context: Pick<CliExecutionContext, "env" | "settingsStore" | "stdout" | "translator">;
        localSkillDirectoryPath: string;
        publicationTargets: readonly LocalSkillHostPublicationTarget[];
        source: AdoptableSkillPublishSource;
    },
): Promise<void> {
    const publishedTargets: LocalSkillHostPublicationTarget[] = [];
    let activePublicationTarget: LocalSkillHostPublicationTarget | undefined;

    try {
        await copySkillDirectoryToLocalStorage(
            options.source.skillDirectoryPath,
            options.localSkillDirectoryPath,
            options.source.skillId,
        );
        await importManagedMetadataToSkillFrontmatter(options.localSkillDirectoryPath);
        await writeLocalSkillMetadata(options.localSkillDirectoryPath);
        await validateAdoptedLocalSkill(options.localSkillDirectoryPath, options.source.skillId);

        writeLine(
            options.context.stdout,
            options.context.translator.t("skills.publish.adopted", {
                name: options.source.skillId,
                path: options.localSkillDirectoryPath,
            }),
        );

        for (const target of orderAdoptedLocalSkillPublicationTargets(
            options.publicationTargets,
            options.source.skillDirectoryPath,
        )) {
            activePublicationTarget = target;
            await publishBundledSkillInstallation({
                canonicalSkillDirectoryPath: options.localSkillDirectoryPath,
                installedSkillDirectoryPath: target.installedSkillDirectoryPath,
            });

            publishedTargets.push(target);
            activePublicationTarget = undefined;

            writeLine(
                options.context.stdout,
                options.context.translator.t("skills.init.copied", {
                    name: options.source.skillId,
                    path: target.installedSkillDirectoryPath,
                }),
            );
        }

        if (!hasSourcePublicationTarget(
            options.publicationTargets,
            options.source.skillDirectoryPath,
        )) {
            await removePath(options.source.skillDirectoryPath);
        }
    }
    catch (error) {
        await rollbackAdoptedSkillPublishSource({
            localSkillDirectoryPath: options.localSkillDirectoryPath,
            publishedTargets,
            source: options.source,
            targetBeingPublished: activePublicationTarget,
        });
        throw error;
    }
}

async function copySkillDirectoryToLocalStorage(
    sourceDirectoryPath: string,
    localSkillDirectoryPath: string,
    skillId: string,
): Promise<void> {
    if (await pathExists(localSkillDirectoryPath)) {
        throw new CliUserError("errors.skills.storageConflict", 1, {
            name: skillId,
            path: localSkillDirectoryPath,
        });
    }

    await assertSkillDirectoryHasNoSymbolicLinks(sourceDirectoryPath);
    await mkdir(dirname(localSkillDirectoryPath), { recursive: true });

    await cp(sourceDirectoryPath, localSkillDirectoryPath, {
        dereference: false,
        errorOnExist: true,
        force: false,
        recursive: true,
    });
}

async function importManagedMetadataToSkillFrontmatter(
    skillDirectoryPath: string,
): Promise<void> {
    const metadataFilePath = resolveManagedSkillMetadataFilePath(skillDirectoryPath);
    let content: string;

    try {
        content = await readFile(metadataFilePath, "utf8");
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return;
        }

        throw error;
    }

    const metadata = parseManagedSkillMetadataContent(content);

    if (metadata !== undefined) {
        await writeSkillFrontmatterMetadata({
            metadata: {
                icon: metadata.icon,
                packageName: metadata.packageName,
                version: metadata.version,
            },
            skillDirectoryPath,
        });
    }

    await rm(metadataFilePath, { force: true });
}

async function resolveAdoptedLocalSkillPublicationTargets(
    options: {
        context: Pick<CliExecutionContext, "env" | "settingsStore">;
        source: AdoptableSkillPublishSource;
    },
): Promise<LocalSkillHostPublicationTarget[]> {
    const targets = await resolveLocalSkillPublicationTargets(
        options.context.env,
        options.source.skillId,
    );

    if (targets.length === 0) {
        throw createMissingManagedSkillHostError(options.context.env);
    }

    const settingsFilePath = options.context.settingsStore.getFilePath();

    if (targets.some(target =>
        !isLocalSkillPathContained(
            target.homeDirectory,
            settingsFilePath,
            options.source.skillId,
        ),
    )) {
        throw new CliUserError("errors.skills.invalidPath", 1, {
            name: options.source.skillId,
        });
    }

    const conflictingTarget = await findExistingLocalSkillPublicationTarget(
        targets,
        options.source.skillDirectoryPath,
    );

    if (conflictingTarget !== undefined) {
        throw new CliUserError("errors.skills.nameConflict", 1, {
            name: options.source.skillId,
            path: conflictingTarget.installedSkillDirectoryPath,
        });
    }

    return targets;
}

async function rollbackAdoptedSkillPublishSource(
    options: {
        localSkillDirectoryPath: string;
        publishedTargets: readonly LocalSkillHostPublicationTarget[];
        source: AdoptableSkillPublishSource;
        targetBeingPublished?: LocalSkillHostPublicationTarget;
    },
): Promise<void> {
    const targetsToRemove = options.targetBeingPublished === undefined
        ? [...options.publishedTargets]
        : [...options.publishedTargets, options.targetBeingPublished];

    await Promise.all(targetsToRemove.map(target =>
        removePath(target.installedSkillDirectoryPath),
    ));

    if (!(await pathExists(options.source.skillDirectoryPath))) {
        await restoreSourceSkillDirectoryFromLocalStorage(
            options.localSkillDirectoryPath,
            options.source.skillDirectoryPath,
        );
    }

    await removePath(options.localSkillDirectoryPath);
}

async function restoreSourceSkillDirectoryFromLocalStorage(
    localSkillDirectoryPath: string,
    sourceDirectoryPath: string,
): Promise<void> {
    await assertSkillDirectoryHasNoSymbolicLinks(localSkillDirectoryPath);
    await mkdir(dirname(sourceDirectoryPath), { recursive: true });
    await cp(localSkillDirectoryPath, sourceDirectoryPath, {
        dereference: false,
        errorOnExist: true,
        force: false,
        recursive: true,
    });
}

async function assertSkillDirectoryHasNoSymbolicLinks(
    skillDirectoryPath: string,
    path: string = skillDirectoryPath,
): Promise<void> {
    const metadata = await lstat(path);

    if (metadata.isSymbolicLink()) {
        throw createSymbolicLinkSkillEntryError(skillDirectoryPath, path);
    }

    if (!metadata.isDirectory()) {
        return;
    }

    const entries = await readdir(path, { withFileTypes: true });

    await Promise.all(entries.map(entry =>
        assertSkillDirectoryHasNoSymbolicLinks(
            skillDirectoryPath,
            join(path, entry.name),
        ),
    ));
}

function createSymbolicLinkSkillEntryError(
    skillDirectoryPath: string,
    symbolicLinkPath: string,
): CliUserError {
    const entryPath = relative(skillDirectoryPath, symbolicLinkPath);

    return new CliUserError("errors.skills.publish.invalidSkillFile", 1, {
        message: `Skill entries must not be symbolic links: ${
            entryPath === "" ? symbolicLinkPath : entryPath
        }.`,
        path: skillDirectoryPath,
    });
}

async function findExistingLocalSkillPublicationTarget(
    targets: readonly LocalSkillHostPublicationTarget[],
    sourceDirectoryPath: string,
): Promise<LocalSkillHostPublicationTarget | undefined> {
    for (const target of targets) {
        if (
            await pathExists(target.installedSkillDirectoryPath)
            && !isSameResolvedPath(target.installedSkillDirectoryPath, sourceDirectoryPath)
        ) {
            return target;
        }
    }

    return undefined;
}

function orderAdoptedLocalSkillPublicationTargets(
    targets: readonly LocalSkillHostPublicationTarget[],
    sourceDirectoryPath: string,
): LocalSkillHostPublicationTarget[] {
    const nonSourceTargets: LocalSkillHostPublicationTarget[] = [];
    const sourceTargets: LocalSkillHostPublicationTarget[] = [];

    for (const target of targets) {
        if (isSourcePublicationTarget(target, sourceDirectoryPath)) {
            sourceTargets.push(target);
            continue;
        }

        nonSourceTargets.push(target);
    }

    return [...nonSourceTargets, ...sourceTargets];
}

function hasSourcePublicationTarget(
    targets: readonly LocalSkillHostPublicationTarget[],
    sourceDirectoryPath: string,
): boolean {
    return targets.some(target => isSourcePublicationTarget(target, sourceDirectoryPath));
}

function isSourcePublicationTarget(
    target: LocalSkillHostPublicationTarget,
    sourceDirectoryPath: string,
): boolean {
    return isSameResolvedPath(target.installedSkillDirectoryPath, sourceDirectoryPath);
}

function isSameResolvedPath(leftPath: string, rightPath: string): boolean {
    return resolve(leftPath) === resolve(rightPath);
}

async function validateAdoptableSkillPublishSource(
    source: AdoptableSkillPublishSource,
): Promise<void> {
    await validateAdoptedLocalSkill(source.skillDirectoryPath, source.skillId);
}

async function validateAdoptedLocalSkill(
    skillDirectoryPath: string,
    skillId: string,
): Promise<void> {
    await readLocalSkillPackageMetadata({
        skillDirectoryPath,
        skillId,
    });
}

async function isSkillDirectoryWithSkillFile(
    directoryPath: string,
): Promise<boolean> {
    if (!(await directoryExists(directoryPath))) {
        return false;
    }

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

async function pathExists(path: string): Promise<boolean> {
    try {
        await lstat(path);
        return true;
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return false;
        }

        throw error;
    }
}

function isSkillIdReference(value: string): boolean {
    const trimmedValue = value.trim();

    return trimmedValue !== ""
        && trimmedValue !== "."
        && trimmedValue !== ".."
        && basename(trimmedValue) === trimmedValue;
}

function normalizePackageNameForComparison(packageName: string): string {
    return packageName.trim().toLowerCase();
}

function isBundledSkillName(value: string): boolean {
    return (availableBundledSkillNames as readonly string[]).includes(value);
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
