import type {
    CliCommandDefinition,
    CliExecutionContext,
} from "../../contracts/cli.ts";
import type { BundledSkillName } from "./embedded-assets.ts";

import type { ManagedSkillInstallSummary } from "./install-output.ts";
import type {
    InstallReport,
    PreviousState,
    SkillOperationError,
    SkillResult,
    SkillTargetResult,
} from "./operation-result.ts";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { parsePackageSpecifier } from "../package/shared.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { directoryExists } from "./bundled-skill-observation.ts";
import { availableBundledSkillNames } from "./embedded-assets.ts";
import { writeManagedSkillInstallSummary } from "./install-output.ts";
import { migrateLegacyCanonicalSkillLayout } from "./legacy-canonical-migration.ts";
import { readSkillMetadataFileState } from "./local-skill-ownership.ts";
import {
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallations,
} from "./managed-skill-hosts.ts";
import { readManagedSkillMetadata } from "./managed-skill-metadata.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    computeCommandStatus,
    skillOperationOutputOptions,
    writeSkillOperationJson,
} from "./operation-result.ts";
import { presetSkillPackageNames } from "./preset-packages.ts";
import { installRegistrySkills } from "./registry-skill-install.ts";
import {
    installBundledSkill,
    isBundledSkillName,
    resolveAvailableBundledSkillHostInstallations,
} from "./shared.ts";
import { createSkillIdsTelemetryProperties } from "./telemetry.ts";

interface SkillsInstallInput {
    all?: boolean;
    force?: boolean;
    packageName?: string;
    skill?: string[];
    yes?: boolean;
    format?: "json";
    showSchemaVersion?: boolean;
}

interface SkillsInstallPackageSpecifier {
    hasExplicitPackageVersion: boolean;
    packageName: string;
    packageShareId?: string;
    packageVersion: string;
}

const installErrorMessages: Record<string, string> = {
    not_authenticated: "Authentication is required.",
    no_supported_hosts: "No supported skill host is installed.",
    invalid_path: "Skill name resolves outside the managed skills directory.",
    invalid_package_specifier: "Invalid skills package specifier.",
    package_lookup_failed: "Failed to fetch the latest package version.",
    package_download_failed: "Failed to download the package archive.",
    invalid_package_archive: "Downloaded package archive is invalid.",
    skill_not_found_in_package: "The skill was not found in the requested package.",
    name_conflict: "Skill name is already used by a non-OOMOL skill.",
    storage_conflict: "Bundled skill storage is already occupied by non-OOMOL content.",
    confirmation_required: "Interactive confirmation is required; pass --skill, --all, or --yes.",
    publication_failed: "Failed to publish the skill to one or more hosts.",
    unknown: "Unknown error.",
};

