import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { BundledSkillAgentName, BundledSkillName } from "./embedded-assets.ts";
import type {
    InstalledSkill,
    InstalledSkillAgentCopy,
    InstalledSkillKind,
} from "./installed-skills.ts";
import { createHash } from "node:crypto";
import { readdir, readFile, realpath } from "node:fs/promises";
import { join, relative } from "node:path";
import {
    resolveBundledSkillCanonicalDirectoryPath,
} from "./bundled-skill-paths.ts";
import { readInstalledSkills } from "./installed-skills.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    isBundledSkillName,
} from "./shared.ts";
import {
    hasFrontmatter,
    isSkillFrontmatterRecord,
    parseSkillMarkdownMatter,
    toNonBlankString,
} from "./skill-frontmatter.ts";

export type SkillInventoryKind = InstalledSkillKind;

export type SkillHostStatus = "installed";

export type SkillHostControlState
    = | "controlled"
        | "modified"
        | "non-managed"
        | "unknown";

export interface SkillInventoryHostEntry {
    agentId: BundledSkillAgentName;
    status: SkillHostStatus;
    path: string;
    sourcePath: string | null;
    version: string | null;
    controlState: SkillHostControlState;
}

export interface SkillInventoryEntry {
    id: string;
    name: string;
    kind: SkillInventoryKind;
    packageName: string | null;
    version: string | null;
    description: string;
    hosts: SkillInventoryHostEntry[];
}

export interface SkillInventorySummary {
    bundledSkills: number;
    registrySkills: number;
    localSkills: number;
}

export interface SkillInventory {
    summary: SkillInventorySummary;
    skills: SkillInventoryEntry[];
}

export interface CollectSkillsInfoInventoryOptions {
    agentName?: BundledSkillAgentName;
    source?: SkillInventoryKind;
}

type InventoryContext = Pick<CliExecutionContext, "env" | "settingsStore">;

/**
 * `summary` always reflects the unfiltered inventory; `skills` reflects the
 * requested view. Default view hides local skills; pass `source: "local"` to
 * include them.
 */
export async function collectSkillsInfoInventory(
    context: InventoryContext,
    options: CollectSkillsInfoInventoryOptions = {},
): Promise<SkillInventory> {
    const fullInventory = await scanFullInventory(context);
    const summary = computeSummary(fullInventory);
    const filtered = applyFilters(fullInventory, options);

    return {
        summary,
        skills: filtered,
    };
}

async function scanFullInventory(
    context: InventoryContext,
): Promise<SkillInventoryEntry[]> {
    const settingsFilePath = context.settingsStore.getFilePath();
    const installedSkills = await readInstalledSkills(context.env, settingsFilePath);
    const builtEntries = await Promise.all(
        installedSkills.map(skill =>
            buildSkillInventoryEntry(skill, settingsFilePath, context.env),
        ),
    );

    // Rows arrive in the documented inventory order (bundled in embedded
    // order, then registry, then local, names sorted within each kind), so no
    // re-sort is needed here.
    return builtEntries.filter(entry => entry !== undefined);
}

async function buildSkillInventoryEntry(
    skill: InstalledSkill,
    settingsFilePath: string,
    env: Record<string, string | undefined>,
): Promise<SkillInventoryEntry | undefined> {
    // Canonical-only rows have no host copy and stay out of the inventory
    // view; update/check-update/sync still see them through the shared rows.
    if (skill.agents.length === 0) {
        return undefined;
    }

    const sourcePathLookup = resolveSourcePathLookup(skill, settingsFilePath);
    const hosts = await Promise.all(
        skill.agents.map(async (copy): Promise<SkillInventoryHostEntry> => {
            // Hosts without metadata shadow the managed skill name but are not
            // tied to its canonical source, so they surface sourcePath=null.
            const sourcePath = copy.state === "unmanaged"
                ? null
                : sourcePathLookup(copy.agentName);
            const controlState = await resolveHostControlState({
                copy,
                sourcePath,
                kind: skill.kind,
            });

            return {
                agentId: copy.agentName,
                status: "installed",
                path: copy.path,
                sourcePath,
                version: copy.version ?? null,
                controlState,
            };
        }),
    );

    const description = await readSkillDescription({
        kind: skill.kind,
        skillName: skill.name,
        settingsFilePath,
        env,
        hosts,
    });

    return {
        id: skill.name,
        name: skill.name,
        kind: skill.kind,
        packageName: skill.packageName ?? null,
        version: skill.version ?? null,
        description,
        hosts,
    };
}

