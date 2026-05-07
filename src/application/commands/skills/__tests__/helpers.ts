import type {
    BundledSkillAgentName,
    BundledSkillName,
} from "../embedded-assets.ts";
import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import {
    getBundledSkillFiles,
} from "../embedded-assets.ts";

export type SymbolicLinkKindForTest = "directory" | "file";

export function getBundledSkillSourcePath(
    skillName: BundledSkillName,
    relativePath: string,
    agentName: BundledSkillAgentName = "codex",
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
