import type { Logger } from "pino";

import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createLogCapture,
    createTemporaryDirectory,
} from "../../../../__tests__/helpers.ts";
import { migrateLegacyCanonicalSkillLayout } from "./legacy-canonical-migration.ts";

describe("legacy canonical skill migration", () => {
    test("is a no-op when no legacy canonical directories exist", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-legacy-canonical");
        const configDirectoryPath = join(rootDirectory, "config");
        const settingsFilePath = join(configDirectoryPath, "settings.toml");
        const logCapture = createLogCapture();

        try {
            await mkdir(configDirectoryPath, { recursive: true });

            await migrateLegacyCanonicalSkillLayout({
                logger: logCapture.logger as unknown as Logger,
                settingsStore: {
                    getFilePath: () => settingsFilePath,
                } as never,
            });

            logCapture.close();
            expect(logCapture.read()).toBe("");
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("removes the legacy claude-skills canonical root", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-legacy-canonical");
        const configDirectoryPath = join(rootDirectory, "config");
        const settingsFilePath = join(configDirectoryPath, "settings.toml");
        const legacyClaudePath = join(configDirectoryPath, "claude-skills");
        const logCapture = createLogCapture();

        try {
            await mkdir(join(legacyClaudePath, "oo"), { recursive: true });
            await Bun.write(
                join(legacyClaudePath, "oo", "SKILL.md"),
                "stale\n",
            );

            await migrateLegacyCanonicalSkillLayout({
                logger: logCapture.logger as unknown as Logger,
                settingsStore: {
                    getFilePath: () => settingsFilePath,
                } as never,
            });

            await expect(stat(legacyClaudePath)).rejects.toMatchObject({
                code: "ENOENT",
            });

            logCapture.close();
            expect(logCapture.read()).toContain("claudeSkillsRoot");
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("removes the legacy openclaw-skills canonical root", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-legacy-canonical");
        const configDirectoryPath = join(rootDirectory, "config");
        const settingsFilePath = join(configDirectoryPath, "settings.toml");
        const legacyOpenClawPath = join(configDirectoryPath, "openclaw-skills");
        const logCapture = createLogCapture();

        try {
            await mkdir(join(legacyOpenClawPath, "oo"), { recursive: true });
            await Bun.write(
                join(legacyOpenClawPath, "oo", "SKILL.md"),
                "stale\n",
            );

            await migrateLegacyCanonicalSkillLayout({
                logger: logCapture.logger as unknown as Logger,
                settingsStore: {
                    getFilePath: () => settingsFilePath,
                } as never,
            });

            await expect(stat(legacyOpenClawPath)).rejects.toMatchObject({
                code: "ENOENT",
            });

            logCapture.close();
            expect(logCapture.read()).toContain("openClawSkillsRoot");
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("removes legacy children directly under skills/ while preserving the new layout", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-legacy-canonical");
        const configDirectoryPath = join(rootDirectory, "config");
        const settingsFilePath = join(configDirectoryPath, "settings.toml");
        const skillsDirectoryPath = join(configDirectoryPath, "skills");
        const legacyCodexBundledPath = join(skillsDirectoryPath, "oo");
        const legacyRegistryPath = join(skillsDirectoryPath, "chatgpt");
        const newBundledPath = join(skillsDirectoryPath, "bundled", "codex", "oo");
        const newRegistryPath = join(skillsDirectoryPath, "registry", "chatgpt");
        const logCapture = createLogCapture();

        try {
            await mkdir(legacyCodexBundledPath, { recursive: true });
            await Bun.write(
                join(legacyCodexBundledPath, ".oo-metadata.json"),
                JSON.stringify({ version: "0.0.1" }),
            );
            await mkdir(legacyRegistryPath, { recursive: true });
            await Bun.write(
                join(legacyRegistryPath, ".oo-metadata.json"),
                JSON.stringify({ packageName: "foo", version: "0.0.2" }),
            );
            await mkdir(newBundledPath, { recursive: true });
            await Bun.write(join(newBundledPath, "SKILL.md"), "new bundled\n");
            await mkdir(newRegistryPath, { recursive: true });
            await Bun.write(join(newRegistryPath, "SKILL.md"), "new registry\n");

            await migrateLegacyCanonicalSkillLayout({
                logger: logCapture.logger as unknown as Logger,
                settingsStore: {
                    getFilePath: () => settingsFilePath,
                } as never,
            });

            await expect(stat(legacyCodexBundledPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(legacyRegistryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(newBundledPath)).resolves.toMatchObject({
                isDirectory: expect.any(Function),
            });
            await expect(stat(newRegistryPath)).resolves.toMatchObject({
                isDirectory: expect.any(Function),
            });

            logCapture.close();
            const logOutput = logCapture.read();

            expect(logOutput).toContain("legacySkillsChild");
            expect(logOutput).toContain(serializeJsonPath(legacyCodexBundledPath));
            expect(logOutput).toContain(serializeJsonPath(legacyRegistryPath));
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("logs a warning and continues when a legacy path cannot be inspected", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-legacy-canonical");
        const configDirectoryPath = join(rootDirectory, "config");
        const settingsFilePath = join(configDirectoryPath, "settings.toml");
        const legacyClaudePath = join(configDirectoryPath, "claude-skills");
        const legacyOpenClawPath = join(configDirectoryPath, "openclaw-skills");
        const logCapture = createLogCapture();

        try {
            await mkdir(configDirectoryPath, { recursive: true });
            // Write a regular file where a directory is expected; readdir will fail
            // with ENOTDIR (or similar) and migration must swallow the error.
            await Bun.write(legacyClaudePath, "not a directory\n");
            await mkdir(legacyOpenClawPath, { recursive: true });

            await migrateLegacyCanonicalSkillLayout({
                logger: logCapture.logger as unknown as Logger,
                settingsStore: {
                    getFilePath: () => settingsFilePath,
                } as never,
            });

            logCapture.close();
            const logOutput = logCapture.read();

            expect(logOutput).toContain(
                "Failed to inspect legacy canonical skills directory.",
            );
            // The healthy openclaw-skills candidate must still have been removed.
            await expect(stat(legacyOpenClawPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("is idempotent when run twice", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-legacy-canonical");
        const configDirectoryPath = join(rootDirectory, "config");
        const settingsFilePath = join(configDirectoryPath, "settings.toml");
        const legacyClaudePath = join(configDirectoryPath, "claude-skills");
        const firstLogCapture = createLogCapture();
        const secondLogCapture = createLogCapture();

        try {
            await mkdir(legacyClaudePath, { recursive: true });

            await migrateLegacyCanonicalSkillLayout({
                logger: firstLogCapture.logger as unknown as Logger,
                settingsStore: {
                    getFilePath: () => settingsFilePath,
                } as never,
            });
            await migrateLegacyCanonicalSkillLayout({
                logger: secondLogCapture.logger as unknown as Logger,
                settingsStore: {
                    getFilePath: () => settingsFilePath,
                } as never,
            });

            firstLogCapture.close();
            secondLogCapture.close();
            expect(firstLogCapture.read()).toContain("claudeSkillsRoot");
            expect(secondLogCapture.read()).toBe("");
            await expect(stat(legacyClaudePath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });
});

// pino serializes paths as JSON strings, so backslashes on win32 appear escaped.
function serializeJsonPath(path: string): string {
    return JSON.stringify(path).slice(1, -1);
}
