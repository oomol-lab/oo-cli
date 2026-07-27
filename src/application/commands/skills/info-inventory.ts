import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { BundledSkillAgentName, BundledSkillName } from "./embedded-assets.ts";
import type { SkillMetadata } from "./skill-metadata.ts";
import { createHash } from "node:crypto";
import { readdir, readFile, realpath } from "node:fs/promises";
import { join, relative } from "node:path";
import {
    directoryExists,
} from "./bundled-skill-observation.ts";
import {
    resolveBundledSkillCanonicalDirectoryPath,
} from "./bundled-skill-paths.ts";
import {
    availableBundledSkillNames,
} from "./embedded-assets.ts";
import {
    availableBundledSkillAgentNames,
    compareManagedSkillAgentNames,
    resolveManagedSkillAgentHomeDirectory,
} from "./managed-skill-agents.ts";
import {
    readManagedSkillListSource,
    readSkillsDirectoryEntries,
} from "./managed-skill-listings.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillsDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    isBundledSkillName,
} from "./shared.ts";
import { readSkillDirectoryState } from "./skill-directory-state.ts";
import {
    hasFrontmatter,
    isSkillFrontmatterRecord,
    parseSkillMarkdownMatter,
    toNonBlankString,
} from "./skill-frontmatter.ts";

export type SkillInventoryKind = "bundled" | "registry" | "local";

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

interface RawHostScan {
    agentId: BundledSkillAgentName;
    skillName: string;
    path: string;
    metadata: SkillMetadata | undefined;
    metadataPresent: boolean;
    metadataParseable: boolean;
}

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
    const installedHostScans = await scanInstalledHosts(context);
    const grouped = groupHostScansBySkillIdentity(installedHostScans);
    const builtEntries = await Promise.all(
        grouped.map(group =>
            buildSkillInventoryEntry(group, settingsFilePath, context.env),
        ),
    );

    return builtEntries
        .filter(entry => entry !== undefined)
        .sort(compareSkillInventoryEntries);
}

async function scanInstalledHosts(
    context: InventoryContext,
): Promise<RawHostScan[]> {
    const scans = await Promise.all(
        availableBundledSkillAgentNames.map(async (agentId) => {
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(
                context.env,
                agentId,
            );

            if (!(await directoryExists(homeDirectory))) {
                return [];
            }

            const skillsDirectory = resolveManagedSkillsDirectoryPath(homeDirectory);
            const skillNames = await readSkillsDirectoryEntries(skillsDirectory);

            return await Promise.all(
                skillNames.map(skillName =>
                    readHostScan(homeDirectory, agentId, skillName),
                ),
            );
        }),
    );

    return scans.flat();
}

async function readHostScan(
    homeDirectory: string,
    agentId: BundledSkillAgentName,
    skillName: string,
): Promise<RawHostScan> {
    const path = resolveManagedSkillDirectoryPath(homeDirectory, skillName);
    let metadataPresent = false;
    let metadataParseable = false;
    let metadata: SkillMetadata | undefined;

    try {
        const state = await readSkillDirectoryState(path);

        if (state.kind === "managed") {
            metadataPresent = true;
            metadataParseable = true;
            metadata = state.metadata;
        }
        else if (
            state.kind === "not-directory"
            || (state.kind === "unmanaged" && state.metadataFilePresent)
        ) {
            metadataPresent = true;
        }
    }
    catch {
        // IO error → "present but unreadable" so the host falls into the
        // `unknown` bucket instead of being read as non-managed.
        metadataPresent = true;
    }

    return {
        agentId,
        skillName,
        path,
        metadata,
        metadataPresent,
        metadataParseable,
    };
}

interface SkillIdentityGroup {
    identityKey: string;
    name: string;
    kind: SkillInventoryKind;
    packageName: string | null;
    hostScans: RawHostScan[];
}

function groupHostScansBySkillIdentity(
    scans: readonly RawHostScan[],
): SkillIdentityGroup[] {
    const managedGroups = new Map<string, SkillIdentityGroup>();
    // Shadow hosts (no metadata / unparseable metadata) are buffered and
    // attached in a second pass because their matching managed group may not
    // have been seen yet at scan time.
    const shadowCandidatesByName = new Map<string, RawHostScan[]>();

    for (const scan of scans) {
        if (scan.metadata !== undefined) {
            const identityKey = computeSkillIdentityKey(scan);
            const existing = managedGroups.get(identityKey);

            if (existing === undefined) {
                managedGroups.set(identityKey, {
                    identityKey,
                    name: scan.skillName,
                    kind: resolveKindFromMetadata(scan),
                    packageName: resolvePackageNameFromMetadata(scan),
                    hostScans: [scan],
                });
            }
            else {
                existing.hostScans.push(scan);
            }
            continue;
        }

        const existing = shadowCandidatesByName.get(scan.skillName) ?? [];

        existing.push(scan);
        shadowCandidatesByName.set(scan.skillName, existing);
    }

    // Shadow scans with no matching managed name are dropped to avoid noise.
    for (const [skillName, shadowScans] of shadowCandidatesByName) {
        const matched = findManagedGroupByName(managedGroups, skillName);

        if (matched !== undefined) {
            matched.hostScans.push(...shadowScans);
        }
    }

    return [...managedGroups.values()];
}

