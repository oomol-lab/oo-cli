import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../../__tests__/helpers.ts";
import {
    writeLocalSkillMetadata,
} from "./local-skill-ownership.ts";
import { resolveManagedSkillMetadataFilePath } from "./managed-skill-paths.ts";
import {
    createRegistrySkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

describe("local skill ownership", () => {
    test("does not overwrite registry metadata when writing local metadata", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-local-skill-ownership");
        const skillDirectoryPath = join(rootDirectory, "registry-owned");
        const metadataFilePath = resolveManagedSkillMetadataFilePath(skillDirectoryPath);
        const metadataContent = renderSkillMetadataJson(createRegistrySkillMetadata({
            packageName: "@alice/registry-owned",
            version: "1.0.0",
        }));

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(metadataFilePath, metadataContent);

            await expect(writeLocalSkillMetadata(skillDirectoryPath)).rejects.toMatchObject({
                key: "errors.skills.nameConflict",
                params: {
                    name: "registry-owned",
                    path: skillDirectoryPath,
                },
            });
            expect(await readFile(metadataFilePath, "utf8")).toBe(metadataContent);
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("does not overwrite unparseable metadata when writing local metadata", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-local-skill-ownership");
        const skillDirectoryPath = join(rootDirectory, "invalid-owned");
        const metadataFilePath = resolveManagedSkillMetadataFilePath(skillDirectoryPath);

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(metadataFilePath, "{\n");

            await expect(writeLocalSkillMetadata(skillDirectoryPath)).rejects.toMatchObject({
                key: "errors.skills.nameConflict",
                params: {
                    name: "invalid-owned",
                    path: skillDirectoryPath,
                },
            });
            expect(await readFile(metadataFilePath, "utf8")).toBe("{\n");
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });
});
