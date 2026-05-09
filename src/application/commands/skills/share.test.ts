import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createInteractiveInput,
    toRequest,
    writeAuthFile,
} from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";
import {
    resolveLocalSkillCanonicalDirectoryPath,
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import { renderSkillMetadataJson } from "./skill-metadata.ts";

describe("skills share command", () => {
    test("confirms a local published skill and prints a share prompt", async () => {
        const sandbox = await createCliSandbox();
        const stdin = createInteractiveInput();
        const skillDirectoryPath = resolveLocalSkillDirectoryPath(
            sandbox,
            "demo-skill",
        );

        try {
            await writeAuthFile(sandbox);
            await writePublishedSkillFile(skillDirectoryPath, {
                packageName: "@alice/demo-skill",
                skillId: "demo-skill",
                version: "0.0.1",
            });

            stdin.feed("yes\n");
            const requests: Request[] = [];
            const result = await sandbox.run(["skills", "share", "demo-skill"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify({
                        access: "public",
                        blocks: [],
                        description: "Demo skill",
                        packageName: "@alice/demo-skill",
                        packageVersion: "0.0.1",
                        title: "Demo Skill",
                    }));
                },
                stdin,
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain(
                "Share skill demo-skill from public package @alice/demo-skill? [y/N] Share prompt for public skill demo-skill from @alice/demo-skill:",
            );
            expect(result.stdout).toContain(
                "The skill is already published and public:",
            );
            expect(result.stdout).toContain(
                "oo skills install @alice/demo-skill --skill demo-skill -y",
            );
            expect(requests.map(request => request.url)).toEqual([
                "https://registry.oomol.com/-/oomol/package-info/%40alice%2Fdemo-skill/latest?lang=en",
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("asks for the skill reference when none is provided", async () => {
        const sandbox = await createCliSandbox();
        const stdin = createInteractiveInput();
        const skillDirectoryPath = resolveLocalSkillDirectoryPath(
            sandbox,
            "prompted-skill",
        );

        try {
            await writeAuthFile(sandbox);
            await writePublishedSkillFile(skillDirectoryPath, {
                packageName: "@alice/prompted-skill",
                skillId: "prompted-skill",
                version: "0.0.1",
            });

            stdin.feed("prompted-skill\n");
            const result = await sandbox.run(["skills", "share", "--yes"], {
                fetcher: async () => new Response(JSON.stringify({
                    access: "public",
                    blocks: [],
                    description: "Prompted skill",
                    packageName: "@alice/prompted-skill",
                    packageVersion: "0.0.1",
                    title: "Prompted Skill",
                })),
                stdin,
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toStartWith(
                "Which skill id, package name, or skill directory path do you want to share? ",
            );
            expect(result.stdout).toContain(
                "Share prompt for public skill prompted-skill from @alice/prompted-skill:",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("shares an installed registry skill when confirmation is skipped", async () => {
        const sandbox = await createCliSandbox();
        const skillDirectoryPath = resolveRegistrySkillDirectoryPath(
            sandbox,
            "registry-skill",
        );

        try {
            await writeAuthFile(sandbox);
            await writeSkillFile(skillDirectoryPath, [
                "---",
                "name: registry-skill",
                "description: Use a registry workflow.",
                "---",
                "",
            ].join("\n"));
            await Bun.write(
                resolveManagedSkillMetadataFilePath(skillDirectoryPath),
                renderSkillMetadataJson({
                    kind: "registry",
                    packageName: "@alice/registry-skill",
                    schemaVersion: 1,
                    version: "0.0.2",
                }),
            );

            const result = await sandbox.run(
                ["skills", "share", "registry-skill", "--yes"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        access: "public",
                        blocks: [],
                        description: "Registry skill",
                        packageName: "@alice/registry-skill",
                        packageVersion: "0.0.2",
                        title: "Registry Skill",
                    })),
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).not.toContain("[y/N]");
            expect(result.stdout).toContain(
                "oo skills install @alice/registry-skill --skill registry-skill -y",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects a published skill that is not public", async () => {
        const sandbox = await createCliSandbox();
        const skillDirectoryPath = resolveLocalSkillDirectoryPath(
            sandbox,
            "private-skill",
        );

        try {
            await writeAuthFile(sandbox);
            await writePublishedSkillFile(skillDirectoryPath, {
                packageName: "@alice/private-skill",
                skillId: "private-skill",
                version: "0.0.1",
            });

            const result = await sandbox.run(
                ["skills", "share", "private-skill", "--yes"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        access: "restricted",
                        blocks: [],
                        description: "Private skill",
                        packageName: "@alice/private-skill",
                        packageVersion: "0.0.1",
                        title: "Private Skill",
                    })),
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "Package @alice/private-skill is not public (current visibility: restricted). Publish it with --visibility public before sharing.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

function resolveLocalSkillDirectoryPath(
    sandbox: Awaited<ReturnType<typeof createCliSandbox>>,
    skillId: string,
): string {
    const storePaths = resolveStorePaths({
        appName: APP_NAME,
        env: sandbox.env,
        platform: process.platform,
    });

    return resolveLocalSkillCanonicalDirectoryPath(
        storePaths.settingsFilePath,
        skillId,
    );
}

function resolveRegistrySkillDirectoryPath(
    sandbox: Awaited<ReturnType<typeof createCliSandbox>>,
    skillId: string,
): string {
    const storePaths = resolveStorePaths({
        appName: APP_NAME,
        env: sandbox.env,
        platform: process.platform,
    });

    return resolveManagedSkillCanonicalDirectoryPath(
        storePaths.settingsFilePath,
        skillId,
    );
}

async function writePublishedSkillFile(
    directoryPath: string,
    options: {
        packageName: string;
        skillId: string;
        version: string;
    },
): Promise<void> {
    await writeSkillFile(directoryPath, [
        "---",
        `name: ${options.skillId}`,
        "description: Use a published workflow.",
        "metadata:",
        `  packageName: "${options.packageName}"`,
        `  version: "${options.version}"`,
        "---",
        "",
    ].join("\n"));
}

async function writeSkillFile(
    directoryPath: string,
    content: string,
): Promise<void> {
    await mkdir(directoryPath, { recursive: true });
    await Bun.write(join(directoryPath, "SKILL.md"), content);
}
