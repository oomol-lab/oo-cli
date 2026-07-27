import type { RegistrySkillMetadata } from "./skill-metadata.ts";

import { resolveManagedSkillMetadataFilePath } from "./managed-skill-paths.ts";
import {
    createRegistrySkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

export async function writeManagedSkillMetadata(
    skillDirectoryPath: string,
    metadata: Pick<RegistrySkillMetadata, "icon" | "packageName" | "version">,
): Promise<void> {
    await Bun.write(
        resolveManagedSkillMetadataFilePath(skillDirectoryPath),
        renderSkillMetadataJson(createRegistrySkillMetadata(metadata)),
    );
}
