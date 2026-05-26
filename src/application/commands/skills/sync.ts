import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { ManagedSkillHost } from "./managed-skill-hosts.ts";
import type { ManagedSkillListItem } from "./managed-skill-listings.ts";
import type {
    SkillOperationError,
    SkillResult,
    SkillSyncRecordResult,
    SyncApplyReport,
    SyncUploadReport,
} from "./operation-result.ts";

import ignore from "ignore";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { compareSemver } from "../../semver.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { parseCommaSeparatedValues } from "../shared/list-parsing.ts";
import { writeLine } from "../shared/output.ts";
import { requestText } from "../shared/request.ts";
import {
    createMissingManagedSkillHostError,
    resolveAvailableManagedSkillHosts,
} from "./managed-skill-hosts.ts";
import {
    listManagedSkillInstallations,
    listManagedSkillInstallationsForHosts,
} from "./managed-skill-listings.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillCanonicalRootDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    computeCommandStatus,
    skillOperationOutputOptions,
    writeSkillOperationJson,
} from "./operation-result.ts";
import { installRegistrySkills } from "./registry-skill-install.ts";

const skillSyncSourceValues = ["registry"] as const;
const skillSyncRecordSchema = z.object({
    packageName: z.string().min(1),
    skillName: z.string().min(1),
    version: z.string().min(1),
}).strict();
const skillSyncRecordsSchema = z.array(skillSyncRecordSchema);

type SkillSyncSource = typeof skillSyncSourceValues[number];

export type SkillSyncRecord = z.output<typeof skillSyncRecordSchema>;

interface SkillsSyncUploadInput {
    ignore?: string[];
    source?: string;
    format?: "json";
    showSchemaVersion?: boolean;
}

interface SkillsSyncApplyInput {
    source?: string;
    format?: "json";
    showSchemaVersion?: boolean;
}

const syncUploadErrorMessages = {
    not_authenticated: "Authentication is required.",
    no_supported_hosts: "No supported skill host is installed.",
    sync_upload_failed: "Skill sync upload failed.",
    sync_invalid_response: "Skill sync response was invalid.",
    unknown: "Unknown error.",
} as const;

const syncApplyErrorMessages = {
    not_authenticated: "Authentication is required.",
    no_supported_hosts: "No supported skill host is installed.",
    sync_download_failed: "Skill sync download failed.",
    sync_invalid_response: "Skill sync response was invalid.",
    unknown: "Unknown error.",
} as const;

export const skillsSyncCommand: CliCommandDefinition = {
    name: "sync",
    summaryKey: "commands.skills.sync.summary",
    descriptionKey: "commands.skills.sync.description",
    children: [
        {
            name: "upload",
            summaryKey: "commands.skills.sync.upload.summary",
            descriptionKey: "commands.skills.sync.upload.description",
            options: [
                {
                    name: "source",
                    longFlag: "--source",
                    valueName: "source",
                    descriptionKey: "options.skillSyncSource",
                },
                {
                    name: "ignore",
                    longFlag: "--ignore",
                    shortFlag: "-i",
                    valueName: "patterns...",
                    descriptionKey: "options.skillSyncIgnore",
                },
                ...skillOperationOutputOptions,
            ],
            inputSchema: z.object({
                ignore: z.array(z.string()).optional(),
                source: z.string().optional(),
                format: z.enum(["json"]).optional(),
                showSchemaVersion: z.boolean().optional(),
            }),
            mapInputError: (_, rawInput) => createFormatInputError(rawInput),
            handler: async (input, context) => {
                parseSkillSyncSource(input.source);

                if (input.format === "json") {
                    const report = await runSyncUploadJsonReport(
                        { ignorePatterns: parseCommaSeparatedValues(input.ignore) },
                        context,
                    );

                    recordSyncUploadTelemetry(context, report);
                    writeSkillOperationJson(context.stdout, report, {
                        showSchemaVersion: input.showSchemaVersion,
                    });

                    if (
                        report.status === "partial-failure"
                        || report.status === "failed"
                    ) {
                        throw new CliUserError(
                            "errors.skills.sync.upload.partialFailure",
                            1,
                        );
                    }
                    return;
                }

                await uploadRegistrySkills(
                    {
                        ignorePatterns: parseCommaSeparatedValues(input.ignore),
                    },
                    context,
                );
            },
        } satisfies CliCommandDefinition<SkillsSyncUploadInput>,
        {
            name: "apply",
            aliases: ["download", "install"],
            summaryKey: "commands.skills.sync.apply.summary",
            descriptionKey: "commands.skills.sync.apply.description",
            options: [
                {
                    name: "source",
                    longFlag: "--source",
                    valueName: "source",
                    descriptionKey: "options.skillSyncSource",
                },
                ...skillOperationOutputOptions,
            ],
            inputSchema: z.object({
                source: z.string().optional(),
                format: z.enum(["json"]).optional(),
                showSchemaVersion: z.boolean().optional(),
            }),
            mapInputError: (_, rawInput) => createFormatInputError(rawInput),
            handler: async (input, context) => {
                parseSkillSyncSource(input.source);

                if (input.format === "json") {
                    const report = await runSyncApplyJsonReport(context);

                    recordSyncApplyTelemetry(context, report);
                    writeSkillOperationJson(context.stdout, report, {
                        showSchemaVersion: input.showSchemaVersion,
                    });

                    if (
                        report.status === "partial-failure"
                        || report.status === "failed"
                    ) {
                        throw new CliUserError(
                            "errors.skills.sync.apply.partialFailure",
                            1,
                            { count: report.summary.failed + report.errors.length },
                        );
                    }
                    return;
                }

                await applyRegistrySkills(context);
            },
        } satisfies CliCommandDefinition<SkillsSyncApplyInput>,
    ],
};

