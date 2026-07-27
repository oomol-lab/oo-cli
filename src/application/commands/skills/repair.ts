import type {
    CliCommandDefinition,
    CliExecutionContext,
} from "../../contracts/cli.ts";
import type { BundledSkillAgentName, BundledSkillName } from "./embedded-assets.ts";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { outputFormatOptions, writeJsonOutput } from "../command-output.ts";
import { writeLine } from "../shared/output.ts";
import { publishBundledSkillInstallation } from "./bundled-skill-filesystem.ts";
import { directoryExists } from "./bundled-skill-observation.ts";
import { resolveBundledSkillCanonicalDirectoryPath } from "./bundled-skill-paths.ts";
import { listLocalSkillSources } from "./local-skill-source.ts";
import {
    createManagedSkillAgentNotInstalledError,
    parseManagedSkillAgentOption,
    readManagedSkillAgentLabel,
    readManagedSkillAgentLabels,
    resolveManagedSkillAgentHomeDirectory,
} from "./managed-skill-agents.ts";
import {
    createMissingManagedSkillHostError,
    resolveAvailableManagedSkillHosts,
} from "./managed-skill-hosts.ts";
import {
    isManagedSkillPathContained,
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    isBundledSkillName,
    publishManagedBundledSkill,
} from "./shared.ts";
import {
    managedMetadataOfKind,
    readSkillDirectoryState,
} from "./skill-directory-state.ts";

interface SkillsRepairInput {
    agent?: string[];
    format?: "json";
    showSchemaVersion?: boolean;
    skill?: string[];
}

type RepairSourceKind = "bundled" | "registry";

type RepairErrorCode
    = | "source_not_found"
        | "source_invalid"
        | "invalid_path"
        | "write_failed"
        | "unknown";

const repairErrorMessageKey: Record<RepairErrorCode, string> = {
    source_not_found: "errors.skills.repair.sourceNotFound",
    source_invalid: "errors.skills.repair.sourceInvalid",
    invalid_path: "errors.skills.repair.invalidPath",
    write_failed: "errors.skills.repair.writeFailed",
    unknown: "errors.skills.repair.writeFailed",
};

interface RepairResultEntry {
    skill: string;
    kind: RepairSourceKind;
    agentId: BundledSkillAgentName;
    status: "repaired" | "failed";
    path: string;
    sourcePath: string | null;
    version: string | null;
    error?: {
        code: RepairErrorCode;
        message: string;
    };
}

interface RepairOutcome {
    summary: {
        requestedSkills: number;
        targetAgents: number;
        repaired: number;
        failed: number;
    };
    results: RepairResultEntry[];
}

interface BundledRepairSource {
    kind: "bundled";
    skillName: BundledSkillName;
}

interface RegistryRepairSource {
    kind: "registry";
    skillName: string;
    canonicalDirectoryPath: string;
    version: string | null;
}

interface UnresolvedRepairSource {
    kind: "unresolved";
    skillName: string;
    sourcePath: string | null;
    unavailable: "source_not_found" | "source_invalid";
}

type RepairSource = BundledRepairSource | RegistryRepairSource | UnresolvedRepairSource;

export const skillsRepairCommand: CliCommandDefinition<SkillsRepairInput> = {
    name: "repair",
    summaryKey: "commands.skills.repair.summary",
    descriptionKey: "commands.skills.repair.description",
    options: [
        {
            name: "skill",
            longFlag: "--skill",
            valueName: "skills...",
            descriptionKey: "options.skills.repair.skill",
        },
        {
            name: "agent",
            longFlag: "--agent",
            valueName: "agents...",
            descriptionKey: "options.skills.repair.agent",
        },
        ...outputFormatOptions,
    ],
    inputSchema: z.object({
        agent: z.array(z.string()).optional(),
        format: z.enum(["json"]).optional(),
        showSchemaVersion: z.boolean().optional(),
        skill: z.array(z.string()).optional(),
    }),
    handler: async (input, context) => {
        const skillNames = dedupePreserveOrder(input.skill ?? []);

        if (skillNames.length === 0) {
            throw new CliUserError("errors.skills.repair.skillRequired", 2);
        }

        const agentNames = await resolveRepairAgents(
            dedupePreserveOrder(input.agent ?? []),
            context,
        );
        const sources = await resolveRepairSources(skillNames, context);
        const outcome = await runRepair({
            agents: agentNames,
            sources,
            context,
        });

        recordTelemetry(context, outcome, {
            hasAgentFilter: (input.agent?.length ?? 0) > 0,
        });

        if (input.format === "json") {
            writeJsonOutput(context.stdout, outcome, {
                showSchemaVersion: input.showSchemaVersion,
            });
        }
        else {
            writeText(context, outcome);
        }

        if (outcome.summary.failed > 0) {
            throw new CliUserError("errors.skills.repair.partialFailure", 1, {
                count: outcome.summary.failed,
            });
        }
    },
};

