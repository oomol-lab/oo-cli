import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";
import {
    resolveClaudeHomeDirectory,
    resolveCodexHomeDirectory,
} from "./bundled-skill-paths.ts";
import { resolveLocalSkillCanonicalRootDirectoryPath } from "./managed-skill-paths.ts";

describe("skills check command", () => {
    test("checks the requested agent and local canonical storage", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalRootDirectoryPath = resolveLocalSkillCanonicalRootDirectoryPath(
            storePaths.settingsFilePath,
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "check",
                "--agent",
                "codex",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                `Local skill authoring is ready. Writable storage: ${canonicalRootDirectoryPath}. Supported hosts: 1.\n`,
            );
            expect(await readdir(canonicalRootDirectoryPath)).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("requires the requested agent home directory", async () => {
        const sandbox = await createCliSandbox();
        const claudeHomeDirectory = resolveClaudeHomeDirectory(sandbox.env);
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);

        try {
            await mkdir(claudeHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "check",
                "--agent",
                "codex",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                `Codex is not installed. Expected the Codex home directory at ${codexHomeDirectory}.\n`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("requires the requested agent publish root to be writable", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const publishRootPath = join(codexHomeDirectory, "skills");

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await Bun.write(publishRootPath, "not a directory");

            const result = await sandbox.run([
                "skills",
                "check",
                "--agent",
                "codex",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                `Local skill storage at ${publishRootPath} is not writable:`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
