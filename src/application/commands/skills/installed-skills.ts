import type { BundledSkillAgentName } from "./managed-skill-agents.ts";
import type { ManagedSkillHost } from "./managed-skill-hosts.ts";
import type { SkillMetadata } from "./skill-metadata.ts";
import { readFile } from "node:fs/promises";
import { compareSemver } from "../../semver.ts";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import { availableBundledSkillNames } from "./embedded-assets.ts";
import { compareManagedSkillAgentNames } from "./managed-skill-agents.ts";
import { resolveAvailableManagedSkillHosts } from "./managed-skill-hosts.ts";
import { readSkillsDirectoryEntries } from "./managed-skill-listings.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillCanonicalRootDirectoryPath,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
    resolveManagedSkillsDirectoryPath,
} from "./managed-skill-paths.ts";
import { isBundledSkillName } from "./shared.ts";
import { parseSkillMetadataContent } from "./skill-metadata.ts";

export type InstalledSkillKind = "bundled" | "registry" | "local";

// Per-copy management state: "managed" copies carry parseable metadata,
// "unmanaged" copies have no metadata file at all, and "unparseable" copies
// have a metadata file that cannot be read or parsed.
export type InstalledSkillCopyState = "managed" | "unmanaged" | "unparseable";

export interface InstalledSkillAgentCopy {
    agentName: BundledSkillAgentName;
    path: string;
    state: InstalledSkillCopyState;
    version?: string;
}

export interface InstalledSkillCanonicalCopy {
    path: string;
    version: string;
}

// One row per skill identity (kind + packageName + name), merged from the
// canonical registry root and every available host. `version` is the single
// installed-version answer: the highest parseable version among all copies,
// with ties kept from the canonical-then-agent-order copy seen first.
export interface InstalledSkill {
    agents: InstalledSkillAgentCopy[];
    canonical?: InstalledSkillCanonicalCopy;
    kind: InstalledSkillKind;
    name: string;
    packageName?: string;
    version?: string;
}

// Registry rows always carry a package identity and at least one versioned
// copy; narrowing through this predicate spares callers the per-field checks.
export interface InstalledRegistrySkill extends InstalledSkill {
    kind: "registry";
    packageName: string;
    version: string;
}

export function isInstalledRegistrySkill(
    skill: InstalledSkill,
): skill is InstalledRegistrySkill {
    return skill.kind === "registry"
        && skill.packageName !== undefined
        && skill.version !== undefined;
}

// Reads the full skill inventory: which skills oo knows about, where each
// copy lives, and at which version. A skill is installed when at least one
// copy has parseable metadata; metadata-less and unparseable copies attach to
// a same-name installed row instead of forming rows of their own. Rows come
// back in the documented inventory order — bundled skills in embedded order,
// then registry, then local, names sorted within each kind — with each row's
// agent copies in agent declaration order.
export async function readInstalledSkills(
    env: Record<string, string | undefined>,
    settingsFilePath: string,
): Promise<InstalledSkill[]> {
    const hosts = await resolveAvailableManagedSkillHosts(env);
    const [canonicalCopies, hostScans] = await Promise.all([
        scanCanonicalRegistryCopies(settingsFilePath),
        Promise.all(hosts.map(host => scanHostCopies(host))),
    ]);

    return mergeInstalledSkillCopies(canonicalCopies, hostScans.flat());
}

// Groups registry rows by their recorded package, preserving row order both
// across and within packages. Rows of other kinds carry no package identity
// and are skipped.
export function groupInstalledSkillsByPackageName(
    skills: readonly InstalledSkill[],
): Map<string, InstalledRegistrySkill[]> {
    const groups = new Map<string, InstalledRegistrySkill[]>();

    for (const skill of skills) {
        if (!isInstalledRegistrySkill(skill)) {
            continue;
        }

        const group = groups.get(skill.packageName) ?? [];

        group.push(skill);
        groups.set(skill.packageName, group);
    }

    return groups;
}

