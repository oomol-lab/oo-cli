import type { SkillDirectoryState } from "./skill-directory-state.ts";

import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { resolveManagedSkillMetadataFilePath } from "./managed-skill-paths.ts";
import {
    isCurrentRegistryPublication,
    readSkillDirectoryState,
} from "./skill-directory-state.ts";
import {
    createBundledSkillMetadata,
    createLocalSkillMetadata,
    createRegistrySkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

let rootDirectoryPath: string;

beforeEach(async () => {
    rootDirectoryPath = join(
        tmpdir(),
        `oo-skill-directory-state-${Bun.randomUUIDv7()}`,
    );
    await mkdir(rootDirectoryPath, { recursive: true });
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
            process.platform === "win32" ? "junction" : "dir",
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

    test("classifies a directory without metadata as unmanaged", async () => {
        const skillDirectoryPath = join(rootDirectoryPath, "skill");

        await mkdir(skillDirectoryPath);

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
            title: "legacy metadata with a non-string version",
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
        {
            content: renderSkillMetadataJson({
                packageName: "@scope/package",
                version: "1.2.3",
            }),
            metadata: createRegistrySkillMetadata({
                packageName: "@scope/package",
                version: "1.2.3",
            }),
            title: "legacy untyped registry metadata",
        },
        {
            content: renderSkillMetadataJson({ version: "1.2.3" }),
            metadata: createBundledSkillMetadata("1.2.3"),
            title: "legacy untyped bundled metadata",
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
            process.platform === "win32" ? "junction" : "dir",
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
