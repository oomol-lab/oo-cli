import type { BundledSkillPublicationResult } from "./bundled-skill-filesystem.ts";
import type { ExtractedRegistryPackageArchive } from "./registry-skill-archive.ts";
import type { RegistrySkillSummary } from "./registry-skill-source.ts";

import { cp, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
    publishBundledSkillInstallation,
    removePath,
} from "./bundled-skill-filesystem.ts";
import { writeManagedSkillMetadata } from "./managed-skill-metadata.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
} from "./managed-skill-paths.ts";
import { requireExtractedRegistrySkillDirectory } from "./registry-skill-archive.ts";
import { rewriteInstalledRegistrySkillMarkdown } from "./registry-skill-markdown.ts";

export interface PreparedRegistrySkillPublication {
    canonicalSkillDirectoryPath: string;
    installedSkillDirectoryPath: string;
    packageName: string;
    packageVersion: string;
    skillName: string;
}

export async function prepareRegistrySkillPublication(options: {
    codexHomeDirectory: string;
    extractedPackage: ExtractedRegistryPackageArchive;
    packageName: string;
    packageVersion: string;
    settingsFilePath: string;
    skill: RegistrySkillSummary;
    skillName: string;
}): Promise<PreparedRegistrySkillPublication> {
    const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
        options.settingsFilePath,
        options.skillName,
    );
    const installedSkillDirectoryPath = resolveManagedSkillDirectoryPath(
        options.codexHomeDirectory,
        options.skillName,
    );

    await removePath(canonicalSkillDirectoryPath);
    await mkdir(dirname(canonicalSkillDirectoryPath), { recursive: true });
    await cp(
        await requireExtractedRegistrySkillDirectory(
            options.extractedPackage,
            options.skillName,
        ),
        canonicalSkillDirectoryPath,
        {
            force: true,
            recursive: true,
        },
    );
    await rewriteInstalledRegistrySkillMarkdown(
        canonicalSkillDirectoryPath,
        options.skill,
        options.packageName,
    );
    await writeManagedSkillMetadata(
        canonicalSkillDirectoryPath,
        {
            packageName: options.packageName,
            version: options.packageVersion,
        },
    );

    return {
        canonicalSkillDirectoryPath,
        installedSkillDirectoryPath,
        packageName: options.packageName,
        packageVersion: options.packageVersion,
        skillName: options.skillName,
    };
}

export async function publishPreparedRegistrySkillPublication(
    preparedPublication: PreparedRegistrySkillPublication,
): Promise<BundledSkillPublicationResult> {
    return publishBundledSkillInstallation({
        canonicalSkillDirectoryPath: preparedPublication.canonicalSkillDirectoryPath,
        installedSkillDirectoryPath: preparedPublication.installedSkillDirectoryPath,
    });
}