export async function uploadRegistrySkills(
    request: {
        ignorePatterns: readonly string[];
    },
    context: CliExecutionContext,
): Promise<void> {
    const account = await requireCurrentAccount(context);
    const availableHosts = await resolveAvailableManagedSkillHosts(context.env);
    const records = filterSkillSyncRecords(
        await collectRegistrySkillSyncRecords(
            availableHosts,
            context.settingsStore.getFilePath(),
        ),
        request.ignorePatterns,
    );

    await requestSkillSyncUpload(records, account, context);
    writeLine(
        context.stdout,
        context.translator.t("skills.sync.upload.success", {
            count: records.length,
        }),
    );
}

export async function applyRegistrySkills(context: CliExecutionContext): Promise<void> {
    const account = await requireCurrentAccount(context);
    const availableHosts = await resolveAvailableManagedSkillHosts(context.env);

    if (availableHosts.length === 0) {
        throw createMissingManagedSkillHostError(context.env);
    }

    const records = await requestSkillSyncDownload(account, context);

    if (records.length === 0) {
        writeLine(context.stdout, context.translator.t("skills.sync.apply.noResults"));
        return;
    }

    for (const record of records) {
        await installRegistrySkills(
            {
                all: false,
                packageName: record.packageName,
                packageVersion: record.version,
                skillNames: [record.skillName],
                yes: true,
            },
            context,
        );
    }

    writeLine(
        context.stdout,
        context.translator.t("skills.sync.apply.success", {
            count: records.length,
        }),
    );
}

async function runSyncUploadJsonReport(
    request: { ignorePatterns: readonly string[] },
    context: CliExecutionContext,
): Promise<SyncUploadReport> {
    try {
        return await runSyncUploadJsonReportInner(request, context);
    }
    catch (error) {
        // Final safety net: any unexpected throw (filesystem, unknown
        // exception path) still produces a stable JSON payload. The raw
        // error goes to the logger; the JSON never carries raw error text.
        context.logger.warn({ err: error }, "Skill sync upload --json failed unexpectedly.");
        return buildSyncUploadReport([], 0, [{
            code: "unknown",
            message: syncUploadErrorMessages.unknown,
        }]);
    }
}

async function runSyncUploadJsonReportInner(
    request: { ignorePatterns: readonly string[] },
    context: CliExecutionContext,
): Promise<SyncUploadReport> {
    const errors: SkillOperationError[] = [];
    let account: AuthAccount;

    try {
        account = await requireCurrentAccount(context);
    }
    catch (error) {
        errors.push({
            code: "not_authenticated",
            message: syncUploadErrorMessages.not_authenticated,
        });
        context.logger.warn({ err: error }, "Skill sync upload aborted: not authenticated.");
        return buildSyncUploadReport([], 0, errors);
    }

    const availableHosts = await resolveAvailableManagedSkillHosts(context.env);

    if (availableHosts.length === 0) {
        errors.push({
            code: "no_supported_hosts",
            message: syncUploadErrorMessages.no_supported_hosts,
        });
        return buildSyncUploadReport([], 0, errors);
    }

    const allRecords = await collectRegistrySkillSyncRecords(
        availableHosts,
        context.settingsStore.getFilePath(),
    );
    const filteredRecords = filterSkillSyncRecords(allRecords, request.ignorePatterns);
    const ignored = allRecords.length - filteredRecords.length;
    const recordResults: SkillSyncRecordResult[] = filteredRecords.map(record => ({
        skillId: record.skillName,
        packageName: record.packageName,
        version: record.version,
    }));

    try {
        await requestSkillSyncUpload(filteredRecords, account, context);
        return buildSyncUploadReport(recordResults, ignored, errors);
    }
    catch (error) {
        errors.push(toUploadError(error));
        return buildSyncUploadReport(recordResults, ignored, errors);
    }
}

