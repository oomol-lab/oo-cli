import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../__tests__/helpers.ts";
import { createTerminalColors } from "../../terminal-colors.ts";
import { renderManagedSkillMetadataContent } from "./managed-skill-metadata.ts";
import { resolveCodexHomeDirectory } from "./shared.ts";

const managedSkillNameColor = "#59F78D";
const managedSkillSourceColor = "#CAA8FA";
const managedSkillVersionColor = "#7DD3FC";

describe("skills list CLI", () => {
    test("lists oo-managed skills with source and version details", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillsDirectoryPath = join(codexHomeDirectory, "skills");
        const alphaSkillDirectoryPath = join(skillsDirectoryPath, "alpha-skill");
        const unmanagedSkillDirectoryPath = join(skillsDirectoryPath, "custom-skill");

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install"], {
                version: "9.9.9",
            });
            await mkdir(alphaSkillDirectoryPath, { recursive: true });
            await mkdir(unmanagedSkillDirectoryPath, { recursive: true });
            await Bun.write(
                join(alphaSkillDirectoryPath, ".oo-metadata.json"),
                renderManagedSkillMetadataContent({
                    packageName: "@oomol/alpha",
                    version: "1.2.3",
                }),
            );

            const result = await sandbox.run(["skills", "list"]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "✓ Found 2 oo-managed skills.",
                    "",
                    "oo",
                    "  Source: bundled",
                    "  Version: 9.9.9",
                    "",
                    "alpha-skill",
                    "  Source: @oomol/alpha",
                    "  Version: 1.2.3",
                    "",
                ].join("\n"),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prints a no-results message when no oo-managed skills are installed", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "list"]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe("! No oo-managed skills were found.\n");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders skills list output with field-specific colors", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillsDirectoryPath = join(codexHomeDirectory, "skills");
        const alphaSkillDirectoryPath = join(skillsDirectoryPath, "alpha-skill");
        const colors = createTerminalColors(true);

        try {
            await mkdir(alphaSkillDirectoryPath, { recursive: true });
            await Bun.write(
                join(alphaSkillDirectoryPath, ".oo-metadata.json"),
                renderManagedSkillMetadataContent({
                    packageName: "@oomol/alpha",
                    version: "1.2.3",
                }),
            );

            const result = await sandbox.run(["skills", "list"], {
                stdout: {
                    hasColors: true,
                },
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                colors.bold(colors.hex(managedSkillNameColor)("alpha-skill")),
            );
            expect(result.stdout).toContain(
                `${colors.dim("Source:")} ${colors.hex(managedSkillSourceColor)("@oomol/alpha")}`,
            );
            expect(result.stdout).toContain(
                `${colors.dim("Version:")} ${colors.hex(managedSkillVersionColor)("1.2.3")}`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
