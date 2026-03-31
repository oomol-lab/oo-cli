import type { AppSettings } from "../../schemas/settings.ts";

import type { BundledSkillName } from "./embedded-assets.ts";
import { getOoSkillImplicitInvocation } from "../../schemas/settings.ts";
import { bundledSkillOwnershipFileRelativePath } from "./bundled-skill-paths.ts";

const bundledSkillOwnershipMarker = "OOMOL";
const bundledSkillImplicitInvocationKey = "allow_implicit_invocation";

export interface BundledSkillMetadata {
    version: string;
}

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
    desiredImplicitInvocation: boolean;
    installedImplicitInvocation: boolean | undefined;
    isCurrentInstallation: boolean;
}): BundledSkillManagedSynchronizationAction {
    if (!input.isCurrentInstallation) {
        return "sync-installation";
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
    switch (skillName) {
        case "oo":
            return getOoSkillImplicitInvocation(settings);
    }
}

export function renderBundledSkillFileContent(
    skillName: BundledSkillName,
    relativePath: string,
    content: string,
    settings: AppSettings,
): string {
    if (relativePath !== bundledSkillOwnershipFileRelativePath) {
        return content;
    }

    return writeImplicitInvocationValue(
        content,
        resolveBundledSkillImplicitInvocation(skillName, settings),
    );
}

export function isManagedBundledSkillOwnershipContent(content: string): boolean {
    return content.includes(bundledSkillOwnershipMarker);
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

    if (typeof rawVersion !== "string") {
        return undefined;
    }

    const version = rawVersion.trim();

    if (version === "") {
        return undefined;
    }

    return {
        version,
    };
}

export function renderSkillMetadataJson(
    metadata: object,
): string {
    return `${JSON.stringify(metadata, null, 2)}\n`;
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
