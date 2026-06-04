import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../__tests__/helpers.ts";
import { resolveManagedSkillAgentHomeDirectory } from "./managed-skill-agents.ts";
import { resolveManagedSkillDirectoryPath } from "./managed-skill-paths.ts";
import {
    createLocalSkillMetadata,
    createRegistrySkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

describe("skills adopt command", () => {
    test("adopts an existing workflow directory in place", async () => {
        await withCliSandbox(async (sandbox) => {
            const skillDirectoryPath = join(sandbox.cwd, "vpn-profile-compiler");

            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(
                join(skillDirectoryPath, "SKILL.md"),
                [
                    "---",
                    "name: vpn-profile-compiler",
                    "description: Compile VPN profiles from local configuration.",
                    "title: VPN Profile Compiler",
                    "icon: ':lucide:network:'",
                    "---",
                    "",
                    "# Existing Workflow",
                    "",
                    "Run the local compiler script.",
                    "",
                ].join("\n"),
            );
            await Bun.write(join(skillDirectoryPath, "compile.ts"), "export {};\n");

            const result = await sandbox.run(["skills", "adopt", skillDirectoryPath]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Adopted skill vpn-profile-compiler at ${skillDirectoryPath}.\n`,
            );
            expect(result.stderr).toBe("");
            expect(await readFile(join(skillDirectoryPath, ".oo-metadata.json"), "utf8")).toBe(
                renderSkillMetadataJson(createLocalSkillMetadata()),
            );

            const skillMarkdown = await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8");

            expect(skillMarkdown).toContain("name: vpn-profile-compiler\n");
            expect(skillMarkdown).toContain("description: Compile VPN profiles from local configuration.\n");
            expect(skillMarkdown).toContain("compatibility: Requires the oo CLI.\n");
            expect(skillMarkdown).toContain("metadata:\n  icon: ':lucide:network:'\n  title: VPN Profile Compiler\n");
            expect(skillMarkdown).toContain("Run the local compiler script.");
        });
    });

    test("copies an existing workflow into the requested agent skill directory", async () => {
        await withCliSandbox(async (sandbox) => {
            const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
            const sourceDirectoryPath = join(sandbox.cwd, "Existing Workflow");
            const targetDirectoryPath = resolveManagedSkillDirectoryPath(
                universalHomeDirectory,
                "vpn-profile-compiler",
            );

            await Promise.all([
                mkdir(universalHomeDirectory, { recursive: true }),
                mkdir(sourceDirectoryPath, { recursive: true }),
            ]);
            await Bun.write(join(sourceDirectoryPath, "compile.ts"), "export {};\n");

            const result = await sandbox.run([
                "skills",
                "adopt",
                sourceDirectoryPath,
                "--agent",
                "universal",
                "--name",
                "VPN Profile Compiler",
                "--description",
                "Compile VPN profiles from local configuration.",
                "--title",
                "VPN Profile Compiler",
                "--icon",
                ":lucide:network:",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Adopted skill vpn-profile-compiler at ${targetDirectoryPath}.\n`,
            );
            expect(await readFile(join(targetDirectoryPath, "compile.ts"), "utf8")).toBe("export {};\n");
            expect(await readFile(join(targetDirectoryPath, ".oo-metadata.json"), "utf8")).toBe(
                renderSkillMetadataJson(createLocalSkillMetadata()),
            );
            expect(await readFile(join(targetDirectoryPath, "SKILL.md"), "utf8")).toContain(
                "name: vpn-profile-compiler\n",
            );
            await expect(stat(join(sourceDirectoryPath, "compile.ts"))).resolves.toBeDefined();
        });
    });

    test("rejects directories that already belong to registry skills", async () => {
        await withCliSandbox(async (sandbox) => {
            const skillDirectoryPath = join(sandbox.cwd, "registry-skill");

            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(
                join(skillDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson(createRegistrySkillMetadata({
                    packageName: "@owner/registry-skill",
                    version: "1.0.0",
                })),
            );

            const result = await sandbox.run([
                "skills",
                "adopt",
                skillDirectoryPath,
                "--description",
                "Use this existing workflow.",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                `Cannot adopt skill at ${skillDirectoryPath} because its .oo-metadata.json belongs to another oo-managed skill or is invalid.\n`,
            );
            await expect(stat(join(skillDirectoryPath, "SKILL.md"))).rejects.toMatchObject({
                code: "ENOENT",
            });
        });
    });

    test("rejects foreign source metadata before copying to an agent target", async () => {
        await withCliSandbox(async (sandbox) => {
            const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
            const sourceDirectoryPath = join(sandbox.cwd, "registry-skill");
            const targetDirectoryPath = resolveManagedSkillDirectoryPath(
                universalHomeDirectory,
                "registry-skill",
            );

            await Promise.all([
                mkdir(universalHomeDirectory, { recursive: true }),
                mkdir(sourceDirectoryPath, { recursive: true }),
            ]);
            await Bun.write(join(sourceDirectoryPath, "source.ts"), "export {};\n");
            await Bun.write(
                join(sourceDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson(createRegistrySkillMetadata({
                    packageName: "@owner/registry-skill",
                    version: "1.0.0",
                })),
            );

            const result = await sandbox.run([
                "skills",
                "adopt",
                sourceDirectoryPath,
                "--agent",
                "universal",
                "--description",
                "Use this existing workflow.",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                `Cannot adopt skill at ${sourceDirectoryPath} because its .oo-metadata.json belongs to another oo-managed skill or is invalid.\n`,
            );
            await expect(stat(targetDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        });
    });

    test("does not overwrite an existing agent target directory", async () => {
        await withCliSandbox(async (sandbox) => {
            const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
            const sourceDirectoryPath = join(sandbox.cwd, "source-workflow");
            const targetDirectoryPath = resolveManagedSkillDirectoryPath(
                universalHomeDirectory,
                "target-skill",
            );

            await Promise.all([
                mkdir(sourceDirectoryPath, { recursive: true }),
                mkdir(targetDirectoryPath, { recursive: true }),
            ]);
            await Bun.write(join(sourceDirectoryPath, "source.ts"), "export {};\n");
            await Bun.write(join(targetDirectoryPath, "existing.txt"), "keep\n");

            const result = await sandbox.run([
                "skills",
                "adopt",
                sourceDirectoryPath,
                "--agent",
                "universal",
                "--name",
                "target-skill",
                "--description",
                "Use this existing workflow.",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                `Skill name target-skill is already used by a non-OOMOL skill at ${targetDirectoryPath}.\n`,
            );
            expect(await readFile(join(targetDirectoryPath, "existing.txt"), "utf8")).toBe("keep\n");
            await expect(stat(join(targetDirectoryPath, "source.ts"))).rejects.toMatchObject({
                code: "ENOENT",
            });
        });
    });

    test("requires a description when no existing SKILL.md description is available", async () => {
        await withCliSandbox(async (sandbox) => {
            const skillDirectoryPath = join(sandbox.cwd, "missing-description");

            await mkdir(skillDirectoryPath, { recursive: true });

            const result = await sandbox.run(["skills", "adopt", skillDirectoryPath]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "Missing required --description. Provide a concise trigger description for the generated skill.\n",
            );
            await expect(stat(join(skillDirectoryPath, "SKILL.md"))).rejects.toMatchObject({
                code: "ENOENT",
            });
        });
    });

    test("rejects an empty override description", async () => {
        await withCliSandbox(async (sandbox) => {
            const skillDirectoryPath = join(sandbox.cwd, "empty-description");

            await mkdir(skillDirectoryPath, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "adopt",
                skillDirectoryPath,
                "--description",
                " ",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "Invalid value for --description. Use a non-empty trigger description for the adopted skill.\n",
            );
            await expect(stat(join(skillDirectoryPath, "SKILL.md"))).rejects.toMatchObject({
                code: "ENOENT",
            });
        });
    });
});

type CliSandbox = Awaited<ReturnType<typeof createCliSandbox>>;

async function withCliSandbox(
    callback: (sandbox: CliSandbox) => Promise<void>,
): Promise<void> {
    const sandbox = await createCliSandbox();

    try {
        await callback(sandbox);
    }
    finally {
        await sandbox.cleanup();
    }
}
