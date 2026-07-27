import type { CliExecutionContext } from "../../contracts/cli.ts";

import { join } from "node:path";
import { removePath } from "./bundled-skill-filesystem.ts";
import { resolveAvailableManagedSkillHosts } from "./managed-skill-hosts.ts";
import { readSkillsDirectoryEntries } from "./managed-skill-listings.ts";
import {
    resolveManagedSkillCanonicalRootDirectoryPath,
    resolveManagedSkillsDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    managedMetadataOfKind,
    readSkillDirectoryState,
} from "./skill-directory-state.ts";

// Registry skill package the CLI used to ship as a built-in preset.
const legacyGptImage2PackageName = "@alwaysmavs/gpt-image-2";

type LegacyGptImage2CleanupContext = Pick<
    CliExecutionContext,
    "env" | "logger" | "settingsStore"
>;

/**
 * TODO(gpt-image-2-removal): Temporary compatibility cleanup. Remove this file
 * and its call site in `run-cli.ts` once enough releases have shipped that no
 * user still has the oo-managed `@alwaysmavs/gpt-image-2` skills materialized in
 * an AI agent or kept as canonical registry sources.
 *
 * `@alwaysmavs/gpt-image-2` used to be a built-in preset: at startup the CLI
 * downloaded the package and released its skills into every AI agent alongside
 * the bundled skills, keeping canonical registry sources under
 * `<config>/skills/registry`. That preset path is gone, so this routine deletes
 * the skills oo itself materialized for that package — both the per-agent
 * installs and the canonical sources that `synchronizeManagedSkillsForAvailableHosts`
 * would otherwise keep re-publishing. Skills are identified strictly by their
 * `.oo-metadata.json` (registry metadata whose `packageName` matches the legacy
 * preset package); user-authored and unrelated skills are preserved.
 */
export async function removeLegacyGptImage2ManagedSkills(
    context: LegacyGptImage2CleanupContext,
): Promise<void> {
    // Best-effort cleanup: run both branches to completion and never short-circuit
    // on the first failure, so a failing branch cannot leave the other unfinished.
    const results = await Promise.allSettled([
        removeLegacyGptImage2HostInstalls(context),
        removeLegacyGptImage2CanonicalSources(context),
    ]);

    for (const result of results) {
        if (result.status === "rejected") {
            context.logger.warn(
                { err: result.reason },
                "Legacy @alwaysmavs/gpt-image-2 managed skill cleanup failed.",
            );
        }
    }
}

async function removeLegacyGptImage2HostInstalls(
    context: LegacyGptImage2CleanupContext,
): Promise<void> {
    const hosts = await resolveAvailableManagedSkillHosts(context.env);

    await Promise.all(
        hosts.map(host =>
            removeLegacyGptImage2SkillsInDirectory(
                resolveManagedSkillsDirectoryPath(host.homeDirectory),
                context,
            ),
        ),
    );
}

async function removeLegacyGptImage2CanonicalSources(
    context: LegacyGptImage2CleanupContext,
): Promise<void> {
    await removeLegacyGptImage2SkillsInDirectory(
        resolveManagedSkillCanonicalRootDirectoryPath(
            context.settingsStore.getFilePath(),
        ),
        context,
    );
}

async function removeLegacyGptImage2SkillsInDirectory(
    skillsDirectoryPath: string,
    context: LegacyGptImage2CleanupContext,
): Promise<void> {
    const entryNames = await readSkillsDirectoryEntries(skillsDirectoryPath);

    await Promise.all(
        entryNames.map(entryName =>
            removeLegacyGptImage2Skill(
                join(skillsDirectoryPath, entryName),
                entryName,
                context,
            ),
        ),
    );
}

async function removeLegacyGptImage2Skill(
    skillDirectoryPath: string,
    skillName: string,
    context: LegacyGptImage2CleanupContext,
): Promise<void> {
    try {
        if (!(await isLegacyGptImage2SkillDirectory(skillDirectoryPath))) {
            return;
        }

        await removePath(skillDirectoryPath);
        context.logger.info(
            { path: skillDirectoryPath, skillName },
            "Removed oo-managed @alwaysmavs/gpt-image-2 skill.",
        );
    }
    catch (error) {
        context.logger.warn(
            { err: error, path: skillDirectoryPath, skillName },
            "Failed to remove oo-managed @alwaysmavs/gpt-image-2 skill.",
        );
    }
}

async function isLegacyGptImage2SkillDirectory(
    skillDirectoryPath: string,
): Promise<boolean> {
    // Only registry metadata is matched, so bundled and local skills (and
    // directories without `.oo-metadata.json`) never match.
    const metadata = managedMetadataOfKind(
        await readSkillDirectoryState(skillDirectoryPath),
        "registry",
    );

    return metadata?.packageName === legacyGptImage2PackageName;
}