function buildSyncUploadReport(
    records: SkillSyncRecordResult[],
    ignored: number,
    errors: SkillOperationError[],
): SyncUploadReport {
    const failed = errors.length > 0 ? 1 : 0;
    const status = computeCommandStatus({
        succeeded: failed === 0 ? records.length : 0,
        failed,
        commandLevelErrors: 0,
        noopWhenEmpty: failed === 0 && records.length === 0,
    });

    return {
        command: "skills.sync.upload",
        status,
        summary: {
            recordsUploaded: failed === 0 ? records.length : 0,
            recordsIgnored: ignored,
            failed,
        },
        records,
        errors,
    };
}

function toUploadError(error: unknown): SkillOperationError {
    if (error instanceof CliUserError) {
        if (
            error.key === "errors.skills.sync.invalidResponse"
        ) {
            return {
                code: "sync_invalid_response",
                message: syncUploadErrorMessages.sync_invalid_response,
            };
        }
        if (
            error.key === "errors.skills.sync.requestError"
            || error.key === "errors.skills.sync.requestFailed"
        ) {
            return {
                code: "sync_upload_failed",
                message: syncUploadErrorMessages.sync_upload_failed,
            };
        }
    }
    return {
        code: "sync_upload_failed",
        message: syncUploadErrorMessages.sync_upload_failed,
    };
}

async function runSyncApplyJsonReport(
    context: CliExecutionContext,
): Promise<SyncApplyReport> {
    try {
        return await runSyncApplyJsonReportInner(context);
    }
    catch (error) {
        // Final safety net: any unexpected throw (filesystem, unknown
        // exception path) still produces a stable JSON payload.
        context.logger.warn({ err: error }, "Skill sync apply --json failed unexpectedly.");
        return buildSyncApplyReport([], 0, [{
            code: "unknown",
            message: syncApplyErrorMessages.unknown,
        }]);
    }
}

async function runSyncApplyJsonReportInner(
    context: CliExecutionContext,
): Promise<SyncApplyReport> {
    const errors: SkillOperationError[] = [];
    let account: AuthAccount;

    try {
        account = await requireCurrentAccount(context);
    }
    catch (error) {
        errors.push({
            code: "not_authenticated",
            message: syncApplyErrorMessages.not_authenticated,
        });
        context.logger.warn({ err: error }, "Skill sync apply aborted: not authenticated.");
        return buildSyncApplyReport([], 0, errors);
    }

    const availableHosts = await resolveAvailableManagedSkillHosts(context.env);

    if (availableHosts.length === 0) {
        errors.push({
            code: "no_supported_hosts",
            message: syncApplyErrorMessages.no_supported_hosts,
        });
        return buildSyncApplyReport([], 0, errors);
    }

    let records: SkillSyncRecord[];

    try {
        records = await requestSkillSyncDownload(account, context);
    }
    catch (error) {
        errors.push(toApplyDownloadError(error));
        return buildSyncApplyReport([], 0, errors);
    }

    if (records.length === 0) {
        return buildSyncApplyReport([], 0, errors);
    }

    const skills: SkillResult[] = [];

    for (const record of records) {
        const skillResult = await applySingleSyncRecord(record, context);

        skills.push(skillResult);
    }

    return buildSyncApplyReport(skills, records.length, errors);
}

function toApplyDownloadError(error: unknown): SkillOperationError {
    if (error instanceof CliUserError && error.key === "errors.skills.sync.invalidResponse") {
        return {
            code: "sync_invalid_response",
            message: syncApplyErrorMessages.sync_invalid_response,
        };
    }
    return {
        code: "sync_download_failed",
        message: syncApplyErrorMessages.sync_download_failed,
    };
}