function findManagedGroupByName(
    managedGroups: Map<string, SkillIdentityGroup>,
    skillName: string,
): SkillIdentityGroup | undefined {
    for (const group of managedGroups.values()) {
        if (group.name === skillName) {
            return group;
        }
    }

    return undefined;
}

function computeSkillIdentityKey(scan: RawHostScan): string {
    const kind = resolveKindFromMetadata(scan);
    const packageName = resolvePackageNameFromMetadata(scan) ?? "";

    // Version is intentionally excluded so version-divergent installs of the
    // same skill collapse into one entry, with per-host versions in hosts[].
    return `${kind}\x00${scan.skillName}\x00${packageName}`;
}

function resolveKindFromMetadata(scan: RawHostScan): SkillInventoryKind {
    return readManagedSkillListSource({
        metadata: scan.metadata,
        name: scan.skillName,
    });
}

function resolvePackageNameFromMetadata(scan: RawHostScan): string | null {
    if (scan.metadata?.kind === "registry") {
        return scan.metadata.packageName;
    }

    return null;
}

async function buildSkillInventoryEntry(
    group: SkillIdentityGroup,
    settingsFilePath: string,
    env: Record<string, string | undefined>,
): Promise<SkillInventoryEntry | undefined> {
    const sourcePathLookup = resolveSourcePathLookup(group, settingsFilePath);
    const hosts = await Promise.all(
        group.hostScans.map(async (scan): Promise<SkillInventoryHostEntry> => {
            // Hosts without metadata shadow the managed skill name but are not
            // tied to its canonical source, so they surface sourcePath=null.
            const sourcePath = scan.metadataPresent
                ? sourcePathLookup(scan.agentId)
                : null;
            const controlState = await resolveHostControlState({
                scan,
                sourcePath,
                kind: group.kind,
            });

            return {
                agentId: scan.agentId,
                status: "installed",
                path: scan.path,
                sourcePath,
                version: readHostVersion(scan),
                controlState,
            };
        }),
    );

    if (hosts.length === 0) {
        return undefined;
    }

    hosts.sort(compareSkillInventoryHostEntries);

    const description = await readSkillDescription({
        kind: group.kind,
        skillName: group.name,
        settingsFilePath,
        env,
        hosts,
    });
    const topLevelVersion = pickTopLevelVersion(group.kind, hosts);

    return {
        id: group.name,
        name: group.name,
        kind: group.kind,
        packageName: group.packageName,
        version: topLevelVersion,
        description,
        hosts,
    };
}

function readHostVersion(scan: RawHostScan): string | null {
    const metadata = scan.metadata;

    if (metadata === undefined) {
        return null;
    }

    if (metadata.kind === "bundled" || metadata.kind === "registry") {
        return metadata.version;
    }

    return null;
}

function resolveSourcePathLookup(
    group: SkillIdentityGroup,
    settingsFilePath: string,
): (agentId: BundledSkillAgentName) => string | null {
    switch (group.kind) {
        case "bundled": {
            // Bundled skills have per-agent canonical source paths.
            if (!isBundledSkillName(group.name)) {
                return () => null;
            }

            const bundledName: BundledSkillName = group.name;

            return agentId => resolveBundledSkillCanonicalDirectoryPath(
                settingsFilePath,
                bundledName,
                agentId,
            );
        }
        case "registry": {
            const sharedSourcePath = resolveManagedSkillCanonicalDirectoryPath(
                settingsFilePath,
                group.name,
            );

            return () => sharedSourcePath;
        }
        case "local":
            // Local skills are their own source.
            return () => null;
    }
}

interface ResolveHostControlStateInput {
    scan: RawHostScan;
    sourcePath: string | null;
    kind: SkillInventoryKind;
}

export async function resolveHostControlState(
    input: ResolveHostControlStateInput,
): Promise<SkillHostControlState> {
    if (!input.scan.metadataPresent) {
        return "non-managed";
    }

    if (!input.scan.metadataParseable) {
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
            realpath(input.scan.path),
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
        input.scan.path,
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

function pickTopLevelVersion(
    kind: SkillInventoryKind,
    hosts: readonly SkillInventoryHostEntry[],
): string | null {
    if (kind === "local") {
        return null;
    }

    for (const host of hosts) {
        if (host.version !== null) {
            return host.version;
        }
    }

    return null;
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

const inventoryKindOrder: Record<SkillInventoryKind, number> = {
    bundled: 0,
    registry: 1,
    local: 2,
};

function compareSkillInventoryEntries(
    left: SkillInventoryEntry,
    right: SkillInventoryEntry,
): number {
    const kindDifference
        = inventoryKindOrder[left.kind] - inventoryKindOrder[right.kind];

    if (kindDifference !== 0) {
        return kindDifference;
    }

    if (left.kind === "bundled" && right.kind === "bundled") {
        const leftIndex = bundledSkillOrderIndex(left.name);
        const rightIndex = bundledSkillOrderIndex(right.name);

        if (leftIndex !== undefined && rightIndex !== undefined) {
            return leftIndex - rightIndex;
        }
    }

    return left.name.localeCompare(right.name);
}

function bundledSkillOrderIndex(name: string): number | undefined {
    if (!isBundledSkillName(name)) {
        return undefined;
    }

    return availableBundledSkillNames.indexOf(name);
}

function compareSkillInventoryHostEntries(
    left: SkillInventoryHostEntry,
    right: SkillInventoryHostEntry,
): number {
    return compareManagedSkillAgentNames(left.agentId, right.agentId);
}
