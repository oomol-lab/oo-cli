import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { ManagedSkillListItem } from "./list.ts";
import type { ManagedSkillHost } from "./managed-skill-hosts.ts";

import ignore from "ignore";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { compareSemver } from "../../semver.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { parseCommaSeparatedValues } from "../shared/list-parsing.ts";
import { writeLine } from "../shared/output.ts";
import { requestText } from "../shared/request.ts";
import {
    listManagedSkillInstallations,
    listManagedSkillInstallationsForHosts,
} from "./list.ts";
import {
    createMissingManagedSkillHostError,
    resolveAvailableManagedSkillHosts,
} from "./managed-skill-hosts.ts";
import {
    resolveManagedSkillCanonicalRootDirectoryPath,
} from "./managed-skill-paths.ts";
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
}

interface SkillsSyncApplyInput {
    source?: string;
}

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
            ],
            inputSchema: z.object({
                ignore: z.array(z.string()).optional(),
                source: z.string().optional(),
            }),
            handler: async (input, context) => {
                parseSkillSyncSource(input.source);
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
            ],
            inputSchema: z.object({
                source: z.string().optional(),
            }),
            handler: async (input, context) => {
                parseSkillSyncSource(input.source);
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
        listManagedSkillInstallationsForHosts(availableHosts, settingsFilePath),
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