// Resolve the names of installed registry skills that belong to a package.
// Ownership is read from each skill's recorded package identity, so a
// same-name skill installed from a different package is never matched.
export function installedRegistrySkillNamesForPackage(
    skills: readonly InstalledSkill[],
    packageName: string,
): string[] {
    return (groupInstalledSkillsByPackageName(skills).get(packageName) ?? [])
        .map(skill => skill.name)
        .sort((left, right) => left.localeCompare(right));
}

interface CanonicalRegistryCopy {
    name: string;
    packageName: string;
    path: string;
    version: string;
}

interface HostCopyScan {
    agentName: BundledSkillAgentName;
    metadata?: SkillMetadata;
    name: string;
    path: string;
    state: InstalledSkillCopyState;
}

// The canonical registry root only ever stores registry skills, so copies
// whose metadata is missing, unparseable, or of another kind are ignored.
async function scanCanonicalRegistryCopies(
    settingsFilePath: string,
): Promise<CanonicalRegistryCopy[]> {
    const rootDirectoryPath
        = resolveManagedSkillCanonicalRootDirectoryPath(settingsFilePath);
    const entryNames = await readSkillsDirectoryEntries(rootDirectoryPath);
    const copies = await Promise.all(entryNames.map(async (entryName) => {
        const skillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            settingsFilePath,
            entryName,
        );
        const { metadata } = await readCopyMetadata(skillDirectoryPath);

        if (metadata?.kind !== "registry") {
            return undefined;
        }

        return {
            name: entryName,
            packageName: metadata.packageName,
            path: skillDirectoryPath,
            version: metadata.version,
        } satisfies CanonicalRegistryCopy;
    }));

    return copies.filter(copy => copy !== undefined);
}

async function scanHostCopies(host: ManagedSkillHost): Promise<HostCopyScan[]> {
    const skillsDirectoryPath = resolveManagedSkillsDirectoryPath(host.homeDirectory);
    const entryNames = await readSkillsDirectoryEntries(skillsDirectoryPath);

    return await Promise.all(entryNames.map(async (entryName) => {
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            host.homeDirectory,
            entryName,
        );
        const { metadata, state } = await readCopyMetadata(skillDirectoryPath);

        return {
            agentName: host.agentName,
            metadata,
            name: entryName,
            path: skillDirectoryPath,
            state,
        } satisfies HostCopyScan;
    }));
}

// Copy-level metadata read. Deliberately tolerant: an inventory read reports
// each copy's state instead of failing the whole scan on one broken copy, so
// IO errors beyond a missing file surface as "unparseable".
async function readCopyMetadata(skillDirectoryPath: string): Promise<{
    metadata?: SkillMetadata;
    state: InstalledSkillCopyState;
}> {
    let content: string;

    try {
        content = await readFile(
            resolveManagedSkillMetadataFilePath(skillDirectoryPath),
            "utf8",
        );
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return { state: "unmanaged" };
        }

        return { state: "unparseable" };
    }

    const metadata = parseSkillMetadataContent(content);

    if (metadata === undefined) {
        return { state: "unparseable" };
    }

    return { metadata, state: "managed" };
}

