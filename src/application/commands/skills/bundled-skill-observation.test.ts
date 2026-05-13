import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../../__tests__/helpers.ts";
import {
    directoryExists,
    fileExists,
    isManagedBundledSkillInstallation,
    readInstalledBundledSkillMetadata,
    requireBundledSkillHomeDirectory,
    requireCodexHomeDirectory,
    writeInstalledBundledSkillMetadata,
} from "./bundled-skill-observation.ts";
import {
    resolveDeepSeekTuiHomeDirectory,
    resolveTraeCnHomeDirectory,
    resolveTraeHomeDirectory,
} from "./bundled-skill-paths.ts";
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

    test("reads bundled skill metadata while treating missing or invalid files as undefined", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const skillDirectoryPath = join(rootDirectory, "skills", "oo");
        const metadataFilePath = join(skillDirectoryPath, ".oo-metadata.json");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });

            expect(await readInstalledBundledSkillMetadata(skillDirectoryPath)).toBeUndefined();

            await Bun.write(metadataFilePath, "not json");
            expect(await readInstalledBundledSkillMetadata(skillDirectoryPath)).toBeUndefined();

            await writeInstalledBundledSkillMetadata(skillDirectoryPath, {
                version: "1.2.3",
            });
            expect(await readInstalledBundledSkillMetadata(skillDirectoryPath)).toEqual(
                createBundledSkillMetadata("1.2.3"),
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata("1.2.3")),
            );
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("reads managed state from metadata", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const skillDirectoryPath = join(rootDirectory, "skills", "oo");
        const metadataFilePath = join(skillDirectoryPath, ".oo-metadata.json");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            expect(await isManagedBundledSkillInstallation(skillDirectoryPath)).toBeFalse();

            await Bun.write(metadataFilePath, "not json");
            expect(await isManagedBundledSkillInstallation(skillDirectoryPath)).toBeFalse();

            await writeInstalledBundledSkillMetadata(skillDirectoryPath, {
                version: "1.2.3",
            });
            expect(await isManagedBundledSkillInstallation(skillDirectoryPath)).toBeTrue();
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("requires the resolved Codex home directory to exist", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const codexHomeDirectory = join(rootDirectory, ".codex");
        const env = {
            CODEX_HOME: codexHomeDirectory,
            HOME: rootDirectory,
        };

        try {
            await expect(requireCodexHomeDirectory({ env })).rejects.toMatchObject({
                exitCode: 1,
                key: "errors.skills.codexNotInstalled",
            });

            await mkdir(codexHomeDirectory, { recursive: true });

            expect(await requireCodexHomeDirectory({ env })).toBe(codexHomeDirectory);
            expect((await stat(codexHomeDirectory)).isDirectory()).toBeTrue();
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("requires the resolved Claude home directory to exist", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const claudeHomeDirectory = join(rootDirectory, ".claude");
        const env = {
            HOME: rootDirectory,
        };

        try {
            await expect(
                requireBundledSkillHomeDirectory({ env }, "claude"),
            ).rejects.toMatchObject({
                exitCode: 1,
                key: "errors.skills.claudeNotInstalled",
            });

            await mkdir(claudeHomeDirectory, { recursive: true });

            expect(await requireBundledSkillHomeDirectory({ env }, "claude")).toBe(
                claudeHomeDirectory,
            );
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("requires the resolved Hermes home directory to exist", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const hermesHomeDirectory = join(rootDirectory, "custom-hermes-home");
        const env = {
            HERMES_HOME: hermesHomeDirectory,
            HOME: rootDirectory,
        };

        try {
            await expect(
                requireBundledSkillHomeDirectory({ env }, "hermes"),
            ).rejects.toMatchObject({
                exitCode: 1,
                key: "errors.skills.hermesNotInstalled",
            });

            await mkdir(hermesHomeDirectory, { recursive: true });

            expect(await requireBundledSkillHomeDirectory({ env }, "hermes")).toBe(
                hermesHomeDirectory,
            );
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("requires the resolved CodeBuddy home directory to exist", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const codeBuddyHomeDirectory = join(rootDirectory, ".codebuddy");
        const env = {
            HOME: rootDirectory,
        };

        try {
            await expect(
                requireBundledSkillHomeDirectory({ env }, "codebuddy"),
            ).rejects.toMatchObject({
                exitCode: 1,
                key: "errors.skills.codebuddyNotInstalled",
            });

            await mkdir(codeBuddyHomeDirectory, { recursive: true });

            expect(await requireBundledSkillHomeDirectory({ env }, "codebuddy")).toBe(
                codeBuddyHomeDirectory,
            );
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("requires the resolved WorkBuddy home directory to exist", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const workBuddyHomeDirectory = join(rootDirectory, ".workbuddy");
        const env = {
            HOME: rootDirectory,
        };

        try {
            await expect(
                requireBundledSkillHomeDirectory({ env }, "workbuddy"),
            ).rejects.toMatchObject({
                exitCode: 1,
                key: "errors.skills.workbuddyNotInstalled",
            });

            await mkdir(workBuddyHomeDirectory, { recursive: true });

            expect(await requireBundledSkillHomeDirectory({ env }, "workbuddy")).toBe(
                workBuddyHomeDirectory,
            );
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("requires the resolved OpenClaw home directory to exist", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const openClawHomeDirectory = join(rootDirectory, ".openclaw");
        const env = {
            HOME: rootDirectory,
        };

        try {
            await expect(
                requireBundledSkillHomeDirectory({ env }, "openclaw"),
            ).rejects.toMatchObject({
                exitCode: 1,
                key: "errors.skills.openclawNotInstalled",
            });

            await mkdir(openClawHomeDirectory, { recursive: true });

            expect(await requireBundledSkillHomeDirectory({ env }, "openclaw")).toBe(
                openClawHomeDirectory,
            );
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("requires the resolved QoderWork home directory to exist", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const qoderWorkHomeDirectory = join(rootDirectory, ".qoderwork");
        const env = {
            HOME: rootDirectory,
        };

        try {
            await expect(
                requireBundledSkillHomeDirectory({ env }, "qoderwork"),
            ).rejects.toMatchObject({
                exitCode: 1,
                key: "errors.skills.qoderworkNotInstalled",
            });

            await mkdir(qoderWorkHomeDirectory, { recursive: true });

            expect(await requireBundledSkillHomeDirectory({ env }, "qoderwork")).toBe(
                qoderWorkHomeDirectory,
            );
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("requires the resolved DeepSeek TUI home directory to exist", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const deepSeekTuiHomeDirectory = join(rootDirectory, ".deepseek");
        const env = {
            HOME: rootDirectory,
        };

        try {
            await expect(
                requireBundledSkillHomeDirectory({ env }, "deepseek-tui"),
            ).rejects.toMatchObject({
                exitCode: 1,
                key: "errors.skills.deepseekTuiNotInstalled",
            });

            await mkdir(deepSeekTuiHomeDirectory, { recursive: true });

            expect(await requireBundledSkillHomeDirectory({ env }, "deepseek-tui")).toBe(
                deepSeekTuiHomeDirectory,
            );
            expect(resolveDeepSeekTuiHomeDirectory(env)).toBe(deepSeekTuiHomeDirectory);
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("requires the resolved Trae home directory to exist", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const traeHomeDirectory = join(rootDirectory, ".trae");
        const env = {
            HOME: rootDirectory,
        };

        try {
            await expect(
                requireBundledSkillHomeDirectory({ env }, "trae"),
            ).rejects.toMatchObject({
                exitCode: 1,
                key: "errors.skills.traeNotInstalled",
            });

            await mkdir(traeHomeDirectory, { recursive: true });

            expect(await requireBundledSkillHomeDirectory({ env }, "trae")).toBe(
                traeHomeDirectory,
            );
            expect(resolveTraeHomeDirectory(env)).toBe(traeHomeDirectory);
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("requires the resolved Trae CN home directory to exist", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const traeCnHomeDirectory = join(rootDirectory, ".trae-cn");
        const env = {
            HOME: rootDirectory,
        };

        try {
            await expect(
                requireBundledSkillHomeDirectory({ env }, "trae-cn"),
            ).rejects.toMatchObject({
                exitCode: 1,
                key: "errors.skills.traeCnNotInstalled",
            });

            await mkdir(traeCnHomeDirectory, { recursive: true });

            expect(await requireBundledSkillHomeDirectory({ env }, "trae-cn")).toBe(
                traeCnHomeDirectory,
            );
            expect(resolveTraeCnHomeDirectory(env)).toBe(traeCnHomeDirectory);
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });
});
