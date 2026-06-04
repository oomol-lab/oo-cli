import type { ManagedSkillHost } from "./managed-skill-hosts.ts";
import type { ManagedSkillListItem } from "./managed-skill-listings.ts";

import {
    listManagedSkillInstallations,
    listManagedSkillInstallationsForHosts,
} from "./managed-skill-listings.ts";
import {
    resolveManagedSkillCanonicalRootDirectoryPath,
} from "./managed-skill-paths.ts";

// Collects the managed skills oo knows about by merging the canonical install
// root with the per-host installations. Host listings take precedence over the
// canonical copy when a skill name collides, and entries without metadata are
// dropped so callers only ever see managed (bundled/registry/local) skills.
export async function readKnownManagedSkillInstallations(
    availableHosts: readonly ManagedSkillHost[],
    settingsFilePath: string,
): Promise<ManagedSkillListItem[]> {
    const [canonicalSkills, hostSkills] = await Promise.all([
        listManagedSkillInstallations(
            resolveManagedSkillCanonicalRootDirectoryPath(settingsFilePath),
        ),
        listManagedSkillInstallationsForHosts(availableHosts),
    ]);
    const byName = new Map<string, ManagedSkillListItem>();

    for (const skill of [...hostSkills, ...canonicalSkills]) {
        if (skill.metadata !== undefined && !byName.has(skill.name)) {
            byName.set(skill.name, {
                metadata: skill.metadata,
                name: skill.name,
                path: skill.path,
            });
        }
    }

    return Array.from(byName.values());
}