async function resolveRepairAgents(
    requested: readonly string[],
    context: CliExecutionContext,
): Promise<BundledSkillAgentName[]> {
    if (requested.length === 0) {
        const hosts = await resolveAvailableManagedSkillHosts(context.env);

        if (hosts.length === 0) {
            throw createMissingManagedSkillHostError(context.env);
        }
        return hosts.map(host => host.agentName);
    }

    const validated: BundledSkillAgentName[] = [];

    for (const value of requested) {
        const agentName = parseManagedSkillAgentOption(
            value,
            "errors.skills.list.invalidAgent",
        );

        if (agentName === undefined) {
            throw new CliUserError("errors.skills.list.invalidAgent", 2, { value });
        }
        const homeDirectory = resolveManagedSkillAgentHomeDirectory(context.env, agentName);

        if (!(await directoryExists(homeDirectory))) {
            throw createManagedSkillAgentNotInstalledError(
                agentName,
                homeDirectory,
                context.translator,
            );
        }
        validated.push(agentName);
    }

    return validated;
}

async function resolveRepairSources(
    skillNames: readonly string[],
    context: CliExecutionContext,
): Promise<RepairSource[]> {
    // Cache the local-skill scan once per invocation: the legacy per-skill
    // lookup re-walked every agent's skills directory for each unresolved
    // skill name.
    let localSkillNames: Set<string> | undefined;
    const loadLocalSkillNames = async (): Promise<Set<string>> => {
        if (localSkillNames === undefined) {
            const sources = await listLocalSkillSources({ env: context.env });

            localSkillNames = new Set(sources.map(source => source.name));
        }
        return localSkillNames;
    };
    const settingsFilePath = context.settingsStore.getFilePath();
    const sources: RepairSource[] = [];

    for (const skillName of skillNames) {
        if (isBundledSkillName(skillName)) {
            sources.push({ kind: "bundled", skillName });
            continue;
        }

        const canonicalDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            settingsFilePath,
            skillName,
        );
        const canonicalState = await readSkillDirectoryState(
            canonicalDirectoryPath,
        );
        const canonicalMetadata = managedMetadataOfKind(canonicalState, "registry");

        if (canonicalMetadata !== undefined) {
            sources.push({
                kind: "registry",
                skillName,
                canonicalDirectoryPath,
                version: canonicalMetadata.version,
            });
            continue;
        }

        if (
            canonicalState.kind === "unmanaged"
            || canonicalState.kind === "managed"
        ) {
            // Canonical directory exists but metadata is missing/invalid for a
            // registry source: surface as per-pair failure rather than aborting
            // the whole run.
            sources.push({
                kind: "unresolved",
                skillName,
                sourcePath: canonicalDirectoryPath,
                unavailable: "source_invalid",
            });
            continue;
        }

        // local-only skills are a participation-class mismatch, not a per-pair
        // execution failure: keep fail-fast so other valid skills are not
        // partially executed under a misunderstanding of what repair covers.
        if ((await loadLocalSkillNames()).has(skillName)) {
            throw new CliUserError("errors.skills.repair.localUnsupported", 1, {
                name: skillName,
            });
        }

        sources.push({
            kind: "unresolved",
            skillName,
            sourcePath: null,
            unavailable: "source_not_found",
        });
    }

    return sources;
}

interface RunRepairOptions {
    agents: readonly BundledSkillAgentName[];
    sources: readonly RepairSource[];
    context: CliExecutionContext;
}

async function runRepair(options: RunRepairOptions): Promise<RepairOutcome> {
    const pairs: Array<Promise<RepairResultEntry>> = [];

    for (const source of options.sources) {
        for (const agentId of options.agents) {
            pairs.push(repairPair(source, agentId, options.context));
        }
    }

    const results = await Promise.all(pairs);
    let repaired = 0;
    let failed = 0;

    for (const entry of results) {
        if (entry.status === "repaired") {
            repaired += 1;
        }
        else {
            failed += 1;
        }
    }

    return {
        summary: {
            requestedSkills: options.sources.length,
            targetAgents: options.agents.length,
            repaired,
            failed,
        },
        results,
    };
}

