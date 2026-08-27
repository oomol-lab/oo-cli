import type { SkillMetadata } from "./skill-metadata.ts";

import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { isPathMissingError } from "../../shared/fs-errors.ts";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import { resolveManagedSkillMetadataFilePath } from "./managed-skill-paths.ts";
import { parseSkillMetadataContent } from "./skill-metadata.ts";

// The one answer to "what is at this skill directory path". Applies to both
// host installations and canonical storage directories:
//
// - "missing":       nothing exists at the path (broken symlinks included).
// - "not-directory": the path exists but is not a directory; oo must not
//                    manage or overwrite it.
// - "empty":         a directory holding no entries at all. It carries nothing
//                    oo could destroy, so it counts as absent rather than as
//                    somebody else's skill: an install interrupted between
//                    creating the target directory and writing its files must
//                    not leave a target that only `--force` can reclaim.
// - "unmanaged":     a non-empty directory without parseable oo metadata.
//                    metadataFilePresent distinguishes "no .oo-metadata.json"
//                    from "present but unparseable".
// - "managed":       a directory carrying parseable oo metadata; match on
//                    metadata.kind for bundled/registry/local specifics.
//                    publicationCurrent is false when the path itself is a
//                    symlink (a stale legacy publication that needs repair).
//
// IO errors other than ENOENT (and ENOENT/ENOTDIR for the initial stat) are
// thrown, not classified: callers keep their command-level error handling.
export type SkillDirectoryState
    = | { kind: "missing" }
        | { kind: "not-directory" }
        | { kind: "empty" }
        | { kind: "unmanaged"; metadataFilePresent: boolean }
        | { kind: "managed"; metadata: SkillMetadata; publicationCurrent: boolean };

export async function readSkillDirectoryState(
    skillDirectoryPath: string,
): Promise<SkillDirectoryState> {
    let isDirectory: boolean;

    try {
        isDirectory = (await stat(skillDirectoryPath)).isDirectory();
    }
    catch (error) {
        if (isPathMissingError(error)) {
            return { kind: "missing" };
        }

        throw error;
    }

    if (!isDirectory) {
        return { kind: "not-directory" };
    }

    let metadataContent: string;

    try {
        metadataContent = await readFile(
            resolveManagedSkillMetadataFilePath(skillDirectoryPath),
            "utf8",
        );
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return await readSkillDirectoryStateWithoutMetadata(skillDirectoryPath);
        }

        throw error;
    }

    const metadata = parseSkillMetadataContent(metadataContent);

    if (metadata === undefined) {
        return { kind: "unmanaged", metadataFilePresent: true };
    }

    return {
        kind: "managed",
        metadata,
        publicationCurrent: await isCurrentPublicationPath(skillDirectoryPath),
    };
}

async function readSkillDirectoryStateWithoutMetadata(
    skillDirectoryPath: string,
): Promise<SkillDirectoryState> {
    let entries: string[];

    try {
        entries = await readdir(skillDirectoryPath);
    }
    catch (error) {
        if (isPathMissingError(error)) {
            // The directory disappeared while it was being classified.
            return { kind: "missing" };
        }

        throw error;
    }

    return entries.length === 0
        ? { kind: "empty" }
        : { kind: "unmanaged", metadataFilePresent: false };
}

async function isCurrentPublicationPath(
    skillDirectoryPath: string,
): Promise<boolean> {
    try {
        return !(await lstat(skillDirectoryPath)).isSymbolicLink();
    }
    catch (error) {
        // The directory can disappear between the metadata read and this
        // lstat; report the publication as stale rather than failing.
        if (isNodeNotFoundError(error)) {
            return false;
        }

        throw error;
    }
}

// True when the path holds no skill oo has to account for — nothing exists
// there, a non-directory occupies it, or the directory is empty. The
// classification-side equivalent of the old `!directoryExists(path)` guards.
export function isSkillDirectoryAbsent(state: SkillDirectoryState): boolean {
    return state.kind === "missing"
        || state.kind === "not-directory"
        || state.kind === "empty";
}

// True when a bundled skill publication may overwrite whatever is at the path:
// nothing is there, the directory is empty (it holds nothing oo could
// destroy), or oo's own bundled metadata is there - including a stale
// symlinked publication, which is oo's to replace. Anything else belongs to
// somebody else: a non-empty directory without parseable oo metadata, or a
// registry or local skill.
//
// `reclaimNonDirectory` is the one policy the callers disagree on, and they
// always have. An explicit publication - `oo skills install`,
// `oo skills auto-trigger` - deletes a regular file occupying the path and
// installs over it. Startup synchronization never does: it runs unasked on
// every invocation, so it must not delete a file the user never pointed it at.
export function isBundledSkillDirectoryWritable(
    state: SkillDirectoryState,
    options: { reclaimNonDirectory: boolean },
): boolean {
    if (state.kind === "not-directory") {
        return options.reclaimNonDirectory;
    }

    return state.kind === "missing"
        || state.kind === "empty"
        || (state.kind === "managed" && state.metadata.kind === "bundled");
}

export function managedMetadataOfKind<Kind extends SkillMetadata["kind"]>(
    state: SkillDirectoryState,
    kind: Kind,
): Extract<SkillMetadata, { kind: Kind }> | undefined {
    if (state.kind !== "managed" || state.metadata.kind !== kind) {
        return undefined;
    }

    return state.metadata as Extract<SkillMetadata, { kind: Kind }>;
}

export function isCurrentRegistryPublication(
    state: SkillDirectoryState,
    expected: { packageName: string; version: string },
): boolean {
    return state.kind === "managed"
        && state.metadata.kind === "registry"
        && state.metadata.packageName === expected.packageName
        && state.metadata.version === expected.version
        && state.publicationCurrent;
}