export const skillsInstallCommand: CliCommandDefinition<SkillsInstallInput> = {
    name: "install",
    aliases: ["add"],
    summaryKey: "commands.skills.install.summary",
    descriptionKey: "commands.skills.install.description",
    arguments: [
        {
            name: "packageName",
            descriptionKey: "arguments.packageName",
            required: false,
        },
    ],
    options: [
        {
            name: "skill",
            longFlag: "--skill",
            shortFlag: "-s",
            valueName: "skills...",
            descriptionKey: "options.skill",
        },
        {
            name: "yes",
            longFlag: "--yes",
            shortFlag: "-y",
            descriptionKey: "options.yes",
        },
        {
            name: "all",
            longFlag: "--all",
            descriptionKey: "options.all",
        },
        {
            name: "force",
            longFlag: "--force",
            shortFlag: "-f",
            descriptionKey: "options.skills.install.force",
        },
        ...skillOperationOutputOptions,
    ],
    inputSchema: z.object({
        all: z.boolean().optional(),
        force: z.boolean().optional(),
        packageName: z.string().optional(),
        skill: z.array(z.string()).optional(),
        yes: z.boolean().optional(),
        format: z.enum(["json"]).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        await migrateLegacyCanonicalSkillLayout(context);

        const force = input.force === true;

        if (input.format === "json") {
            const report = await runInstallJsonReport(input, context, { force });

            recordInstallTelemetry(context, report, force);
            writeSkillOperationJson(context.stdout, report, {
                showSchemaVersion: input.showSchemaVersion,
            });

            if (report.status === "partial-failure" || report.status === "failed") {
                throw new CliUserError("errors.skills.install.partialFailure", 1, {
                    count: report.summary.failed + report.errors.length,
                });
            }
            return;
        }

        context.telemetry?.recordProperties({
            has_force: force,
        });

        if (input.packageName === undefined) {
            context.telemetry?.recordProperties({
                bundled_skill: "__all__",
                package_kind: "bundled",
                ...createSkillIdsTelemetryProperties(availableBundledSkillNames),
            });

            const summaries: ManagedSkillInstallSummary[] = [];

            for (const skillName of availableBundledSkillNames) {
                summaries.push(await installBundledSkill(skillName, context, { force }));
            }

            for (const { summaries: presetSummaries } of await installPresetSkillPackages(
                context,
                force,
            )) {
                summaries.push(...presetSummaries);
            }
            writeManagedSkillInstallSummary(context, summaries);
            return;
        }

        const packageSpecifier = parseSkillsInstallPackageSpecifier(input.packageName);

        if (
            packageSpecifier.packageShareId === undefined
            && !packageSpecifier.hasExplicitPackageVersion
            && isBundledSkillName(packageSpecifier.packageName)
        ) {
            context.telemetry?.recordProperties({
                bundled_skill: packageSpecifier.packageName,
                package_kind: "bundled",
                ...createSkillIdsTelemetryProperties([packageSpecifier.packageName]),
            });

            const summary = await installBundledSkill(
                packageSpecifier.packageName as BundledSkillName,
                context,
                { force },
            );

            writeManagedSkillInstallSummary(context, [summary]);
            return;
        }

        await installRegistrySkills(
            {
                all: input.all === true,
                force,
                packageName: packageSpecifier.packageName,
                packageShareId: packageSpecifier.packageShareId,
                packageVersion: packageSpecifier.packageVersion,
                skillNames: input.skill ?? [],
                yes: input.yes === true,
            },
            context,
        );
    },
};

async function runInstallJsonReport(
    input: SkillsInstallInput,
    context: CliExecutionContext,
    options: { force: boolean },
): Promise<InstallReport> {
    const skills: SkillResult[] = [];
    const errors: SkillOperationError[] = [];

    if (input.packageName === undefined) {
        for (const bundledName of availableBundledSkillNames) {
            const result = await installBundledSkillForJson(
                bundledName,
                context,
                { force: options.force },
            );

            skills.push(result);
        }

        const settingsFilePath = context.settingsStore.getFilePath();
        const presetGroups = await installPresetSkillPackages(context, options.force);

        for (const { packageName, summaries } of presetGroups) {
            for (const summary of summaries) {
                skills.push(await buildRegistrySkillResult(
                    summary,
                    packageName,
                    undefined,
                    settingsFilePath,
                ));
            }
        }
        return buildReport(skills, errors, skills.length);
    }

    let packageSpecifier: SkillsInstallPackageSpecifier;

    try {
        packageSpecifier = parseSkillsInstallPackageSpecifier(input.packageName);
    }
    catch (error) {
        errors.push({
            code: "invalid_package_specifier",
            message: installErrorMessages.invalid_package_specifier!,
        });
        context.logger.warn({ err: error }, "Install --json invalid package specifier.");
        return buildReport(skills, errors, 0);
    }

    if (
        packageSpecifier.packageShareId === undefined
        && !packageSpecifier.hasExplicitPackageVersion
        && isBundledSkillName(packageSpecifier.packageName)
    ) {
        const result = await installBundledSkillForJson(
            packageSpecifier.packageName as BundledSkillName,
            context,
            { force: options.force },
        );

        skills.push(result);
        return buildReport(skills, errors, 1);
    }

    try {
        const previousHostStateBySkill = await capturePreInstallHostState(
            (input.skill ?? []),
            await resolveAvailableManagedSkillHosts(context.env),
        );
        const summaries = await installRegistrySkills(
            {
                all: input.all === true,
                force: options.force,
                packageName: packageSpecifier.packageName,
                packageShareId: packageSpecifier.packageShareId,
                packageVersion: packageSpecifier.packageVersion,
                recordTelemetry: false,
                skillNames: input.skill ?? [],
                writeOutput: false,
                yes: input.yes === true,
            },
            context,
        );

        const settingsFilePath = context.settingsStore.getFilePath();

        for (const summary of summaries) {
            const previousState = previousHostStateBySkill.get(summary.name);

            skills.push(await buildRegistrySkillResult(
                summary,
                packageSpecifier.packageName,
                previousState,
                settingsFilePath,
            ));
        }
        return buildReport(
            skills,
            errors,
            Math.max(1, summaries.length),
        );
    }
    catch (error) {
        const errorCode = mapInstallErrorCode(error);

        if (
            error instanceof CliUserError
            && error.key === "errors.skills.install.nonInteractiveSelection"
        ) {
            errors.push({
                code: "confirmation_required",
                message: installErrorMessages.confirmation_required!,
            });
            return buildReport(skills, errors, 0);
        }

        if (
            errorCode === "not_authenticated"
            || errorCode === "no_supported_hosts"
            || errorCode === "invalid_package_specifier"
        ) {
            errors.push({
                code: errorCode,
                message: installErrorMessages[errorCode] ?? installErrorMessages.unknown!,
            });
            return buildReport(skills, errors, 0);
        }

        const requestedSkillNames = input.skill ?? [];
        const message = installErrorMessages[errorCode] ?? installErrorMessages.unknown!;

        context.logger.warn(
            { err: error, packageName: packageSpecifier.packageName },
            "Install --json registry install failed.",
        );

        if (requestedSkillNames.length === 0) {
            errors.push({
                code: errorCode,
                message,
            });
            return buildReport(skills, errors, 0);
        }

        for (const skillName of requestedSkillNames) {
            skills.push({
                skillId: skillName,
                kind: "registry",
                packageName: packageSpecifier.packageName,
                previousVersion: null,
                version: packageSpecifier.hasExplicitPackageVersion
                    ? packageSpecifier.packageVersion
                    : null,
                status: "failed",
                targets: [],
                error: { code: errorCode, message },
            });
        }

        return buildReport(skills, errors, requestedSkillNames.length);
    }
}

async function installBundledSkillForJson(
    skillName: BundledSkillName,
    context: CliExecutionContext,
    options: { force: boolean },
): Promise<SkillResult> {
    const installations = await resolveAvailableBundledSkillHostInstallations(
        context,
        skillName,
    );
    const previousStates = await Promise.all(
        installations.map(installation => resolvePreviousState(
            installation.installedSkillDirectoryPath,
        )),
    );

    try {
        const summary = await installBundledSkill(skillName, context, {
            force: options.force,
        });
        const targets: SkillTargetResult[] = summary.publications.map((publication, index) => ({
            agentId: publication.agentName,
            status: "installed",
            path: publication.path,
            sourcePath: installations[index]?.canonicalSkillDirectoryPath ?? null,
            version: context.version,
            previousState: previousStates[index] ?? "unknown",
        }));

        return {
            skillId: skillName,
            kind: "bundled",
            packageName: null,
            previousVersion: null,
            version: context.version,
            status: "installed",
            targets,
        };
    }
    catch (error) {
        const code = mapInstallErrorCode(error);
        const message = installErrorMessages[code] ?? installErrorMessages.unknown!;

        context.logger.warn(
            { err: error, skillName },
            "Bundled skill install failed (JSON path).",
        );

        return {
            skillId: skillName,
            kind: "bundled",
            packageName: null,
            previousVersion: null,
            version: context.version,
            status: "failed",
            targets: [],
            error: { code, message },
        };
    }
}

async function buildRegistrySkillResult(
    summary: ManagedSkillInstallSummary,
    packageName: string,
    previousState: PreviousState | undefined,
    settingsFilePath: string,
): Promise<SkillResult> {
    const canonicalDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
        settingsFilePath,
        summary.name,
    );
    const canonicalMetadata = await readManagedSkillMetadata(canonicalDirectoryPath);
    const version = canonicalMetadata?.version ?? null;
    const resolvedPackageName = canonicalMetadata?.packageName ?? packageName;

    return {
        skillId: summary.name,
        kind: "registry",
        packageName: resolvedPackageName,
        previousVersion: null,
        version,
        status: "installed",
        targets: summary.publications.map(publication => ({
            agentId: publication.agentName,
            status: "installed",
            path: publication.path,
            sourcePath: canonicalDirectoryPath,
            version,
            previousState: previousState ?? "unknown",
        })),
    };
}

