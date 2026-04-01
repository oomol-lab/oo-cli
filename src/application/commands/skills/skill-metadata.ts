export interface ParsedSkillMetadataWithVersion {
    fields: Readonly<Record<string, unknown>>;
    version: string;
}

export function parseSkillMetadataWithVersion(
    content: string,
): ParsedSkillMetadataWithVersion | undefined {
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

    const fields = parsedContent as Record<string, unknown>;
    const rawVersion = fields.version;

    if (typeof rawVersion !== "string") {
        return undefined;
    }

    const version = rawVersion.trim();

    if (version === "") {
        return undefined;
    }

    return {
        fields,
        version,
    };
}

export function renderSkillMetadataJson(
    metadata: object,
): string {
    return `${JSON.stringify(metadata, null, 2)}\n`;
}