function mergeInstalledSkillCopies(
    canonicalCopies: readonly CanonicalRegistryCopy[],
    hostCopies: readonly HostCopyScan[],
): InstalledSkill[] {
    const rowsByIdentity = new Map<string, InstalledSkill>();
    const unattachedCopiesByName = new Map<string, InstalledSkillAgentCopy[]>();

    for (const copy of hostCopies) {
        if (copy.metadata === undefined) {
            const unattached = unattachedCopiesByName.get(copy.name) ?? [];

            unattached.push({
                agentName: copy.agentName,
                path: copy.path,
                state: copy.state,
            });
            unattachedCopiesByName.set(copy.name, unattached);
            continue;
        }

        const identityKey = computeIdentityKey(
            copy.metadata.kind,
            copy.name,
            readMetadataPackageName(copy.metadata),
        );
        const row = rowsByIdentity.get(identityKey)
            ?? createRow(copy.name, copy.metadata);
        const version = readMetadataVersion(copy.metadata);

        rowsByIdentity.set(identityKey, row);
        row.agents.push({
            agentName: copy.agentName,
            path: copy.path,
            state: "managed",
            ...version === undefined ? {} : { version },
        });
    }

    for (const copy of canonicalCopies) {
        const identityKey = computeIdentityKey("registry", copy.name, copy.packageName);
        const row = rowsByIdentity.get(identityKey) ?? {
            agents: [],
            kind: "registry",
            name: copy.name,
            packageName: copy.packageName,
        } satisfies InstalledSkill;

        rowsByIdentity.set(identityKey, row);
        row.canonical = {
            path: copy.path,
            version: copy.version,
        };
    }

    attachUnmanagedCopies(rowsByIdentity, unattachedCopiesByName);

    const rows = Array.from(rowsByIdentity.values());

    for (const row of rows) {
        row.agents.sort(compareInstalledSkillAgentCopies);

        const version = pickInstalledVersion(row);

        if (version !== undefined) {
            row.version = version;
        }
    }

    return rows.sort(compareInstalledSkills);
}

function createRow(name: string, metadata: SkillMetadata): InstalledSkill {
    const packageName = readMetadataPackageName(metadata);

    return {
        agents: [],
        kind: metadata.kind,
        name,
        ...packageName === undefined ? {} : { packageName },
    };
}

// Copies without an identity of their own (no metadata, or metadata that does
// not parse) shadow an installed skill by name: they attach to the first row
// with a managed host copy of that name, and are dropped otherwise.
function attachUnmanagedCopies(
    rowsByIdentity: Map<string, InstalledSkill>,
    unattachedCopiesByName: Map<string, InstalledSkillAgentCopy[]>,
): void {
    for (const [name, copies] of unattachedCopiesByName) {
        for (const row of rowsByIdentity.values()) {
            if (row.name === name && row.agents.length > 0) {
                row.agents.push(...copies);
                break;
            }
        }
    }
}

function computeIdentityKey(
    kind: InstalledSkillKind,
    name: string,
    packageName: string | undefined,
): string {
    return `${kind}\x00${name}\x00${packageName ?? ""}`;
}

function readMetadataPackageName(metadata: SkillMetadata): string | undefined {
    return metadata.kind === "registry" ? metadata.packageName : undefined;
}

function readMetadataVersion(metadata: SkillMetadata): string | undefined {
    return metadata.kind === "local" ? undefined : metadata.version;
}

// The one installed-version answer: highest by semver across the canonical
// copy and every managed host copy; incomparable or tied versions keep the
// copy seen first in canonical-then-agent order.
function pickInstalledVersion(row: InstalledSkill): string | undefined {
    let winner: string | undefined;
    const candidates = [
        row.canonical?.version,
        ...row.agents.map(copy => copy.version),
    ];

    for (const candidate of candidates) {
        if (candidate === undefined) {
            continue;
        }

        if (winner === undefined || compareSemver(candidate, winner) > 0) {
            winner = candidate;
        }
    }

    return winner;
}

const installedSkillKindOrder: Record<InstalledSkillKind, number> = {
    bundled: 0,
    registry: 1,
    local: 2,
};

function compareInstalledSkills(
    left: InstalledSkill,
    right: InstalledSkill,
): number {
    const kindDifference
        = installedSkillKindOrder[left.kind] - installedSkillKindOrder[right.kind];

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

function compareInstalledSkillAgentCopies(
    left: InstalledSkillAgentCopy,
    right: InstalledSkillAgentCopy,
): number {
    return compareManagedSkillAgentNames(left.agentName, right.agentName);
}