async function capturePreInstallHostState(
    requestedSkillNames: readonly string[],
    availableHosts: Awaited<ReturnType<typeof resolveAvailableManagedSkillHosts>>,
): Promise<Map<string, PreviousState>> {
    const result = new Map<string, PreviousState>();

    for (const skillName of requestedSkillNames) {
        const installations = resolveManagedSkillHostInstallations(availableHosts, skillName);
        const states = await Promise.all(
            installations.map(installation =>
                resolvePreviousState(installation.installedSkillDirectoryPath),
            ),
        );
        const previousState
            = states.find(state => state === "unmanaged") ?? states.find(state =>
                state === "managed") ?? "absent";

        result.set(skillName, previousState);
    }

    return result;
}

async function resolvePreviousState(installedDirectoryPath: string): Promise<PreviousState> {
    if (!(await directoryExists(installedDirectoryPath))) {
        return "absent";
    }
    const state = await readSkillMetadataFileState(installedDirectoryPath);

    if (state.metadata === undefined) {
        return "unmanaged";
    }
    return "managed";
}

function mapInstallErrorCode(error: unknown): string {
    if (!(error instanceof CliUserError)) {
        return "unknown";
    }
    switch (error.key) {
        case "errors.skills.install.invalidPackageInfo":
        case "errors.skills.install.packageInfoRequestError":
        case "errors.skills.install.packageInfoRequestFailed":
            return "package_lookup_failed";
        case "errors.skills.install.packageDownloadError":
        case "errors.skills.install.packageDownloadFailed":
            return "package_download_failed";
        case "errors.skills.install.invalidArchive":
            return "invalid_package_archive";
        case "errors.skills.install.skillNotFound":
        case "errors.skills.install.noPublishedSkills":
            return "skill_not_found_in_package";
        case "errors.skills.invalidPath":
            return "invalid_path";
        case "errors.skills.noSupportedBundledSkillHosts":
            return "no_supported_hosts";
        case "errors.auth.required":
        case "auth.account.activeAccountMissing":
            return "not_authenticated";
        case "errors.skills.nameConflict":
            return "name_conflict";
        case "errors.skills.storageConflict":
            return "storage_conflict";
        case "errors.skills.install.confirmationRequired":
        case "errors.skills.install.nonInteractiveSelection":
            return "confirmation_required";
        case "errors.skills.install.invalidPackageSpecifier":
            return "invalid_package_specifier";
        default:
            return "unknown";
    }
}

