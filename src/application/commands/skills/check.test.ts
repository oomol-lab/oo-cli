import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";
import {
    resolveClaudeHomeDirectory,
    resolveCodeBuddyHomeDirectory,
    resolveCodexHomeDirectory,
    resolveHermesHomeDirectory,
    resolveQoderWorkHomeDirectory,
    resolveWorkBuddyHomeDirectory,
} from "./bundled-skill-paths.ts";
import { resolveLocalSkillCanonicalRootDirectoryPath } from "./managed-skill-paths.ts";

describe("skills preflight command", () => {
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
                "preflight",
                "--agent",
                "codex",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                `Local skill editing is ready. Writable storage: ${canonicalRootDirectoryPath}. Supported hosts: 1.\n`,
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
                "preflight",
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

    test("checks QoderWork as a requested agent", async () => {
        const sandbox = await createCliSandbox();
        const qoderWorkHomeDirectory = resolveQoderWorkHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalRootDirectoryPath = resolveLocalSkillCanonicalRootDirectoryPath(
            storePaths.settingsFilePath,
        );

        try {
            await mkdir(qoderWorkHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "preflight",
                "--agent",
                "qoderwork",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                `Local skill editing is ready. Writable storage: ${canonicalRootDirectoryPath}. Supported hosts: 1.\n`,
            );
            expect(await readdir(canonicalRootDirectoryPath)).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("checks Hermes as a requested agent", async () => {
        const sandbox = await createCliSandbox();
        const hermesHomeDirectory = resolveHermesHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalRootDirectoryPath = resolveLocalSkillCanonicalRootDirectoryPath(
            storePaths.settingsFilePath,
        );

        try {
            await mkdir(hermesHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "preflight",
                "--agent",
                "hermes",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                `Local skill editing is ready. Writable storage: ${canonicalRootDirectoryPath}. Supported hosts: 1.\n`,
            );
            expect(await readdir(canonicalRootDirectoryPath)).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("checks CodeBuddy as a requested agent", async () => {
        const sandbox = await createCliSandbox();
        const codeBuddyHomeDirectory = resolveCodeBuddyHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalRootDirectoryPath = resolveLocalSkillCanonicalRootDirectoryPath(
            storePaths.settingsFilePath,
        );

        try {
            await mkdir(codeBuddyHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "preflight",
                "--agent",
                "codebuddy",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                `Local skill editing is ready. Writable storage: ${canonicalRootDirectoryPath}. Supported hosts: 1.\n`,
            );
            expect(await readdir(canonicalRootDirectoryPath)).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("checks WorkBuddy as a requested agent", async () => {
        const sandbox = await createCliSandbox();
        const workBuddyHomeDirectory = resolveWorkBuddyHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalRootDirectoryPath = resolveLocalSkillCanonicalRootDirectoryPath(
            storePaths.settingsFilePath,
        );

        try {
            await mkdir(workBuddyHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "preflight",
                "--agent",
                "workbuddy",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                `Local skill editing is ready. Writable storage: ${canonicalRootDirectoryPath}. Supported hosts: 1.\n`,
            );
            expect(await readdir(canonicalRootDirectoryPath)).toEqual([]);
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
                "preflight",
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
