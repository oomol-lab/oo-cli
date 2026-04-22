import type { Logger } from "pino";
import type { CliExecutionContext } from "../../contracts/cli.ts";

import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isNodeNotFoundError, removePath } from "./bundled-skill-filesystem.ts";
import {
    canonicalBundledSkillsDirectoryName,
    canonicalRegistrySkillsDirectoryName,
    codexSkillsDirectoryName,
} from "./bundled-skill-paths.ts";

type LegacyCanonicalKind
    = | "claudeSkillsRoot"
        | "legacySkillsChild"
        | "openClawSkillsRoot";

interface LegacyCanonicalCandidate {
    kind: LegacyCanonicalKind;
    path: string;
}

const legacyClaudeBundledSkillsDirectoryName = "claude-skills";
const legacyOpenClawBundledSkillsDirectoryName = "openclaw-skills";

export async function migrateLegacyCanonicalSkillLayout(
    context: Pick<CliExecutionContext, "logger" | "settingsStore">,
): Promise<void> {
    // Migration is best-effort: any failure is logged and swallowed so the
    // surrounding `skills install` flow can still run.
    const configDirectoryPath = dirname(context.settingsStore.getFilePath());
    const candidates = await collectLegacyCanonicalCandidates(
        configDirectoryPath,
        context.logger,
    );

    for (const candidate of candidates) {
        try {
            await removePath(candidate.path);
            context.logger.info(
                {
                    kind: candidate.kind,
                    path: candidate.path,
                },
                "Removed legacy canonical skill directory.",
            );
        }
        catch (error) {
            context.logger.warn(
                {
                    err: error,
                    kind: candidate.kind,
                    path: candidate.path,
                },
                "Failed to remove legacy canonical skill directory.",
            );
        }
    }
}

async function collectLegacyCanonicalCandidates(
    configDirectoryPath: string,
    logger: Pick<Logger, "warn">,
): Promise<LegacyCanonicalCandidate[]> {
    const [legacySkillsChildren, claudeRootPath, openClawRootPath] = await Promise.all([
        readLegacySkillsChildren(configDirectoryPath, logger),
        readDirectoryIfPresent(
            join(configDirectoryPath, legacyClaudeBundledSkillsDirectoryName),
            logger,
        ),
        readDirectoryIfPresent(
            join(configDirectoryPath, legacyOpenClawBundledSkillsDirectoryName),
            logger,
        ),
    ]);
    const candidates: LegacyCanonicalCandidate[] = [];

    if (claudeRootPath !== undefined) {
        candidates.push({
            kind: "claudeSkillsRoot",
            path: claudeRootPath,
        });
    }

    if (openClawRootPath !== undefined) {
        candidates.push({
            kind: "openClawSkillsRoot",
            path: openClawRootPath,
        });
    }

    for (const entryName of legacySkillsChildren) {
        candidates.push({
            kind: "legacySkillsChild",
            path: join(configDirectoryPath, codexSkillsDirectoryName, entryName),
        });
    }

    return candidates;
}

async function readLegacySkillsChildren(
    configDirectoryPath: string,
    logger: Pick<Logger, "warn">,
): Promise<string[]> {
    const skillsDirectoryPath = join(configDirectoryPath, codexSkillsDirectoryName);

    try {
        const entries = await readdir(skillsDirectoryPath, { withFileTypes: true });

        return entries
            .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
            .map(entry => entry.name)
            .filter(name =>
                name !== canonicalBundledSkillsDirectoryName
                && name !== canonicalRegistrySkillsDirectoryName,
            );
    }
    catch (error) {
        if (!isNodeNotFoundError(error)) {
            logger.warn(
                {
                    err: error,
                    path: skillsDirectoryPath,
                },
                "Failed to inspect legacy canonical skills directory.",
            );
        }

        return [];
    }
}

async function readDirectoryIfPresent(
    directoryPath: string,
    logger: Pick<Logger, "warn">,
): Promise<string | undefined> {
    try {
        await readdir(directoryPath);

        return directoryPath;
    }
    catch (error) {
        if (!isNodeNotFoundError(error)) {
            logger.warn(
                {
                    err: error,
                    path: directoryPath,
                },
                "Failed to inspect legacy canonical skills directory.",
            );
        }

        return undefined;
    }
}