const applyInstallErrorMessage: Record<string, string> = {
    package_lookup_failed: "Failed to fetch the latest package version.",
    package_download_failed: "Failed to download the package archive.",
    invalid_package_archive: "Downloaded package archive is invalid.",
    skill_not_found_in_package: "The skill was not found in the requested package.",
    invalid_path: "Skill name resolves outside the managed skills directory.",
    publication_failed: "Failed to publish the skill to one or more hosts.",
    no_supported_hosts: "No supported skill host is installed.",
    not_authenticated: "Authentication is required.",
    unknown: "Unknown error.",
};

async function applySingleSyncRecord(
    record: SkillSyncRecord,
    context: CliExecutionContext,
): Promise<SkillResult> {
    try {
        const summaries = await installRegistrySkills(
            {
                all: false,
                packageName: record.packageName,
                packageVersion: record.version,
                skillNames: [record.skillName],
                yes: true,
                recordTelemetry: false,
                writeOutput: false,
            },
            context,
        );
        const canonicalPath = resolveManagedSkillCanonicalDirectoryPath(
            context.settingsStore.getFilePath(),
            record.skillName,
        );

        const summary = summaries.find(item => item.name === record.skillName);

        if (summary === undefined || summary.publications.length === 0) {
            return {
                skillId: record.skillName,
                kind: "registry",
                packageName: record.packageName,
                previousVersion: null,
                version: record.version,
                status: "current",
                targets: [],
            };
        }

        return {
            skillId: record.skillName,
            kind: "registry",
            packageName: record.packageName,
            previousVersion: null,
            version: record.version,
            status: "installed",
            targets: summary.publications.map(publication => ({
                agentId: publication.agentName,
                status: "installed",
                path: publication.path,
                sourcePath: canonicalPath,
                version: record.version,
                previousState: "absent" as const,
            })),
        };
    }
    catch (error) {
        const code = mapApplyInstallErrorCode(error);
        const message = applyInstallErrorMessage[code]
            ?? applyInstallErrorMessage.unknown!;

        context.logger.warn(
            { err: error, packageName: record.packageName, skillName: record.skillName },
            "Skill sync apply: install failed.",
        );

        return {
            skillId: record.skillName,
            kind: "registry",
            packageName: record.packageName,
            previousVersion: null,
            version: record.version,
            status: "failed",
            targets: [],
            error: { code, message },
        };
    }
}

function mapApplyInstallErrorCode(error: unknown): string {
    if (error instanceof CliUserError) {
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
            case "errors.skills.storageConflict":
                return "publication_failed";
            default:
                return "unknown";
        }
    }
    return "unknown";
}

function buildSyncApplyReport(
    skills: SkillResult[],
    recordsDownloaded: number,
    errors: SkillOperationError[],
): SyncApplyReport {
    const installed = skills.filter(skill => skill.status === "installed").length;
    const current = skills.filter(skill => skill.status === "current").length;
    const failed = skills.filter(skill => skill.status === "failed").length;
    const status = computeCommandStatus({
        succeeded: installed + current,
        failed,
        commandLevelErrors: errors.length,
        noopWhenEmpty: skills.length === 0 && errors.length === 0,
    });

    return {
        command: "skills.sync.apply",
        status,
        summary: {
            recordsDownloaded,
            installed,
            current,
            failed,
        },
        skills,
        errors,
    };
}

function recordSyncUploadTelemetry(
    context: CliExecutionContext,
    report: SyncUploadReport,
): void {
    context.telemetry?.recordProperties({
        format: "json",
        record_count_bucket: bucketTelemetryCount(report.summary.recordsUploaded),
        ignored_count_bucket: bucketTelemetryCount(report.summary.recordsIgnored),
        has_failure: report.summary.failed > 0,
    });
}

function recordSyncApplyTelemetry(
    context: CliExecutionContext,
    report: SyncApplyReport,
): void {
    context.telemetry?.recordProperties({
        format: "json",
        record_count_bucket: bucketTelemetryCount(report.summary.recordsDownloaded),
        installed_count_bucket: bucketTelemetryCount(report.summary.installed),
        failed_count_bucket: bucketTelemetryCount(report.summary.failed),
    });
}

export function createSkillSyncRequestUrl(endpoint: string): URL {
    return new URL(`https://cli-api.${endpoint}/v1/skills`);
}

export function parseSkillSyncResponse(rawResponse: string): SkillSyncRecord[] {
    try {
        return skillSyncRecordsSchema.parse(JSON.parse(rawResponse) as unknown);
    }
    catch {
        throw new CliUserError("errors.skills.sync.invalidResponse", 1);
    }
}

