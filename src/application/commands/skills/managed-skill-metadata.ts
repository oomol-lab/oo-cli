import { readFile } from "node:fs/promises";

import { resolveManagedSkillMetadataFilePath } from "./managed-skill-paths.ts";

export interface ManagedSkillMetadata {
    packageName?: string;
    version: string;
}

export function parseManagedSkillMetadataContent(
    content: string,
): ManagedSkillMetadata | undefined {
    let parsedContent: unknown;

    try {
        parsedContent = JSON.parse(content);
    }
    catch {
        return undefined;
    }

    if (
        typeof parsedContent !== "object"
        || parsedContent === null
        || Array.isArray(parsedContent)
    ) {
        return undefined;
    }

    const rawVersion = (parsedContent as Record<string, unknown>).version;

    if (typeof rawVersion !== "string" || rawVersion.trim() === "") {
        return undefined;
    }

    const rawPackageName = (parsedContent as Record<string, unknown>).packageName;

    if (rawPackageName !== undefined && typeof rawPackageName !== "string") {
        return undefined;
    }

    if (typeof rawPackageName === "string" && rawPackageName.trim() === "") {
        return undefined;
    }

    return {
        packageName: typeof rawPackageName === "string" ? rawPackageName : undefined,
        version: rawVersion.trim(),
    };
}

export function renderManagedSkillMetadataContent(
    metadata: ManagedSkillMetadata,
): string {
    return `${JSON.stringify(metadata, null, 2)}\n`;
}

export async function readManagedSkillMetadata(
    skillDirectoryPath: string,
): Promise<ManagedSkillMetadata | undefined> {
    try {
        return parseManagedSkillMetadataContent(
            await readFile(
                resolveManagedSkillMetadataFilePath(skillDirectoryPath),
                "utf8",
            ),
        );
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return undefined;
        }

        throw error;
    }
}

export async function writeManagedSkillMetadata(
    skillDirectoryPath: string,
    metadata: ManagedSkillMetadata,
): Promise<void> {
    await Bun.write(
        resolveManagedSkillMetadataFilePath(skillDirectoryPath),
        renderManagedSkillMetadataContent(metadata),
    );
}

function isNodeNotFoundError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
