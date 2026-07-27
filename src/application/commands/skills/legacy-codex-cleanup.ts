import type { CliExecutionContext } from "../../contracts/cli.ts";

import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveHomeDirectory } from "../../path/home-directory.ts";
import { isNodeNotFoundError, removePath } from "./bundled-skill-filesystem.ts";
import {
    canonicalBundledSkillsDirectoryName,
    managedSkillsDirectoryName,
} from "./bundled-skill-paths.ts";
import { readSkillDirectoryState } from "./skill-directory-state.ts";

// Home directory name and environment override of the now-removed Codex agent.
const legacyCodexHomeDirectoryName = ".codex";
const legacyCodexHomeEnvVar = "CODEX_HOME";

// Canonical bundled storage subdirectory the removed Codex agent owned, under
// `<config>/skills/bundled/<agent>`.
const legacyCodexCanonicalAgentName = "codex";

type LegacyCodexCleanupContext = Pick<
    CliExecutionContext,
    "env" | "logger" | "settingsStore"
>;

/**
 * TODO(codex-removal): Temporary compatibility cleanup. Remove this file and
 * its call site in `run-cli.ts` once enough releases have shipped that no user
 * still has oo-managed skills under the legacy Codex home.
 *
 * The Codex agent used to receive oo-managed skills under `~/.codex/skills`
 * (or `$CODEX_HOME/skills`) and kept its bundled canonical sources under
 * `<config>/skills/bundled/codex`. Codex now reads the universal `~/.agents`
 * skills location, and the Codex app does not deduplicate it against
 * `~/.codex/skills`, so leaving the old copies behind surfaces duplicate
 * skills. This routine deletes only the skills oo itself materialized there,
 * identified strictly by their `.oo-metadata.json` (bundled or registry
 * metadata); user-authored (local) and unmanaged directories are preserved.
 */
export async function removeLegacyCodexManagedSkills(
    context: LegacyCodexCleanupContext,
): Promise<void> {
    // Best-effort cleanup: run both branches to completion and never short-circuit
    // on the first failure, so a failing branch cannot leave the other unfinished.
    const results = await Promise.allSettled([
        removeLegacyCodexHomeManagedSkills(context),
        removeLegacyCodexCanonicalBundledStorage(context),
    ]);

    for (const result of results) {
        if (result.status === "rejected") {
            context.logger.warn(
                { err: result.reason },
                "Legacy Codex managed skill cleanup failed.",
            );
        }
    }
}

function resolveLegacyCodexHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    const explicitHome = env[legacyCodexHomeEnvVar]?.trim();

    if (explicitHome !== undefined && explicitHome !== "") {
        return explicitHome;
    }

    return join(resolveHomeDirectory(env), legacyCodexHomeDirectoryName);
}

async function removeLegacyCodexHomeManagedSkills(
    context: LegacyCodexCleanupContext,
): Promise<void> {
    const skillsDirectoryPath = join(
        resolveLegacyCodexHomeDirectory(context.env),
        managedSkillsDirectoryName,
    );
    const entryNames = await readSkillDirectoryEntryNames(skillsDirectoryPath);

    await Promise.all(
        entryNames.map(entryName =>
            removeLegacyCodexManagedSkill(
                join(skillsDirectoryPath, entryName),
                entryName,
                context,
            ),
        ),
    );
}

async function removeLegacyCodexManagedSkill(
    skillDirectoryPath: string,
    skillName: string,
    context: LegacyCodexCleanupContext,
): Promise<void> {
    try {
        if (!(await isOoManagedSkillDirectory(skillDirectoryPath))) {
            return;
        }

        await removePath(skillDirectoryPath);
        context.logger.info(
            { path: skillDirectoryPath, skillName },
            "Removed oo-managed skill from the legacy Codex home directory.",
        );
    }
    catch (error) {
        context.logger.warn(
            { err: error, path: skillDirectoryPath, skillName },
            "Failed to remove oo-managed skill from the legacy Codex home directory.",
        );
    }
}

async function removeLegacyCodexCanonicalBundledStorage(
    context: LegacyCodexCleanupContext,
): Promise<void> {
    // `<config>/skills/bundled/codex` only ever held oo-managed bundled
    // canonical sources for the removed Codex agent, so it is removed wholesale.
    const canonicalCodexBundledDirectoryPath = join(
        dirname(context.settingsStore.getFilePath()),
        managedSkillsDirectoryName,
        canonicalBundledSkillsDirectoryName,
        legacyCodexCanonicalAgentName,
    );

    try {
        await removePath(canonicalCodexBundledDirectoryPath);
    }
    catch (error) {
        context.logger.warn(
            { err: error, path: canonicalCodexBundledDirectoryPath },
            "Failed to remove legacy Codex canonical bundled storage.",
        );
    }
}

async function isOoManagedSkillDirectory(
    skillDirectoryPath: string,
): Promise<boolean> {
    const state = await readSkillDirectoryState(skillDirectoryPath);

    return state.kind === "managed"
        && (state.metadata.kind === "bundled"
            || state.metadata.kind === "registry");
}

async function readSkillDirectoryEntryNames(
    skillsDirectoryPath: string,
): Promise<string[]> {
    try {
        return (await readdir(skillsDirectoryPath, { withFileTypes: true }))
            .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
            .map(entry => entry.name);
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return [];
        }

        throw error;
    }
}
