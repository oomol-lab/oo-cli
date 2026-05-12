import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../__tests__/helpers.ts";
import {
    resolveClaudeHomeDirectory,
    resolveCodeBuddyHomeDirectory,
    resolveCodexHomeDirectory,
    resolveHermesHomeDirectory,
    resolveQoderWorkHomeDirectory,
    resolveTraeCnHomeDirectory,
    resolveTraeHomeDirectory,
    resolveWorkBuddyHomeDirectory,
} from "./bundled-skill-paths.ts";
import { availableBundledSkillNames } from "./embedded-assets.ts";
import { resolveManagedSkillsDirectoryPath } from "./managed-skill-paths.ts";

describe("skills preflight command", () => {
    test("requires --agent", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run([
                "skills",
                "preflight",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "Missing required --agent. Choose codex, claude, hermes, codebuddy, workbuddy, trae, trae-cn, openclaw, or qoderwork.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("checks the requested agent skill directory", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillsDirectoryPath = resolveManagedSkillsDirectoryPath(codexHomeDirectory);

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
                `Local skill editing is ready. Writable storage: ${skillsDirectoryPath}. Supported hosts: 1.\n`,
            );
            expect(await readDirectoryWithoutBundledSkills(skillsDirectoryPath)).toEqual([]);
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
        const skillsDirectoryPath = resolveManagedSkillsDirectoryPath(qoderWorkHomeDirectory);

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
                `Local skill editing is ready. Writable storage: ${skillsDirectoryPath}. Supported hosts: 1.\n`,
            );
            expect(await readDirectoryWithoutBundledSkills(skillsDirectoryPath)).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("checks Hermes as a requested agent", async () => {
        const sandbox = await createCliSandbox();
        const hermesHomeDirectory = resolveHermesHomeDirectory(sandbox.env);
        const skillsDirectoryPath = resolveManagedSkillsDirectoryPath(hermesHomeDirectory);

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
                `Local skill editing is ready. Writable storage: ${skillsDirectoryPath}. Supported hosts: 1.\n`,
            );
            expect(await readDirectoryWithoutBundledSkills(skillsDirectoryPath)).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("checks CodeBuddy as a requested agent", async () => {
        const sandbox = await createCliSandbox();
        const codeBuddyHomeDirectory = resolveCodeBuddyHomeDirectory(sandbox.env);
        const skillsDirectoryPath = resolveManagedSkillsDirectoryPath(codeBuddyHomeDirectory);

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
                `Local skill editing is ready. Writable storage: ${skillsDirectoryPath}. Supported hosts: 1.\n`,
            );
            expect(await readDirectoryWithoutBundledSkills(skillsDirectoryPath)).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("checks WorkBuddy as a requested agent", async () => {
        const sandbox = await createCliSandbox();
        const workBuddyHomeDirectory = resolveWorkBuddyHomeDirectory(sandbox.env);
        const skillsDirectoryPath = resolveManagedSkillsDirectoryPath(workBuddyHomeDirectory);

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
                `Local skill editing is ready. Writable storage: ${skillsDirectoryPath}. Supported hosts: 1.\n`,
            );
            expect(await readDirectoryWithoutBundledSkills(skillsDirectoryPath)).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("checks Trae as a requested agent", async () => {
        const sandbox = await createCliSandbox();
        const traeHomeDirectory = resolveTraeHomeDirectory(sandbox.env);
        const skillsDirectoryPath = resolveManagedSkillsDirectoryPath(traeHomeDirectory);

        try {
            await mkdir(traeHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "preflight",
                "--agent",
                "trae",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                `Local skill editing is ready. Writable storage: ${skillsDirectoryPath}. Supported hosts: 1.\n`,
            );
            expect(await readDirectoryWithoutBundledSkills(skillsDirectoryPath)).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("checks Trae CN as a requested agent", async () => {
        const sandbox = await createCliSandbox();
        const traeCnHomeDirectory = resolveTraeCnHomeDirectory(sandbox.env);
        const skillsDirectoryPath = resolveManagedSkillsDirectoryPath(traeCnHomeDirectory);

        try {
            await mkdir(traeCnHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "preflight",
                "--agent",
                "trae-cn",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                `Local skill editing is ready. Writable storage: ${skillsDirectoryPath}. Supported hosts: 1.\n`,
            );
            expect(await readDirectoryWithoutBundledSkills(skillsDirectoryPath)).toEqual([]);
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

async function readDirectoryWithoutBundledSkills(directoryPath: string): Promise<string[]> {
    const bundledSkillNames = new Set<string>(availableBundledSkillNames);

    return (await readdir(directoryPath))
        .filter(name => !bundledSkillNames.has(name))
        .sort();
}
