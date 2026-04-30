import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../../__tests__/helpers.ts";
import {
    listLocalSkillInstallations,
    listManagedSkillInstallations,
} from "./list.ts";
import { renderSkillMetadataJson } from "./skill-metadata.ts";

describe("skills list command helpers", () => {
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
                renderSkillMetadataJson({
                    packageName: "@oomol/zebra",
                    version: "2.0.0",
                }),
            );
            await Bun.write(
                join(alphaSkillDirectoryPath, ".oo-metadata.json"),
                "{\n",
            );
            await Bun.write(
                join(ooSkillDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson({
                    version: "9.9.9",
                }),
            );
            await Bun.write(
                join(ooFindSkillsDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson({
                    version: "9.9.9",
                }),
            );

            await expect(
                listManagedSkillInstallations(skillsDirectoryPath),
            ).resolves.toEqual([
                {
                    metadata: {
                        packageName: undefined,
                        version: "9.9.9",
                    },
                    name: "oo",
                    path: ooSkillDirectoryPath,
                },
                {
                    metadata: {
                        packageName: undefined,
                        version: "9.9.9",
                    },
                    name: "oo-find-skills",
                    path: ooFindSkillsDirectoryPath,
                },
                {
                    metadata: undefined,
                    name: "alpha-skill",
                    path: alphaSkillDirectoryPath,
                },
                {
                    metadata: {
                        packageName: "@oomol/zebra",
                        version: "2.0.0",
                    },
                    name: "zebra-skill",
                    path: zebraSkillDirectoryPath,
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
                renderSkillMetadataJson({
                    packageName: "@oomol/alpha",
                    version: "1.0.0",
                }),
            );
            await Bun.write(
                join(ooFindSkillsDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson({
                    packageName: "@oomol/find-skills",
                    version: "1.0.0",
                }),
            );

            await expect(
                listManagedSkillInstallations(skillsDirectoryPath),
            ).resolves.toEqual([
                {
                    metadata: {
                        packageName: "@oomol/alpha",
                        version: "1.0.0",
                    },
                    name: "alpha-skill",
                    path: alphaSkillDirectoryPath,
                },
                {
                    metadata: {
                        packageName: "@oomol/find-skills",
                        version: "1.0.0",
                    },
                    name: "oo-find-skills",
                    path: ooFindSkillsDirectoryPath,
                },
            ]);
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("lists valid local canonical skills by name", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-local-skills-list");
        const localSkillsDirectoryPath = join(rootDirectory, "skills", "local");
        const alphaSkillDirectoryPath = join(localSkillsDirectoryPath, "alpha-skill");
        const betaSkillDirectoryPath = join(localSkillsDirectoryPath, "beta-skill");
        const mismatchSkillDirectoryPath = join(
            localSkillsDirectoryPath,
            "mismatch-skill",
        );
        const missingSkillDirectoryPath = join(localSkillsDirectoryPath, "missing-skill");

        try {
            await mkdir(alphaSkillDirectoryPath, { recursive: true });
            await mkdir(betaSkillDirectoryPath, { recursive: true });
            await mkdir(mismatchSkillDirectoryPath, { recursive: true });
            await mkdir(missingSkillDirectoryPath, { recursive: true });

            await writeSkillFile(
                alphaSkillDirectoryPath,
                [
                    "---",
                    "name: alpha-skill",
                    "description: Use an alpha workflow.",
                    "---",
                    "",
                ].join("\n"),
            );
            await writeSkillFile(
                betaSkillDirectoryPath,
                [
                    "---",
                    "name: beta-skill",
                    "description: Use a beta workflow.",
                    "metadata:",
                    "  icon: ':lucide:wrench:'",
                    "  packageName: '@alice/beta-skill'",
                    "  version: '1.2.3'",
                    "---",
                    "",
                ].join("\n"),
            );
            await writeSkillFile(
                mismatchSkillDirectoryPath,
                [
                    "---",
                    "name: other-skill",
                    "description: Use another workflow.",
                    "---",
                    "",
                ].join("\n"),
            );

            await expect(
                listLocalSkillInstallations(localSkillsDirectoryPath),
            ).resolves.toEqual([
                {
                    metadata: undefined,
                    name: "alpha-skill",
                    path: alphaSkillDirectoryPath,
                },
                {
                    metadata: {
                        icon: ":lucide:wrench:",
                        packageName: "@alice/beta-skill",
                        version: "1.2.3",
                    },
                    name: "beta-skill",
                    path: betaSkillDirectoryPath,
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

async function writeSkillFile(
    skillDirectoryPath: string,
    content: string,
): Promise<void> {
    await Bun.write(join(skillDirectoryPath, "SKILL.md"), content);
}
