import type { AppSettings } from "../../schemas/settings.ts";

import type {
    BundledSkillAgentName,
    BundledSkillName,
} from "./embedded-assets.ts";
import { getSkillImplicitInvocation } from "../../schemas/settings.ts";
import { resolveBundledSkillOwnershipFileRelativePath } from "./bundled-skill-paths.ts";
import { parseSkillMetadataWithVersion } from "./skill-metadata.ts";

const bundledSkillImplicitInvocationKey = "allow_implicit_invocation";

export interface BundledSkillMetadata {
    version: string;
}

export const bundledSkillDevelopmentVersion = "0.0.0-development";

export type BundledSkillInstallConflict = "nameConflict" | "storageConflict";

export type BundledSkillManagedSynchronizationAction
    = "skip-current" | "sync-installation" | "sync-policy";

export function resolveBundledSkillInstallConflict(input: {
    canonicalDirectoryExists: boolean;
    canonicalDirectoryManaged: boolean;
    installedDirectoryExists: boolean;
    installedDirectoryManaged: boolean;
}): BundledSkillInstallConflict | undefined {
    if (input.installedDirectoryExists && !input.installedDirectoryManaged) {
        return "nameConflict";
    }

    if (input.canonicalDirectoryExists && !input.canonicalDirectoryManaged) {
        return "storageConflict";
    }

    return undefined;
}

export function resolveBundledSkillManagedSynchronizationAction(input: {
    desiredImplicitInvocation: boolean | undefined;
    installedImplicitInvocation: boolean | undefined;
    isCurrentInstallation: boolean;
}): BundledSkillManagedSynchronizationAction {
    if (!input.isCurrentInstallation) {
        return "sync-installation";
    }

    if (input.desiredImplicitInvocation === undefined) {
        return "skip-current";
    }

    if (input.installedImplicitInvocation === input.desiredImplicitInvocation) {
        return "skip-current";
    }

    return "sync-policy";
}

export function canUninstallManagedBundledSkillInstallation(input: {
    installedDirectoryExists: boolean;
    installedDirectoryManaged: boolean;
}): boolean {
    return input.installedDirectoryExists && input.installedDirectoryManaged;
}

export function resolveBundledSkillImplicitInvocation(
    skillName: BundledSkillName,
    settings: AppSettings,
): boolean {
    return getSkillImplicitInvocation(settings, skillName);
}

export function renderBundledSkillFileContent(
    skillName: BundledSkillName,
    relativePath: string,
    content: string,
    settings: AppSettings,
    agentName: BundledSkillAgentName = "codex",
): string {
    const ownershipFileRelativePath = resolveBundledSkillOwnershipFileRelativePath(
        agentName,
    );

    if (
        ownershipFileRelativePath === undefined
        || relativePath !== ownershipFileRelativePath
    ) {
        return content;
    }

    return writeImplicitInvocationValue(
        content,
        resolveBundledSkillImplicitInvocation(skillName, settings),
    );
}

export function readImplicitInvocationValue(
    content: string,
): boolean | undefined {
    for (const line of content.split("\n")) {
        const trimmedLine = line.trim();

        if (!trimmedLine.startsWith(`${bundledSkillImplicitInvocationKey}:`)) {
            continue;
        }

        const rawValue = trimmedLine
            .slice(bundledSkillImplicitInvocationKey.length + 1)
            .trim();

        if (rawValue === "true") {
            return true;
        }

        if (rawValue === "false") {
            return false;
        }

        return undefined;
    }

    return undefined;
}

export function writeImplicitInvocationValue(
    content: string,
    value: boolean,
): string {
    const lineSeparator = content.includes("\r\n") ? "\r\n" : "\n";
    const lines = content.split(lineSeparator);

    for (const [index, line] of lines.entries()) {
        const trimmedLine = line.trim();

        if (!trimmedLine.startsWith(`${bundledSkillImplicitInvocationKey}:`)) {
            continue;
        }

        const indentation = line.slice(0, line.length - line.trimStart().length);

        lines[index] = [
            indentation,
            bundledSkillImplicitInvocationKey,
            ": ",
            value ? "true" : "false",
        ].join("");

        return lines.join(lineSeparator);
    }

    throw new Error(
        `Missing ${bundledSkillImplicitInvocationKey} in bundled skill policy file.`,
    );
}

export function parseBundledSkillMetadataContent(
    content: string,
): BundledSkillMetadata | undefined {
    const parsedMetadata = parseSkillMetadataWithVersion(content);

    if (parsedMetadata === undefined) {
        return undefined;
    }

    return {
        version: parsedMetadata.version,
    };
}

export function isBundledSkillInstallationCurrentState(input: {
    hasAllBundledFiles: boolean;
    hasMetadataFile: boolean;
    installedVersion: string | undefined;
    isManagedInstallation: boolean;
    version: string;
}): boolean {
    return input.isManagedInstallation
        && input.hasMetadataFile
        && input.installedVersion === input.version
        && input.hasAllBundledFiles;
}