function resolveSourcePathLookup(
    skill: Pick<InstalledSkill, "kind" | "name">,
    settingsFilePath: string,
): (agentId: BundledSkillAgentName) => string | null {
    switch (skill.kind) {
        case "bundled": {
            // Bundled skills have per-agent canonical source paths.
            if (!isBundledSkillName(skill.name)) {
                return () => null;
            }

            const bundledName: BundledSkillName = skill.name;

            return agentId => resolveBundledSkillCanonicalDirectoryPath(
                settingsFilePath,
                bundledName,
                agentId,
            );
        }
        case "registry": {
            const sharedSourcePath = resolveManagedSkillCanonicalDirectoryPath(
                settingsFilePath,
                skill.name,
            );

            return () => sharedSourcePath;
        }
        case "local":
            // Local skills are their own source.
            return () => null;
    }
}

interface ResolveHostControlStateInput {
    copy: Pick<InstalledSkillAgentCopy, "path" | "state">;
    sourcePath: string | null;
    kind: SkillInventoryKind;
}

export async function resolveHostControlState(
    input: ResolveHostControlStateInput,
): Promise<SkillHostControlState> {
    if (input.copy.state === "unmanaged") {
        return "non-managed";
    }

    if (input.copy.state === "unparseable") {
        return "unknown";
    }

    if (input.kind === "local") {
        return "controlled";
    }

    if (input.sourcePath === null) {
        return "unknown";
    }

    // Symlink fast path: equal realpaths short-circuit the content compare.
    try {
        const [hostReal, sourceReal] = await Promise.all([
            realpath(input.copy.path),
            realpath(input.sourcePath),
        ]);

        if (hostReal === sourceReal) {
            return "controlled";
        }
    }
    catch {
        // Fall through to content comparison; it will yield "unreadable" if
        // either side is missing, which maps to "unknown".
    }

    const verdict = await compareSkillDirectoryContent(
        input.copy.path,
        input.sourcePath,
    );

    switch (verdict) {
        case "equal":
            return "controlled";
        case "different":
            return "modified";
        case "unreadable":
            return "unknown";
    }
}

export type SkillDirectoryComparisonVerdict
    = | "equal"
        | "different"
        | "unreadable";

export async function compareSkillDirectoryContent(
    leftPath: string,
    rightPath: string,
): Promise<SkillDirectoryComparisonVerdict> {
    let leftFingerprint: DirectoryFingerprint;
    let rightFingerprint: DirectoryFingerprint;

    try {
        [leftFingerprint, rightFingerprint] = await Promise.all([
            collectDirectoryFingerprint(leftPath),
            collectDirectoryFingerprint(rightPath),
        ]);
    }
    catch {
        return "unreadable";
    }

    return fingerprintsEqual(leftFingerprint, rightFingerprint)
        ? "equal"
        : "different";
}

interface DirectoryFingerprintEntry {
    relPath: string;
    kind: "file" | "directory" | "symlink";
    size: number;
    sha256: string;
}

type DirectoryFingerprint = readonly DirectoryFingerprintEntry[];

async function collectDirectoryFingerprint(
    rootPath: string,
): Promise<DirectoryFingerprint> {
    const entries: DirectoryFingerprintEntry[] = [];

    await walkDirectory(rootPath, rootPath, entries);
    entries.sort((left, right) => left.relPath.localeCompare(right.relPath));

    return entries;
}

async function walkDirectory(
    rootPath: string,
    currentPath: string,
    entries: DirectoryFingerprintEntry[],
): Promise<void> {
    const dirEntries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of dirEntries) {
        const entryPath = join(currentPath, entry.name);
        const relPath = relative(rootPath, entryPath);

        if (entry.isDirectory()) {
            entries.push({
                relPath,
                kind: "directory",
                size: 0,
                sha256: "",
            });
            await walkDirectory(rootPath, entryPath, entries);
            continue;
        }

        if (entry.isFile()) {
            const content = await readFile(entryPath);

            entries.push({
                relPath,
                kind: "file",
                size: content.byteLength,
                sha256: createHash("sha256").update(content).digest("hex"),
            });
            continue;
        }

        if (entry.isSymbolicLink()) {
            // Managed skill source trees never contain symlinks (the publish
            // pipeline rejects them), so any symlink inside a host directory
            // must be local tampering. Record it with a dedicated kind so the
            // fingerprint diverges from the clean source and the host is
            // reported as `modified` instead of `controlled`.
            entries.push({
                relPath,
                kind: "symlink",
                size: 0,
                sha256: "",
            });
            continue;
        }

        // Skip sockets / devices / FIFOs.
    }
}

