import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../../__tests__/helpers.ts";
import {
    directoryExists,
    fileExists,
    writeInstalledBundledSkillMetadata,
} from "./bundled-skill-observation.ts";
import {
    readManagedSkillAgent,
    resolveManagedSkillAgentHomeDirectory,
} from "./managed-skill-agents.ts";
import { readSkillDirectoryState } from "./skill-directory-state.ts";
import {
    createBundledSkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

describe("bundled skill observation", () => {
    test("reports directory and file existence from stat-backed wrappers", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const directoryPath = join(rootDirectory, "skill-directory");
        const filePath = join(rootDirectory, "skill-file.txt");

        try {
            await mkdir(directoryPath, { recursive: true });
            await Bun.write(filePath, "skill\n");

            expect(await directoryExists(directoryPath)).toBeTrue();
            expect(await directoryExists(filePath)).toBeFalse();
            expect(await directoryExists(join(rootDirectory, "missing"))).toBeFalse();

            expect(await fileExists(filePath)).toBeTrue();
            expect(await fileExists(directoryPath)).toBeFalse();
            expect(await fileExists(join(rootDirectory, "missing.txt"))).toBeFalse();
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("writes bundled metadata that classifies the directory as managed", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const skillDirectoryPath = join(rootDirectory, "skills", "oo");
        const metadataFilePath = join(skillDirectoryPath, ".oo-metadata.json");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await writeInstalledBundledSkillMetadata(skillDirectoryPath, {
                version: "1.2.3",
            });

            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata("1.2.3")),
            );
            expect(await readSkillDirectoryState(skillDirectoryPath)).toEqual({
                kind: "managed",
                metadata: createBundledSkillMetadata("1.2.3"),
                publicationCurrent: true,
            });
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("resolves configured agent home environment overrides", () => {
        const hermesHomeDirectory = join(tmpdir(), "custom-hermes-home");
        const openClawHomeDirectory = join(tmpdir(), "custom-openclaw-home");
        const userHomeDirectory = join(tmpdir(), "user-home");
        const env = {
            HERMES_HOME: hermesHomeDirectory,
            HOME: userHomeDirectory,
            OPENCLAW_HOME: openClawHomeDirectory,
        };

        expect(resolveManagedSkillAgentHomeDirectory(env, "hermes")).toBe(
            hermesHomeDirectory,
        );
        expect(resolveManagedSkillAgentHomeDirectory(env, "openclaw")).toBe(
            openClawHomeDirectory,
        );
        expect(resolveManagedSkillAgentHomeDirectory(env, "deepseek-tui")).toBe(
            join(userHomeDirectory, readManagedSkillAgent("deepseek-tui").homeDirectoryName),
        );
        expect(resolveManagedSkillAgentHomeDirectory(env, "trae")).toBe(
            join(userHomeDirectory, readManagedSkillAgent("trae").homeDirectoryName),
        );
        expect(resolveManagedSkillAgentHomeDirectory(env, "trae-cn")).toBe(
            join(userHomeDirectory, readManagedSkillAgent("trae-cn").homeDirectoryName),
        );
    });
});
