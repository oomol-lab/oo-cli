import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../../__tests__/helpers.ts";
import { listManagedSkillInstallations } from "./managed-skill-listings.ts";
import {
    createBundledSkillMetadata,
    createRegistrySkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

describe("managed skill listings", () => {
    test("lists bundled skills before the remaining sorted names", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-skills-list");
        const skillsDirectoryPath = join(rootDirectory, "skills");
        const unmanagedSkillDirectoryPath = join(skillsDirectoryPath, "custom-skill");
        const zebraSkillDirectoryPath = join(skillsDirectoryPath, "zebra-skill");
        const alphaSkillDirectoryPath = join(skillsDirectoryPath, "alpha-skill");
        const ooSkillDirectoryPath = join(skillsDirectoryPath, "oo");
        const ooFindSkillsDirectoryPath = join(skillsDirectoryPath, "oo-find-skills");

        try {
            await mkdir(unmanagedSkillDirectoryPath, { recursive: true });
            await mkdir(zebraSkillDirectoryPath, { recursive: true });
            await mkdir(alphaSkillDirectoryPath, { recursive: true });
            await mkdir(ooSkillDirectoryPath, { recursive: true });
            await mkdir(ooFindSkillsDirectoryPath, { recursive: true });

            await Bun.write(
                join(zebraSkillDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson(createRegistrySkillMetadata({
                    packageName: "@oomol/zebra",
                    version: "2.0.0",
                })),
            );
            await Bun.write(
                join(alphaSkillDirectoryPath, ".oo-metadata.json"),
                "{\n",
            );
            await Bun.write(
                join(ooSkillDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson(createBundledSkillMetadata("9.9.9")),
            );
            await Bun.write(
                join(ooFindSkillsDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson(createBundledSkillMetadata("9.9.9")),
            );

            await expect(
                listManagedSkillInstallations(skillsDirectoryPath),
            ).resolves.toEqual([
                {
                    metadata: {
                        kind: "bundled",
                        schemaVersion: 1,
                        version: "9.9.9",
                    },
                    name: "oo",
                    path: ooSkillDirectoryPath,
                    source: "bundled",
                },
                {
                    metadata: {
                        kind: "bundled",
                        schemaVersion: 1,
                        version: "9.9.9",
                    },
                    name: "oo-find-skills",
                    path: ooFindSkillsDirectoryPath,
                    source: "bundled",
                },
                {
                    metadata: undefined,
                    name: "alpha-skill",
                    path: alphaSkillDirectoryPath,
                    source: "registry",
                },
                {
                    metadata: {
                        kind: "registry",
                        packageName: "@oomol/zebra",
                        schemaVersion: 1,
                        version: "2.0.0",
                    },
                    name: "zebra-skill",
                    path: zebraSkillDirectoryPath,
                    source: "registry",
                },
            ]);
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("does not prioritize package skills that share a bundled skill name", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-skills-list");
        const skillsDirectoryPath = join(rootDirectory, "skills");
        const alphaSkillDirectoryPath = join(skillsDirectoryPath, "alpha-skill");
        const ooFindSkillsDirectoryPath = join(skillsDirectoryPath, "oo-find-skills");

        try {
            await mkdir(alphaSkillDirectoryPath, { recursive: true });
            await mkdir(ooFindSkillsDirectoryPath, { recursive: true });

            await Bun.write(
                join(alphaSkillDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson(createRegistrySkillMetadata({
                    packageName: "@oomol/alpha",
                    version: "1.0.0",
                })),
            );
            await Bun.write(
                join(ooFindSkillsDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson(createRegistrySkillMetadata({
                    packageName: "@oomol/find-skills",
                    version: "1.0.0",
                })),
            );

            await expect(
                listManagedSkillInstallations(skillsDirectoryPath),
            ).resolves.toEqual([
                {
                    metadata: {
                        kind: "registry",
                        packageName: "@oomol/alpha",
                        schemaVersion: 1,
                        version: "1.0.0",
                    },
                    name: "alpha-skill",
                    path: alphaSkillDirectoryPath,
                    source: "registry",
                },
                {
                    metadata: {
                        kind: "registry",
                        packageName: "@oomol/find-skills",
                        schemaVersion: 1,
                        version: "1.0.0",
                    },
                    name: "oo-find-skills",
                    path: ooFindSkillsDirectoryPath,
                    source: "registry",
                },
            ]);
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("returns an empty list when the skills directory is missing", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-skills-list");

        try {
            await expect(
                listManagedSkillInstallations(join(rootDirectory, "skills")),
            ).resolves.toEqual([]);
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });
});