export function filterSkillSyncRecords(
    records: readonly SkillSyncRecord[],
    ignorePatterns: readonly string[],
): SkillSyncRecord[] {
    if (ignorePatterns.length === 0) {
        return [...records];
    }

    const matcher = ignore().add([...ignorePatterns]);

    return records.filter(record =>
        !matcher.ignores(record.packageName)
        && !matcher.ignores(record.skillName),
    );
}

async function collectRegistrySkillSyncRecords(
    availableHosts: readonly ManagedSkillHost[],
    settingsFilePath: string,
): Promise<SkillSyncRecord[]> {
    const [canonicalSkills, hostSkills] = await Promise.all([
        listManagedSkillInstallations(
            resolveManagedSkillCanonicalRootDirectoryPath(settingsFilePath),
        ),
        listManagedSkillInstallationsForHosts(availableHosts),
    ]);

    return deduplicateSkillSyncRecords(
        [...canonicalSkills, ...hostSkills].map(createSkillSyncRecord),
    );
}

function createSkillSyncRecord(
    skill: Pick<ManagedSkillListItem, "metadata" | "name">,
): SkillSyncRecord | undefined {
    if (skill.metadata?.kind !== "registry") {
        return undefined;
    }

    return {
        packageName: skill.metadata.packageName,
        skillName: skill.name,
        version: skill.metadata.version,
    };
}

function deduplicateSkillSyncRecords(
    records: readonly (SkillSyncRecord | undefined)[],
): SkillSyncRecord[] {
    const recordsByIdentity = new Map<string, SkillSyncRecord>();

    for (const record of records) {
        if (record === undefined) {
            continue;
        }

        const key = createSkillSyncRecordIdentity(record);
        const existingRecord = recordsByIdentity.get(key);

        if (
            existingRecord === undefined
            || compareSemver(record.version, existingRecord.version) > 0
        ) {
            recordsByIdentity.set(key, record);
        }
    }

    return Array.from(recordsByIdentity.values()).sort(compareSkillSyncRecords);
}

function createSkillSyncRecordIdentity(
    record: Pick<SkillSyncRecord, "packageName" | "skillName">,
): string {
    return JSON.stringify({
        packageName: record.packageName,
        skillName: record.skillName,
    });
}

function compareSkillSyncRecords(
    left: SkillSyncRecord,
    right: SkillSyncRecord,
): number {
    const packageDifference = left.packageName.localeCompare(right.packageName);

    if (packageDifference !== 0) {
        return packageDifference;
    }

    return left.skillName.localeCompare(right.skillName);
}

async function requestSkillSyncUpload(
    records: readonly SkillSyncRecord[],
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<void> {
    parseSkillSyncResponse(
        await requestText({
            context,
            createRequestFailedError: status => new CliUserError(
                "errors.skills.sync.requestFailed",
                1,
                { status },
            ),
            createUnexpectedError: error => new CliUserError(
                "errors.skills.sync.requestError",
                1,
                {
                    message: error instanceof Error ? error.message : String(error),
                },
            ),
            fields: {
                common: {
                    skillCount: records.length,
                },
            },
            init: {
                body: JSON.stringify(records),
                headers: {
                    "Authorization": account.apiKey,
                    "Content-Type": "application/json",
                },
                method: "PUT",
            },
            requestLabel: "Skills sync upload",
            requestUrl: createSkillSyncRequestUrl(account.endpoint),
        }),
    );
}

async function requestSkillSyncDownload(
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<SkillSyncRecord[]> {
    return parseSkillSyncResponse(
        await requestText({
            context,
            createRequestFailedError: status => new CliUserError(
                "errors.skills.sync.requestFailed",
                1,
                { status },
            ),
            createUnexpectedError: error => new CliUserError(
                "errors.skills.sync.requestError",
                1,
                {
                    message: error instanceof Error ? error.message : String(error),
                },
            ),
            init: {
                headers: {
                    Authorization: account.apiKey,
                },
            },
            requestLabel: "Skills sync download",
            requestUrl: createSkillSyncRequestUrl(account.endpoint),
        }),
    );
}

function parseSkillSyncSource(value: string | undefined): SkillSyncSource {
    if (value === undefined) {
        return "registry";
    }

    if (skillSyncSourceValues.includes(value as SkillSyncSource)) {
        return value as SkillSyncSource;
    }

    throw new CliUserError("errors.skills.sync.invalidSource", 2, {
        value,
    });
}
