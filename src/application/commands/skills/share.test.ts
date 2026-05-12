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
    resolveCodexHomeDirectory,
} from "./bundled-skill-paths.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import { createLocalSkillMetadata, renderSkillMetadataJson } from "./skill-metadata.ts";

const skillInstallGuideUrl
    = "https://static.oomol.com/oo-cli/skill-install-guide/install.md";

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
                "Share skill demo-skill from package @alice/demo-skill? [y/N] Share prompt for skill demo-skill in public package @alice/demo-skill:",
            );
            expect(result.stdout).toContain(
                "The skill is already published and public:",
            );
            expect(result.stdout).toContain("Package: @alice/demo-skill");
            expect(result.stdout).toContain("Skill: demo-skill");
            expect(result.stdout).toContain(
                "Hub: https://hub.oomol.com/package/@alice/demo-skill",
            );
            expect(result.stdout).toContain(
                "\n```text\nPlease help me install this OO skill.",
            );
            expect(result.stdout).not.toContain("```bash");
            expect(result.stdout).not.toContain("```powershell");
            expect(result.stdout).toContain(
                "General install preparation:",
            );
            expect(result.stdout).toContain(
                skillInstallGuideUrl,
            );
            expect(result.stdout).toContain(
                "First follow the guide to check OO CLI and login state, then run:",
            );
            expect(result.stdout).not.toContain(
                "oo --version",
            );
            expect(result.stdout).not.toContain(
                "oo auth status",
            );
            expect(result.stdout).not.toContain(
                "curl -fsSL https://cli.oomol.com/install.sh | bash",
            );
            expect(result.stdout).not.toContain(
                "irm https://cli.oomol.com/install.ps1 | iex",
            );
            expect(result.stdout).not.toContain(
                "macOS / Linux",
            );
            expect(result.stdout).not.toContain(
                "Windows PowerShell",
            );
            expect(result.stdout).toContain(
                "oo skills install @alice/demo-skill --skill demo-skill -y",
            );
            expect(result.stdout).toEndWith("```\n");
            expect(requests.map(request => request.url)).toEqual([
                "https://registry.oomol.com/-/oomol/package-info/%40alice%2Fdemo-skill/latest?lang=en",
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prints a localized copyable share prompt block in Chinese", async () => {
        const sandbox = await createCliSandbox();
        const requests: Request[] = [];

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                [
                    "--lang",
                    "zh",
                    "skills",
                    "share",
                    "@alice/demo-package",
                    "--yes",
                ],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        return new Response(JSON.stringify({
                            access: "public",
                            blocks: [],
                            description: "演示 package",
                            packageName: "@alice/demo-package",
                            packageVersion: "0.0.1",
                            title: "演示 Package",
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain(
                "公开 package @alice/demo-package 的分享提示词：",
            );
            expect(result.stdout).toContain(
                "\n```text\n请帮我安装这个 OO package。",
            );
            expect(result.stdout).not.toContain("```bash");
            expect(result.stdout).not.toContain("```powershell");
            expect(result.stdout).toContain(
                "这个 package 已经发布并且是公开的：",
            );
            expect(result.stdout).toContain("Package: @alice/demo-package");
            expect(result.stdout).toContain(
                "Hub: https://hub.oomol.com/package/@alice/demo-package",
            );
            expect(result.stdout).toContain(
                "通用安装准备说明：",
            );
            expect(result.stdout).toContain(
                skillInstallGuideUrl,
            );
            expect(result.stdout).toContain(
                "请先按通用说明检查 OO CLI 和登录状态，然后执行：",
            );
            expect(result.stdout).not.toContain(
                "oo --version",
            );
            expect(result.stdout).not.toContain(
                "oo auth status",
            );
            expect(result.stdout).not.toContain(
                "curl -fsSL https://cli.oomol.com/install.sh | bash",
            );
            expect(result.stdout).not.toContain(
                "irm https://cli.oomol.com/install.ps1 | iex",
            );
            expect(result.stdout).not.toContain(
                "macOS / Linux",
            );
            expect(result.stdout).not.toContain(
                "Windows PowerShell",
            );
            expect(result.stdout).toContain(
                "oo skills install @alice/demo-package -y",
            );
            expect(result.stdout).toEndWith("```\n");
            expect(requests.map(request => request.url)).toEqual([
                "https://registry.oomol.com/-/oomol/package-info/%40alice%2Fdemo-package/latest?lang=zh-CN",
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
                "Share prompt for skill prompted-skill in public package @alice/prompted-skill:",
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

    test("treats package info without visibility as public", async () => {
        const sandbox = await createCliSandbox();
        const skillDirectoryPath = resolveLocalSkillDirectoryPath(
            sandbox,
            "legacy-public-skill",
        );
        const requests: Request[] = [];

        try {
            await writeAuthFile(sandbox);
            await writePublishedSkillFile(skillDirectoryPath, {
                packageName: "@alice/legacy-public-skill",
                skillId: "legacy-public-skill",
                version: "0.0.1",
            });

            const result = await sandbox.run(
                ["skills", "share", "legacy-public-skill", "--yes"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        return new Response(JSON.stringify({
                            blocks: [],
                            description: "Legacy public skill",
                            packageName: "@alice/legacy-public-skill",
                            packageVersion: "0.0.1",
                            title: "Legacy Public Skill",
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain(
                "The skill is already published and public:",
            );
            expect(result.stdout).toContain(
                "oo skills install @alice/legacy-public-skill --skill legacy-public-skill -y",
            );
            expect(requests.map(request => `${request.method} ${request.url}`)).toEqual([
                "GET https://registry.oomol.com/-/oomol/package-info/%40alice%2Flegacy-public-skill/latest?lang=en",
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("falls back to the reference as a package name when registry skill metadata has no package name", async () => {
        const sandbox = await createCliSandbox();
        const skillDirectoryPath = resolveRegistrySkillDirectoryPath(
            sandbox,
            "fallback-registry-skill",
        );
        const requests: Request[] = [];

        try {
            await writeAuthFile(sandbox);
            await writeSkillFile(skillDirectoryPath, [
                "---",
                "name: fallback-registry-skill",
                "description: Use a registry fallback workflow.",
                "---",
                "",
            ].join("\n"));
            await Bun.write(
                resolveManagedSkillMetadataFilePath(skillDirectoryPath),
                renderSkillMetadataJson({
                    kind: "registry",
                    schemaVersion: 1,
                    version: "0.0.2",
                }),
            );

            const result = await sandbox.run(
                ["skills", "share", "fallback-registry-skill", "--yes"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        return new Response(JSON.stringify({
                            access: "public",
                            blocks: [],
                            description: "Fallback registry skill",
                            packageName: "fallback-registry-skill",
                            packageVersion: "0.0.2",
                            title: "Fallback Registry Skill",
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain(
                "Share prompt for public package fallback-registry-skill:",
            );
            expect(result.stdout).toContain(
                "The package is already published and public:",
            );
            expect(result.stdout).toContain(
                "Please help me install this OO package.",
            );
            expect(result.stdout).toContain(
                "oo skills install fallback-registry-skill -y",
            );
            expect(result.stdout).not.toContain(
                "--skill fallback-registry-skill",
            );
            expect(result.stdout).not.toContain(
                "Skill: fallback-registry-skill",
            );
            expect(requests.map(request => request.url)).toEqual([
                "https://registry.oomol.com/-/oomol/package-info/fallback-registry-skill/latest?lang=en",
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("creates a temporary share for a private published skill", async () => {
        const sandbox = await createCliSandbox();
        const skillDirectoryPath = resolveLocalSkillDirectoryPath(
            sandbox,
            "private-skill",
        );
        const requests: Request[] = [];

        try {
            await writeAuthFile(sandbox);
            await writePublishedSkillFile(skillDirectoryPath, {
                packageName: "@alice/private-skill",
                skillId: "private-skill",
                version: "0.0.1",
            });

            const result = await sandbox.run(
                [
                    "skills",
                    "share",
                    "private-skill",
                    "--downloads",
                    "3",
                    "--days",
                    "2",
                    "--yes",
                ],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                blocks: [],
                                description: "Private skill",
                                isPrivate: true,
                                packageName: "@alice/private-skill",
                                packageVersion: "0.0.1",
                                title: "Private Skill",
                            }));
                        }

                        if (request.url.includes("/package-shares/share/")) {
                            return new Response(JSON.stringify({
                                shareID: "share-1",
                            }));
                        }

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain(
                "Share prompt for skill private-skill in private package @alice/private-skill:",
            );
            expect(result.stdout).toContain(
                "This private OO skill must be installed with this exact temporary share specifier:",
            );
            expect(result.stdout).toContain(
                "Package: @alice/private-skill",
            );
            expect(result.stdout).toContain(
                "Skill: private-skill",
            );
            expect(result.stdout).toContain(
                "Hub: https://hub.oomol.com/package/@alice/private-skill",
            );
            expect(result.stdout).toContain(
                "Install package specifier: @alice/private-skill#share-1",
            );
            expect(result.stdout).toContain(
                "oo skills install @alice/private-skill#share-1 --skill private-skill -y",
            );
            expect(result.stdout).toContain(
                skillInstallGuideUrl,
            );
            expect(result.stdout).not.toContain(
                "Windows PowerShell",
            );
            expect(result.stdout).not.toContain(
                "The skill is already published and public:",
            );
            expect(requests.map(request => `${request.method} ${request.url}`)).toEqual([
                "GET https://registry.oomol.com/-/oomol/package-info/%40alice%2Fprivate-skill/latest?lang=en",
                "POST https://registry.oomol.com/-/oomol/package-shares/share/%40alice%2Fprivate-skill",
            ]);
            expect(requests[1]?.headers.get("Authorization")).toBe("secret-1");
            expect(requests[1]?.headers.get("Content-Type")).toBe(
                "application/json",
            );
            await expect(requests[1]!.json()).resolves.toEqual({
                days: 2,
                downloads: 3,
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("shares a private package reference without adding a skill selector", async () => {
        const sandbox = await createCliSandbox();
        const requests: Request[] = [];

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "share", "@alice/private-package", "--days", "1", "--yes"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                blocks: [],
                                description: "Private package",
                                isPrivate: true,
                                packageName: "@alice/private-package",
                                packageVersion: "0.0.1",
                                title: "Private Package",
                            }));
                        }

                        if (request.url.includes("/package-shares/share/")) {
                            return new Response(JSON.stringify({
                                shareID: "share-package-1",
                            }));
                        }

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain(
                "Share prompt for private package @alice/private-package:",
            );
            expect(result.stdout).toContain(
                "This private OO package must be installed with this exact temporary share specifier:",
            );
            expect(result.stdout).toContain(
                "Package: @alice/private-package",
            );
            expect(result.stdout).toContain(
                "Hub: https://hub.oomol.com/package/@alice/private-package",
            );
            expect(result.stdout).toContain(
                "Install package specifier: @alice/private-package#share-package-1",
            );
            expect(result.stdout).toContain(
                "Please help me install this OO package.",
            );
            expect(result.stdout).toContain(
                "oo skills install @alice/private-package#share-package-1 -y",
            );
            expect(result.stdout).not.toContain("--skill private-package");
            expect(result.stdout).not.toContain("Skill: private-package");
            expect(requests.map(request => `${request.method} ${request.url}`)).toEqual([
                "GET https://registry.oomol.com/-/oomol/package-info/%40alice%2Fprivate-package/latest?lang=en",
                "POST https://registry.oomol.com/-/oomol/package-shares/share/%40alice%2Fprivate-package",
            ]);
            await expect(requests[1]!.json()).resolves.toEqual({
                days: 1,
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("falls back to treating the reference as a package name when matched skill metadata has no package name", async () => {
        const sandbox = await createCliSandbox();
        const skillDirectoryPath = resolveLocalSkillDirectoryPath(
            sandbox,
            "fallback-skill",
        );
        const requests: Request[] = [];

        try {
            await writeAuthFile(sandbox);
            await writeSkillFile(skillDirectoryPath, [
                "---",
                "name: fallback-skill",
                "description: Use a fallback workflow.",
                "---",
                "",
            ].join("\n"));

            const result = await sandbox.run(
                ["skills", "share", "fallback-skill", "--yes"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        return new Response(JSON.stringify({
                            access: "public",
                            blocks: [],
                            description: "Fallback skill",
                            packageName: "fallback-skill",
                            packageVersion: "0.0.1",
                            title: "Fallback Skill",
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain(
                "Share prompt for public package fallback-skill:",
            );
            expect(result.stdout).toContain(
                "oo skills install fallback-skill -y",
            );
            expect(result.stdout).not.toContain(
                "--skill fallback-skill",
            );
            expect(result.stdout).not.toContain(
                "Skill: fallback-skill",
            );
            expect(requests.map(request => request.url)).toEqual([
                "https://registry.oomol.com/-/oomol/package-info/fallback-skill/latest?lang=en",
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("treats invalid numeric share limits as defaults and rejects non-numeric values", async () => {
        const sandbox = await createCliSandbox();
        const skillDirectoryPath = resolveLocalSkillDirectoryPath(
            sandbox,
            "numeric-skill",
        );
        const requests: Request[] = [];

        try {
            await writeAuthFile(sandbox);
            await writePublishedSkillFile(skillDirectoryPath, {
                packageName: "@alice/numeric-skill",
                skillId: "numeric-skill",
                version: "0.0.1",
            });

            const fallbackResult = await sandbox.run(
                [
                    "skills",
                    "share",
                    "numeric-skill",
                    "--downloads",
                    "0",
                    "--days",
                    "10",
                    "--yes",
                ],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                access: "private",
                                blocks: [],
                                description: "Numeric skill",
                                packageName: "@alice/numeric-skill",
                                packageVersion: "0.0.1",
                                title: "Numeric Skill",
                            }));
                        }

                        return new Response(JSON.stringify({
                            shareID: "share-2",
                        }));
                    },
                },
            );

            expect(fallbackResult.exitCode).toBe(0);
            expect(fallbackResult.stderr).toBe("");
            await expect(requests[1]!.json()).resolves.toEqual({
                days: 7,
            });

            const emptyValueRequests: Request[] = [];
            const emptyValueResult = await sandbox.run(
                [
                    "skills",
                    "share",
                    "numeric-skill",
                    "--downloads",
                    "",
                    "--days",
                    "",
                    "--yes",
                ],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        emptyValueRequests.push(request);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                access: "private",
                                blocks: [],
                                description: "Numeric skill",
                                packageName: "@alice/numeric-skill",
                                packageVersion: "0.0.1",
                                title: "Numeric Skill",
                            }));
                        }

                        return new Response(JSON.stringify({
                            shareID: "share-3",
                        }));
                    },
                },
            );

            expect(emptyValueResult.exitCode).toBe(0);
            expect(emptyValueResult.stderr).toBe("");
            await expect(emptyValueRequests[1]!.json()).resolves.toEqual({
                days: 7,
            });

            const rejectedResult = await sandbox.run(
                [
                    "skills",
                    "share",
                    "numeric-skill",
                    "--downloads",
                    "abc",
                    "--yes",
                ],
                {
                    fetcher: async () => {
                        throw new Error("non-numeric input should fail before fetching");
                    },
                },
            );

            expect(rejectedResult.exitCode).toBe(2);
            expect(rejectedResult.stdout).toBe("");
            expect(rejectedResult.stderr).toBe(
                "Invalid value for --downloads: abc. Use a number.\n",
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
    return resolveManagedSkillDirectoryPath(
        resolveCodexHomeDirectory(sandbox.env),
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
    await Bun.write(
        resolveManagedSkillMetadataFilePath(directoryPath),
        renderSkillMetadataJson(createLocalSkillMetadata()),
    );
}

async function writeSkillFile(
    directoryPath: string,
    content: string,
): Promise<void> {
    await mkdir(directoryPath, { recursive: true });
    await Bun.write(join(directoryPath, "SKILL.md"), content);
}
