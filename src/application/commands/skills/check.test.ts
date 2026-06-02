import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../__tests__/helpers.ts";
import { availableBundledSkillNames } from "./embedded-assets.ts";
import { resolveManagedSkillAgentHomeDirectory } from "./managed-skill-agents.ts";
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
                "Missing required --agent. Choose universal, claude, hermes, codebuddy, workbuddy, trae, trae-cn, openclaw, qoderwork, deepseek-tui.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("checks the requested agent skill directory", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillsDirectoryPath = resolveManagedSkillsDirectoryPath(universalHomeDirectory);

        try {
            await mkdir(universalHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "preflight",
                "--agent",
                "universal",
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
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const openClawHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "openclaw");

        try {
            await mkdir(claudeHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "preflight",
                "--agent",
                "openclaw",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                `OpenClaw is not installed. Expected the OpenClaw home directory at ${openClawHomeDirectory}.\n`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("checks QoderWork as a requested agent", async () => {
        const sandbox = await createCliSandbox();
        const qoderWorkHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "qoderwork");
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
        const hermesHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "hermes");
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
        const codeBuddyHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codebuddy");
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

    test("checks DeepSeek TUI as a requested agent", async () => {
        const sandbox = await createCliSandbox();
        const deepSeekTuiHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "deepseek-tui");
        const skillsDirectoryPath = resolveManagedSkillsDirectoryPath(
            deepSeekTuiHomeDirectory,
        );

        try {
            await mkdir(deepSeekTuiHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "preflight",
                "--agent",
                "deepseek-tui",
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
        const workBuddyHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "workbuddy");
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
        const traeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "trae");
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
        const traeCnHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "trae-cn");
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
        const openClawHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "openclaw");
        const publishRootPath = join(openClawHomeDirectory, "skills");

        try {
            await mkdir(openClawHomeDirectory, { recursive: true });
            await Bun.write(publishRootPath, "not a directory");

            const result = await sandbox.run([
                "skills",
                "preflight",
                "--agent",
                "openclaw",
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