function fingerprintsEqual(
    left: DirectoryFingerprint,
    right: DirectoryFingerprint,
): boolean {
    if (left.length !== right.length) {
        return false;
    }

    for (let index = 0; index < left.length; index++) {
        const leftEntry = left[index]!;
        const rightEntry = right[index]!;

        if (
            leftEntry.relPath !== rightEntry.relPath
            || leftEntry.kind !== rightEntry.kind
            || leftEntry.size !== rightEntry.size
            || leftEntry.sha256 !== rightEntry.sha256
        ) {
            return false;
        }
    }

    return true;
}

interface ReadSkillDescriptionOptions {
    kind: SkillInventoryKind;
    skillName: string;
    settingsFilePath: string;
    env: Record<string, string | undefined>;
    hosts: readonly SkillInventoryHostEntry[];
}

async function readSkillDescription(
    options: ReadSkillDescriptionOptions,
): Promise<string> {
    // Try canonical source first (most authoritative).
    if (options.kind === "registry") {
        const sourcePath = resolveManagedSkillCanonicalDirectoryPath(
            options.settingsFilePath,
            options.skillName,
        );
        const description = await readSkillDescriptionFromSkillMd(sourcePath);

        if (description !== undefined) {
            return description;
        }
    }

    if (options.kind === "bundled" && isBundledSkillName(options.skillName)) {
        // Bundled has per-agent source path; try the first installed host's
        // canonical source.
        for (const host of options.hosts) {
            const sourcePath = resolveBundledSkillCanonicalDirectoryPath(
                options.settingsFilePath,
                options.skillName,
                host.agentId,
            );
            const description = await readSkillDescriptionFromSkillMd(sourcePath);

            if (description !== undefined) {
                return description;
            }
        }
    }

    // Fallback: read SKILL.md from the first installed host directory.
    for (const host of options.hosts) {
        const description = await readSkillDescriptionFromSkillMd(host.path);

        if (description !== undefined) {
            return description;
        }
    }

    return "";
}

async function readSkillDescriptionFromSkillMd(
    skillDirectoryPath: string,
): Promise<string | undefined> {
    let content: string;

    try {
        content = await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8");
    }
    catch {
        return undefined;
    }

    if (!hasFrontmatter(content)) {
        return undefined;
    }

    let parsed;

    try {
        parsed = parseSkillMarkdownMatter(content);
    }
    catch {
        return undefined;
    }

    if (!isSkillFrontmatterRecord(parsed.data)) {
        return undefined;
    }

    return toNonBlankString(parsed.data.description);
}

function computeSummary(entries: readonly SkillInventoryEntry[]): SkillInventorySummary {
    const summary: SkillInventorySummary = {
        bundledSkills: 0,
        registrySkills: 0,
        localSkills: 0,
    };

    for (const entry of entries) {
        switch (entry.kind) {
            case "bundled":
                summary.bundledSkills += 1;
                break;
            case "registry":
                summary.registrySkills += 1;
                break;
            case "local":
                summary.localSkills += 1;
                break;
        }
    }

    return summary;
}

function applyFilters(
    entries: readonly SkillInventoryEntry[],
    options: CollectSkillsInfoInventoryOptions,
): SkillInventoryEntry[] {
    const sourceFilter: SkillInventoryKind | "default" = options.source ?? "default";
    const agentFilter = options.agentName;
    const result: SkillInventoryEntry[] = [];

    for (const entry of entries) {
        if (sourceFilter === "default") {
            // Default view hides local skills (matches historical `oo skills list` behavior).
            if (entry.kind === "local") {
                continue;
            }
        }
        else if (entry.kind !== sourceFilter) {
            continue;
        }

        if (agentFilter === undefined) {
            result.push(entry);
            continue;
        }

        const filteredHosts = entry.hosts.filter(host => host.agentId === agentFilter);

        if (filteredHosts.length === 0) {
            continue;
        }

        result.push({
            ...entry,
            hosts: filteredHosts,
        });
    }

    return result;
}