function buildReport(
    skills: SkillResult[],
    commandErrors: SkillOperationError[],
    requested: number,
): InstallReport {
    const installed = skills.filter(skill => skill.status === "installed").length;
    const skipped = skills.filter(skill => skill.status === "skipped").length;
    const failed = skills.filter(skill => skill.status === "failed").length;
    const status = computeCommandStatus({
        succeeded: installed,
        failed,
        commandLevelErrors: commandErrors.length,
        noopWhenEmpty: skills.length === 0 && commandErrors.length === 0,
    });

    return {
        command: "skills.install",
        status,
        summary: {
            requestedSkills: requested,
            installed,
            skipped,
            failed,
        },
        skills,
        errors: commandErrors,
    };
}

function recordInstallTelemetry(
    context: CliExecutionContext,
    report: InstallReport,
    force: boolean,
): void {
    const hasBundled = report.skills.some(skill => skill.kind === "bundled");
    const hasRegistry = report.skills.some(skill => skill.kind === "registry");

    context.telemetry?.recordProperties({
        format: "json",
        has_force: force,
        skill_count_bucket: bucketTelemetryCount(report.summary.requestedSkills),
        installed_count_bucket: bucketTelemetryCount(report.summary.installed),
        failed_count_bucket: bucketTelemetryCount(report.summary.failed),
        has_bundled_skill: hasBundled,
        has_registry_skill: hasRegistry,
    });
}

interface PresetSkillPackageInstallGroup {
    packageName: string;
    summaries: ManagedSkillInstallSummary[];
}

async function installPresetSkillPackages(
    context: CliExecutionContext,
    force: boolean,
): Promise<PresetSkillPackageInstallGroup[]> {
    const groups: PresetSkillPackageInstallGroup[] = [];

    for (const packageName of presetSkillPackageNames) {
        try {
            const summaries = await installRegistrySkills(
                {
                    all: true,
                    force,
                    packageName,
                    recordTelemetry: false,
                    skillNames: [],
                    writeOutput: false,
                    yes: true,
                },
                context,
            );

            groups.push({ packageName, summaries });
        }
        catch (error) {
            context.logger.warn(
                {
                    err: error,
                    packageName,
                },
                "Preset skill package install skipped.",
            );
        }
    }

    return groups;
}

function parseSkillsInstallPackageSpecifier(
    packageSpecifier: string,
): SkillsInstallPackageSpecifier {
    const trimmedSpecifier = packageSpecifier.trim();

    if (trimmedSpecifier === "") {
        throw new CliUserError("errors.skills.install.invalidPackageSpecifier", 2, {
            value: packageSpecifier,
        });
    }

    const shareSeparatorIndex = trimmedSpecifier.indexOf("#");

    if (shareSeparatorIndex < 0) {
        return parseSkillsInstallPackageIdentity(trimmedSpecifier);
    }

    const packageIdentity = trimmedSpecifier.slice(0, shareSeparatorIndex).trim();
    const packageShareId = trimmedSpecifier.slice(shareSeparatorIndex + 1).trim();

    if (
        packageIdentity === ""
        || packageShareId === ""
        || packageShareId.includes("#")
    ) {
        throw new CliUserError("errors.skills.install.invalidPackageSpecifier", 2, {
            value: packageSpecifier,
        });
    }

    return {
        ...parseSkillsInstallPackageIdentity(packageIdentity),
        packageShareId,
    };
}

function parseSkillsInstallPackageIdentity(
    packageIdentity: string,
): Omit<SkillsInstallPackageSpecifier, "packageShareId"> {
    const packageSpecifier = parsePackageSpecifier(packageIdentity, {
        errorKey: "errors.skills.install.invalidPackageSpecifier",
    });

    return {
        hasExplicitPackageVersion: packageIdentity !== packageSpecifier.packageName,
        packageName: packageSpecifier.packageName,
        packageVersion: packageSpecifier.packageVersion,
    };
}