async function repairPair(
    source: RepairSource,
    agentId: BundledSkillAgentName,
    context: CliExecutionContext,
): Promise<RepairResultEntry> {
    const homeDirectory = resolveManagedSkillAgentHomeDirectory(context.env, agentId);
    const settingsFilePath = context.settingsStore.getFilePath();
    const installedPath = resolveManagedSkillDirectoryPath(homeDirectory, source.skillName);
    // Unresolved sources surface in JSON as `registry` kind because the
    // unresolved cases (missing/invalid canonical) are all registry source
    // resolution failures; bundled name resolution never fails.
    const kind: RepairSourceKind = source.kind === "bundled" ? "bundled" : "registry";
    const expectedSourcePath = source.kind === "bundled"
        ? resolveBundledSkillCanonicalDirectoryPath(settingsFilePath, source.skillName, agentId)
        : source.kind === "registry"
            ? source.canonicalDirectoryPath
            : source.sourcePath;
    const expectedVersion = source.kind === "bundled"
        ? context.version
        : source.kind === "registry"
            ? source.version
            : null;
    const buildFailure = (code: RepairErrorCode, includeSource: boolean): RepairResultEntry => ({
        skill: source.skillName,
        kind,
        agentId,
        status: "failed",
        path: installedPath,
        sourcePath: includeSource ? expectedSourcePath : null,
        version: includeSource ? expectedVersion : null,
        error: {
            code,
            message: context.translator.t(repairErrorMessageKey[code]),
        },
    });

    if (source.kind === "unresolved") {
        return buildFailure(source.unavailable, true);
    }

    if (!isManagedSkillPathContained(homeDirectory, settingsFilePath, source.skillName)) {
        return buildFailure("invalid_path", false);
    }

    try {
        if (source.kind === "bundled") {
            await publishManagedBundledSkill({
                agentName: agentId,
                homeDirectory,
                settingsFilePath,
                skillName: source.skillName,
                version: context.version,
            });
        }
        else {
            await publishBundledSkillInstallation({
                canonicalSkillDirectoryPath: source.canonicalDirectoryPath,
                installedSkillDirectoryPath: installedPath,
            });
        }

        return {
            skill: source.skillName,
            kind,
            agentId,
            status: "repaired",
            path: installedPath,
            sourcePath: expectedSourcePath,
            version: expectedVersion,
        };
    }
    catch (error) {
        context.logger.warn(
            {
                err: error,
                agentId,
                skillName: source.skillName,
                kind,
            },
            "Skill repair failed.",
        );

        return buildFailure("write_failed", true);
    }
}

function writeText(
    context: Pick<CliExecutionContext, "stdout" | "translator">,
    outcome: RepairOutcome,
): void {
    const successfulEntries = outcome.results.filter(entry => entry.status === "repaired");
    const successfulBySkill = groupAgentsBySkill(successfulEntries);
    // Count only agents that actually had at least one skill repaired, to keep
    // the same "at least one success" counting rule as `skillCount`. Using
    // `targetAgents` here would overstate the result on partial failure.
    const successfulAgentCount = new Set(successfulEntries.map(entry => entry.agentId)).size;
    const failedEntries = outcome.results.filter(entry => entry.status === "failed");

    if (successfulBySkill.size > 0) {
        writeLine(
            context.stdout,
            context.translator.t("skills.repair.success", {
                skillCount: successfulBySkill.size,
                agentCount: successfulAgentCount,
            }),
        );

        for (const [skill, agents] of successfulBySkill) {
            writeLine(
                context.stdout,
                context.translator.t("skills.repair.success.line", {
                    name: skill,
                    agents: readManagedSkillAgentLabels(agents, context.translator),
                }),
            );
        }
    }

    if (failedEntries.length > 0) {
        writeLine(
            context.stdout,
            context.translator.t("skills.repair.failure", {
                count: failedEntries.length,
            }),
        );

        for (const entry of failedEntries) {
            writeLine(
                context.stdout,
                context.translator.t("skills.repair.failure.line", {
                    name: entry.skill,
                    agent: readManagedSkillAgentLabel(entry.agentId, context.translator),
                    reason: entry.error?.message ?? "",
                }),
            );
        }
    }
}

function groupAgentsBySkill(
    entries: readonly RepairResultEntry[],
): Map<string, BundledSkillAgentName[]> {
    const result = new Map<string, BundledSkillAgentName[]>();

    for (const entry of entries) {
        const existing = result.get(entry.skill) ?? [];

        existing.push(entry.agentId);
        result.set(entry.skill, existing);
    }

    return result;
}

function dedupePreserveOrder<T>(values: readonly T[]): T[] {
    const seen = new Set<T>();
    const result: T[] = [];

    for (const value of values) {
        if (!seen.has(value)) {
            seen.add(value);
            result.push(value);
        }
    }

    return result;
}

function recordTelemetry(
    context: CliExecutionContext,
    outcome: RepairOutcome,
    options: { hasAgentFilter: boolean },
): void {
    const hasBundled = outcome.results.some(entry => entry.kind === "bundled");
    const hasRegistry = outcome.results.some(entry => entry.kind === "registry");

    context.telemetry?.recordProperties({
        has_agent_filter: options.hasAgentFilter,
        agent_count_bucket: bucketTelemetryCount(outcome.summary.targetAgents),
        skill_count_bucket: bucketTelemetryCount(outcome.summary.requestedSkills),
        has_bundled_source: hasBundled,
        has_registry_source: hasRegistry,
        success_count_bucket: bucketTelemetryCount(outcome.summary.repaired),
        failure_count_bucket: bucketTelemetryCount(outcome.summary.failed),
    });
}
