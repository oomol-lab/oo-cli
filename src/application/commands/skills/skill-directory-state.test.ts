import type { SkillDirectoryState } from "./skill-directory-state.ts";

import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../../__tests__/helpers.ts";
import { resolveManagedSkillMetadataFilePath } from "./managed-skill-paths.ts";
import {
    isBundledSkillDirectoryWritable,
    isCurrentRegistryPublication,
    isSkillDirectoryAbsent,
    readSkillDirectoryState,
} from "./skill-directory-state.ts";
import {
    createBundledSkillMetadata,
    createLocalSkillMetadata,
    createRegistrySkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

const symlinkType = process.platform === "win32" ? "junction" : "dir";

let rootDirectoryPath: string;

beforeEach(async () => {
    rootDirectoryPath = await createTemporaryDirectory("oo-skill-directory-state");
});

afterEach(async () => {
    await rm(rootDirectoryPath, { force: true, recursive: true });
});

describe("readSkillDirectoryState", () => {
    test("classifies a missing path as missing", async () => {
        await expect(
            readSkillDirectoryState(join(rootDirectoryPath, "absent")),
        ).resolves.toEqual({ kind: "missing" });
    });

    test("classifies a broken symlink as missing", async () => {
        const skillDirectoryPath = join(rootDirectoryPath, "skill");

        await symlink(
            join(rootDirectoryPath, "absent-target"),
            skillDirectoryPath,
            symlinkType,
        );

        await expect(
            readSkillDirectoryState(skillDirectoryPath),
        ).resolves.toEqual({ kind: "missing" });
    });

    test("classifies a path under a regular file as missing", async () => {
        const filePath = join(rootDirectoryPath, "occupied");

        await writeFile(filePath, "not a directory");

        await expect(
            readSkillDirectoryState(join(filePath, "skill")),
        ).resolves.toEqual({ kind: "missing" });
    });

    test("classifies a regular file as not-directory", async () => {
        const skillDirectoryPath = join(rootDirectoryPath, "skill");

        await writeFile(skillDirectoryPath, "not a directory");

        await expect(
            readSkillDirectoryState(skillDirectoryPath),
        ).resolves.toEqual({ kind: "not-directory" });
    });

    test("classifies an empty directory as empty", async () => {
        const skillDirectoryPath = join(rootDirectoryPath, "skill");

        await mkdir(skillDirectoryPath);

        await expect(
            readSkillDirectoryState(skillDirectoryPath),
        ).resolves.toEqual({ kind: "empty" });
    });

    test("classifies a directory without metadata as unmanaged", async () => {
        const skillDirectoryPath = join(rootDirectoryPath, "skill");

        await mkdir(skillDirectoryPath);
        await writeFile(join(skillDirectoryPath, "SKILL.md"), "# skill\n");

        await expect(
            readSkillDirectoryState(skillDirectoryPath),
        ).resolves.toEqual({ kind: "unmanaged", metadataFilePresent: false });
    });

    const unparseableMetadataCases = [
        { content: "not json", title: "non-JSON content" },
        { content: "[]", title: "a JSON array" },
        { content: "null", title: "JSON null" },
        {
            content: renderSkillMetadataJson({ schemaVersion: 1, kind: "registry" }),
            title: "registry metadata without packageName and version",
        },
        {
            content: renderSkillMetadataJson({ version: 1 }),
            title: "untyped metadata with a non-string version",
        },
        {
            content: renderSkillMetadataJson({
                packageName: "@scope/package",
                version: "1.2.3",
            }),
            title: "legacy untyped registry metadata",
        },
        {
            content: renderSkillMetadataJson({ version: "1.2.3" }),
            title: "legacy untyped bundled metadata",
        },
    ] as const;

    for (const { content, title } of unparseableMetadataCases) {
        test(`classifies ${title} as unmanaged with a present metadata file`, async () => {
            const skillDirectoryPath = await writeSkillDirectory(content);

            await expect(
                readSkillDirectoryState(skillDirectoryPath),
            ).resolves.toEqual({ kind: "unmanaged", metadataFilePresent: true });
        });
    }

    const managedMetadataCases = [
        {
            content: renderSkillMetadataJson(
                createRegistrySkillMetadata({
                    packageName: "@scope/package",
                    version: "1.2.3",
                }),
            ),
            metadata: createRegistrySkillMetadata({
                packageName: "@scope/package",
                version: "1.2.3",
            }),
            title: "registry metadata",
        },
        {
            content: renderSkillMetadataJson(createBundledSkillMetadata("1.2.3")),
            metadata: createBundledSkillMetadata("1.2.3"),
            title: "bundled metadata",
        },
        {
            content: renderSkillMetadataJson(createLocalSkillMetadata()),
            metadata: createLocalSkillMetadata(),
            title: "local metadata",
        },
    ] as const;

    for (const { content, metadata, title } of managedMetadataCases) {
        test(`classifies ${title} as managed with a current publication`, async () => {
            const skillDirectoryPath = await writeSkillDirectory(content);

            await expect(
                readSkillDirectoryState(skillDirectoryPath),
            ).resolves.toEqual({
                kind: "managed",
                metadata,
                publicationCurrent: true,
            });
        });
    }

    test("reports a symlinked managed directory as a stale publication", async () => {
        const canonicalSkillDirectoryPath = await writeSkillDirectory(
            renderSkillMetadataJson(createBundledSkillMetadata("1.2.3")),
        );
        const installedSkillDirectoryPath = join(rootDirectoryPath, "installed");

        await symlink(
            canonicalSkillDirectoryPath,
            installedSkillDirectoryPath,
            symlinkType,
        );

        await expect(
            readSkillDirectoryState(installedSkillDirectoryPath),
        ).resolves.toEqual({
            kind: "managed",
            metadata: createBundledSkillMetadata("1.2.3"),
            publicationCurrent: false,
        });
    });

    test("throws when the metadata file cannot be read", async () => {
        const skillDirectoryPath = join(rootDirectoryPath, "skill");

        // A directory occupying the metadata file path makes readFile fail
        // with EISDIR, the deterministic stand-in for non-ENOENT IO errors.
        await mkdir(resolveManagedSkillMetadataFilePath(skillDirectoryPath), {
            recursive: true,
        });

        await expect(
            readSkillDirectoryState(skillDirectoryPath),
        ).rejects.toThrow();
    });
});

describe("isCurrentRegistryPublication", () => {
    const expected = { packageName: "@scope/package", version: "1.2.3" };
    const currentState = {
        kind: "managed",
        metadata: createRegistrySkillMetadata(expected),
        publicationCurrent: true,
    } satisfies SkillDirectoryState;

    test("accepts a current managed registry state", () => {
        expect(isCurrentRegistryPublication(currentState, expected)).toBeTrue();
    });

    const rejectedCases = [
        { state: { kind: "missing" }, title: "a missing state" },
        { state: { kind: "not-directory" }, title: "a not-directory state" },
        { state: { kind: "empty" }, title: "an empty state" },
        {
            state: { kind: "unmanaged", metadataFilePresent: true },
            title: "an unmanaged state",
        },
        {
            state: {
                kind: "managed",
                metadata: createBundledSkillMetadata("1.2.3"),
                publicationCurrent: true,
            },
            title: "a managed bundled state",
        },
        {
            state: {
                kind: "managed",
                metadata: createLocalSkillMetadata(),
                publicationCurrent: true,
            },
            title: "a managed local state",
        },
        {
            state: {
                ...currentState,
                metadata: createRegistrySkillMetadata({
                    packageName: "@scope/other-package",
                    version: "1.2.3",
                }),
            },
            title: "a package name mismatch",
        },
        {
            state: {
                ...currentState,
                metadata: createRegistrySkillMetadata({
                    packageName: "@scope/package",
                    version: "2.0.0",
                }),
            },
            title: "a version mismatch",
        },
        {
            state: { ...currentState, publicationCurrent: false },
            title: "a stale publication",
        },
    ] satisfies readonly { state: SkillDirectoryState; title: string }[];

    for (const { state, title } of rejectedCases) {
        test(`rejects ${title}`, () => {
            expect(isCurrentRegistryPublication(state, expected)).toBeFalse();
        });
    }
});

describe("isSkillDirectoryAbsent", () => {
    const absentCases = [
        { state: { kind: "missing" }, title: "a missing state" },
        { state: { kind: "not-directory" }, title: "a not-directory state" },
        { state: { kind: "empty" }, title: "an empty state" },
    ] satisfies readonly { state: SkillDirectoryState; title: string }[];

    const presentCases = [
        {
            state: { kind: "unmanaged", metadataFilePresent: false },
            title: "an unmanaged state",
        },
        {
            state: {
                kind: "managed",
                metadata: createBundledSkillMetadata("1.2.3"),
                publicationCurrent: true,
            },
            title: "a managed state",
        },
    ] satisfies readonly { state: SkillDirectoryState; title: string }[];

    for (const { state, title } of absentCases) {
        test(`reports ${title} as absent`, () => {
            expect(isSkillDirectoryAbsent(state)).toBeTrue();
        });
    }

    for (const { state, title } of presentCases) {
        test(`reports ${title} as present`, () => {
            expect(isSkillDirectoryAbsent(state)).toBeFalse();
        });
    }
});

describe("isBundledSkillDirectoryWritable", () => {
    // These answers do not depend on reclaimNonDirectory, so each is asserted
    // under both callers' policies.
    const writableCases = [
        { state: { kind: "missing" }, title: "a missing state" },
        { state: { kind: "empty" }, title: "an empty state" },
        {
            state: {
                kind: "managed",
                metadata: createBundledSkillMetadata("1.2.3"),
                publicationCurrent: true,
            },
            title: "oo's own bundled metadata",
        },
        {
            state: {
                kind: "managed",
                metadata: createBundledSkillMetadata("1.2.3"),
                publicationCurrent: false,
            },
            title: "a stale bundled publication",
        },
    ] satisfies readonly { state: SkillDirectoryState; title: string }[];

    const blockedCases = [
        {
            state: { kind: "unmanaged", metadataFilePresent: false },
            title: "an unmanaged state without a metadata file",
        },
        {
            state: { kind: "unmanaged", metadataFilePresent: true },
            title: "an unmanaged state with an unparseable metadata file",
        },
        {
            state: {
                kind: "managed",
                metadata: createRegistrySkillMetadata({
                    packageName: "@scope/package",
                    version: "1.2.3",
                }),
                publicationCurrent: true,
            },
            title: "a registry skill",
        },
        {
            state: {
                kind: "managed",
                metadata: createLocalSkillMetadata(),
                publicationCurrent: true,
            },
            title: "a local skill",
        },
    ] satisfies readonly { state: SkillDirectoryState; title: string }[];

    for (const { state, title } of writableCases) {
        test(`treats ${title} as writable`, () => {
            expect(isBundledSkillDirectoryWritable(state, {
                reclaimNonDirectory: true,
            })).toBeTrue();
            expect(isBundledSkillDirectoryWritable(state, {
                reclaimNonDirectory: false,
            })).toBeTrue();
        });
    }

    for (const { state, title } of blockedCases) {
        test(`refuses ${title}`, () => {
            expect(isBundledSkillDirectoryWritable(state, {
                reclaimNonDirectory: true,
            })).toBeFalse();
            expect(isBundledSkillDirectoryWritable(state, {
                reclaimNonDirectory: false,
            })).toBeFalse();
        });
    }

    test("reclaims a not-directory state when the caller allows it", () => {
        expect(isBundledSkillDirectoryWritable({ kind: "not-directory" }, {
            reclaimNonDirectory: true,
        })).toBeTrue();
    });

    test("refuses a not-directory state when the caller forbids it", () => {
        expect(isBundledSkillDirectoryWritable({ kind: "not-directory" }, {
            reclaimNonDirectory: false,
        })).toBeFalse();
    });
});

async function writeSkillDirectory(metadataContent: string): Promise<string> {
    const skillDirectoryPath = join(
        rootDirectoryPath,
        `skill-${Bun.randomUUIDv7()}`,
    );

    await mkdir(skillDirectoryPath);
    await writeFile(
        resolveManagedSkillMetadataFilePath(skillDirectoryPath),
        metadataContent,
    );

    return skillDirectoryPath;
}
