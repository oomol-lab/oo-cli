import type { CliSandbox } from "../../../../../__tests__/helpers.ts";
import type {
    BundledSkillAgentName,
    BundledSkillName,
} from "../embedded-assets.ts";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { resolveStorePaths } from "../../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../../config/app-config.ts";
import {
    getBundledSkillFiles,
    readBundledSkillFileContent,
} from "../embedded-assets.ts";
import { resolveManagedSkillAgentHomeDirectory } from "../managed-skill-agents.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "../managed-skill-paths.ts";
import {
    createBundledSkillMetadata,
    createRegistrySkillMetadata,
    renderSkillMetadataJson,
} from "../skill-metadata.ts";

export type SymbolicLinkKindForTest = "directory" | "file";

export function getBundledSkillSourcePath(
    skillName: BundledSkillName,
    relativePath: string,
    agentName: BundledSkillAgentName = "universal",
): string {
    const file = getBundledSkillFiles(skillName, agentName).find(file =>
        file.relativePath === relativePath,
    );

    if (file === undefined) {
        throw new Error(
            `Missing bundled skill file: ${agentName}/${skillName}/${relativePath}`,
        );
    }

    return file.sourcePath;
}

export async function readBundledSkillSourceContent(
    skillName: BundledSkillName,
    relativePath: string,
    agentName: BundledSkillAgentName = "universal",
): Promise<string> {
    const file = getBundledSkillFiles(skillName, agentName).find(file =>
        file.relativePath === relativePath,
    );

    if (file === undefined) {
        throw new Error(
            `Missing bundled skill file: ${agentName}/${skillName}/${relativePath}`,
        );
    }

    return await readBundledSkillFileContent(file);
}

export async function createSymbolicLinkForTest(
    targetPath: string,
    linkPath: string,
    kind: SymbolicLinkKindForTest,
): Promise<void> {
    if (kind === "file" && process.platform !== "win32") {
        await Bun.write(targetPath, "secret\n");
        await symlink(targetPath, linkPath);
        return;
    }

    // Windows CI does not grant file symlink privileges. Junctions still report
    // as symbolic links through lstat(), which is the branch these tests cover.
    await mkdir(targetPath, { recursive: true });
    await Bun.write(join(targetPath, "secret.txt"), "secret\n");

    await symlink(
        targetPath,
        linkPath,
        process.platform === "win32" ? "junction" : "dir",
    );
}

// Builds a registry package-info HTTP response body for fetcher mocks.
export function packageInfoResponse(
    packageName: string,
    version: string,
    skillName: string,
): Response {
    return new Response(JSON.stringify({
        packageName,
        version,
        skills: [
            {
                description: "demo",
                name: skillName,
                title: skillName,
            },
        ],
    }));
}

// Seeds a host directory carrying bundled metadata under the given skill
// name, without a canonical copy. Used to exercise same-name collisions with
// registry skills (bundled and registry are distinct skill identities).
export async function seedBundledHostSkill(options: {
    sandbox: CliSandbox;
    skillName: string;
    version: string;
    agent?: "universal" | "claude";
}): Promise<{ hostDirectory: string }> {
    const agent = options.agent ?? "universal";
    const homeDirectory = resolveManagedSkillAgentHomeDirectory(options.sandbox.env, agent);
    const hostDirectory = resolveManagedSkillDirectoryPath(homeDirectory, options.skillName);

    await mkdir(hostDirectory, { recursive: true });
    await writeFile(join(hostDirectory, "SKILL.md"), `# ${options.skillName}\n`);
    await writeFile(
        resolveManagedSkillMetadataFilePath(hostDirectory),
        renderSkillMetadataJson(createBundledSkillMetadata(options.version)),
    );

    return { hostDirectory };
}

// Seeds an oo-managed registry skill (canonical copy plus one host install) so
// install/inventory/update/recommend flows observe it as installed.
export async function seedRegistrySkill(options: {
    sandbox: CliSandbox;
    skillName: string;
    packageName: string;
    version: string;
    agent?: "universal" | "claude";
    hostSkillMd?: string;
}): Promise<{
    hostDirectory: string;
    canonicalDirectory: string;
}> {
    const agent = options.agent ?? "universal";
    const homeDirectory = resolveManagedSkillAgentHomeDirectory(options.sandbox.env, agent);
    const hostDirectory = resolveManagedSkillDirectoryPath(homeDirectory, options.skillName);
    const storePaths = resolveStorePaths({
        appName: APP_NAME,
        env: options.sandbox.env,
        platform: process.platform,
    });
    const canonicalDirectory = resolveManagedSkillCanonicalDirectoryPath(
        storePaths.settingsFilePath,
        options.skillName,
    );

    await mkdir(homeDirectory, { recursive: true });
    await mkdir(canonicalDirectory, { recursive: true });
    await mkdir(hostDirectory, { recursive: true });

    const skillMd = options.hostSkillMd ?? "# Demo\n";

    await writeFile(join(canonicalDirectory, "SKILL.md"), "# Demo\n");
    await writeFile(join(hostDirectory, "SKILL.md"), skillMd);
    await writeFile(
        resolveManagedSkillMetadataFilePath(canonicalDirectory),
        renderSkillMetadataJson(createRegistrySkillMetadata({
            packageName: options.packageName,
            version: options.version,
        })),
    );
    await writeFile(
        resolveManagedSkillMetadataFilePath(hostDirectory),
        renderSkillMetadataJson(createRegistrySkillMetadata({
            packageName: options.packageName,
            version: options.version,
        })),
    );

    return { hostDirectory, canonicalDirectory };
}
