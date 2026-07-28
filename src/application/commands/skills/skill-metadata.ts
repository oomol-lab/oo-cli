import { toNonBlankString } from "./skill-frontmatter.ts";

export const skillMetadataSchemaVersion = 1;

export interface BundledSkillMetadata {
    kind: "bundled";
    schemaVersion: typeof skillMetadataSchemaVersion;
    version: string;
}

export interface RegistrySkillMetadata {
    icon?: string;
    kind: "registry";
    packageName: string;
    schemaVersion: typeof skillMetadataSchemaVersion;
    version: string;
}

export interface LocalSkillMetadata {
    kind: "local";
    schemaVersion: typeof skillMetadataSchemaVersion;
}

export type SkillMetadata
    = | BundledSkillMetadata
        | LocalSkillMetadata
        | RegistrySkillMetadata;

export function createBundledSkillMetadata(
    version: string,
): BundledSkillMetadata {
    return {
        kind: "bundled",
        schemaVersion: skillMetadataSchemaVersion,
        version,
    };
}

export function createRegistrySkillMetadata(options: {
    icon?: string;
    packageName: string;
    version: string;
}): RegistrySkillMetadata {
    return {
        ...(options.icon === undefined ? {} : { icon: options.icon }),
        kind: "registry",
        packageName: options.packageName,
        schemaVersion: skillMetadataSchemaVersion,
        version: options.version,
    };
}

export function createLocalSkillMetadata(): LocalSkillMetadata {
    return {
        kind: "local",
        schemaVersion: skillMetadataSchemaVersion,
    };
}

export function parseSkillMetadataContent(
    content: string,
): SkillMetadata | undefined {
    const fields = parseSkillMetadataFields(content);

    if (fields === undefined) {
        return undefined;
    }

    return parseTypedSkillMetadata(fields);
}

export function renderSkillMetadataJson(
    metadata: object,
): string {
    return `${JSON.stringify(metadata, null, 2)}\n`;
}

function parseSkillMetadataFields(
    content: string,
): Record<string, unknown> | undefined {
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

    return parsedContent as Record<string, unknown>;
}

function parseTypedSkillMetadata(
    fields: Readonly<Record<string, unknown>>,
): SkillMetadata | undefined {
    if (fields.schemaVersion !== skillMetadataSchemaVersion) {
        return undefined;
    }

    switch (fields.kind) {
        case "bundled":
            return parseBundledSkillMetadataFields(fields);
        case "registry":
            return parseRegistrySkillMetadataFields(fields);
        case "local":
            return createLocalSkillMetadata();
        default:
            return undefined;
    }
}

function parseBundledSkillMetadataFields(
    fields: Readonly<Record<string, unknown>>,
): BundledSkillMetadata | undefined {
    const version = toNonBlankString(fields.version);

    if (version === undefined) {
        return undefined;
    }

    return createBundledSkillMetadata(version);
}

function parseRegistrySkillMetadataFields(
    fields: Readonly<Record<string, unknown>>,
): RegistrySkillMetadata | undefined {
    const packageName = toNonBlankString(fields.packageName);
    const version = toNonBlankString(fields.version);

    if (packageName === undefined || version === undefined) {
        return undefined;
    }

    if (fields.icon !== undefined) {
        const icon = toNonBlankString(fields.icon);

        if (icon === undefined) {
            return undefined;
        }

        return createRegistrySkillMetadata({ icon, packageName, version });
    }

    return createRegistrySkillMetadata({ packageName, version });
}
