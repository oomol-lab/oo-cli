import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { RegistryPackageSkillInfo, RegistrySkillSummary } from "./registry-skill-source.ts";

import { cp, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CliUserError } from "../../contracts/cli.ts";
import { withPackageIdentity } from "../../logging/log-fields.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { removePath } from "./bundled-skill-filesystem.ts";
import {
    extractRegistryPackageArchive,
    requireExtractedRegistrySkillDirectory,
} from "./registry-skill-archive.ts";
import { rewriteInstalledRegistrySkillMarkdown } from "./registry-skill-markdown.ts";
import {
    downloadRegistryPackageTarball,
    loadRegistryPackageSkillInfo,
    tryReportRegistryPackageDownload,
} from "./registry-skill-source.ts";
import {
    normalizeSkillFilterTokens,
    selectSkillsByFilter,
} from "./skill-filter.ts";

export interface RegistrySkillExportRequest {
    outputDirectoryPath: string;
    packageName: string;
    packageShareId?: string;
    packageVersion?: string;
    // The `--skill` narrowing for the export. When provided, only the package's
    // published skills whose name matches one of these values are exported.
    skillFilter?: readonly string[];
    // Invoked with this package's published skill names when `skillFilter`
    // matched none of them. A no-match exports nothing for the package; whether
    // an empty result across all packages is an error is decided by the caller.
    reportSkillFilterMiss?: (availableSkillNames: readonly string[]) => void;
}

export interface RegistrySkillExportResult {
    files: string[];
    packageName: string;
    skillName: string;
    targetSkillDirectoryPath: string;
}

// Export published registry skills into an arbitrary directory. This mirrors the
// registry install download/extract pipeline but is pure with respect to oo
// state: it writes only inside `outputDirectoryPath`, never touches the oo
// app-data canonical storage or any agent home, and writes no `.oo-metadata.json`
// management marker. The per-skill directory is removed and recreated so stale
// files from a previous export do not linger; sibling content in the parent
// directory is left untouched.
export async function exportRegistrySkills(
    request: RegistrySkillExportRequest,
    context: CliExecutionContext,
): Promise<RegistrySkillExportResult[]> {
    const account = await requireCurrentAccount(context);
    const packageInfo = await loadRegistryPackageSkillInfo(
        request.packageName,
        account,
        context,
        request.packageVersion,
    );

    if (packageInfo.skills.length === 0) {
        throw new CliUserError("errors.skills.install.noPublishedSkills", 1, {
            packageName: packageInfo.packageName,
        });
    }

    const selectedSkills = selectExportSkills(
        packageInfo,
        request.skillFilter,
        request.reportSkillFilterMiss,
    );

    if (selectedSkills.length === 0) {
        return [];
    }

    await tryReportRegistryPackageDownload(
        packageInfo.packageName,
        packageInfo.packageVersion,
        account,
        context,
    );
    const packageBytes = await downloadRegistryPackageTarball(
        packageInfo.packageName,
        packageInfo.packageVersion,
        account,
        context,
        request.packageShareId,
    );
    const extractedPackage = await extractRegistryPackageArchive(packageBytes);

    try {
        const results: RegistrySkillExportResult[] = [];

        for (const skill of selectedSkills) {
            results.push(await exportRegistrySkill({
                context,
                extractedPackage,
                outputDirectoryPath: request.outputDirectoryPath,
                packageInfo,
                skill,
            }));
        }

        return results;
    }
    finally {
        await extractedPackage.cleanup();
    }
}

async function exportRegistrySkill(options: {
    context: Pick<CliExecutionContext, "logger">;
    extractedPackage: Awaited<ReturnType<typeof extractRegistryPackageArchive>>;
    outputDirectoryPath: string;
    packageInfo: RegistryPackageSkillInfo;
    skill: RegistrySkillSummary;
}): Promise<RegistrySkillExportResult> {
    const sourceSkillDirectoryPath = await requireExtractedRegistrySkillDirectory(
        options.extractedPackage,
        options.skill.name,
    );
    const targetSkillDirectoryPath = join(
        options.outputDirectoryPath,
        options.skill.name,
    );

    await removePath(targetSkillDirectoryPath);
    await mkdir(dirname(targetSkillDirectoryPath), { recursive: true });
    await cp(sourceSkillDirectoryPath, targetSkillDirectoryPath, {
        force: true,
        recursive: true,
    });
    await rewriteInstalledRegistrySkillMarkdown(
        targetSkillDirectoryPath,
        options.skill,
        options.packageInfo.packageName,
    );

    const files = await listExportedSkillFiles(targetSkillDirectoryPath);

    options.context.logger.info(
        {
            ...withPackageIdentity(
                options.packageInfo.packageName,
                options.packageInfo.packageVersion,
            ),
            path: targetSkillDirectoryPath,
            skillName: options.skill.name,
        },
        "Registry skill exported to directory.",
    );

    return {
        files,
        packageName: options.packageInfo.packageName,
        skillName: options.skill.name,
        targetSkillDirectoryPath,
    };
}

// Narrow the package's published skills by the `--skill` filter. Returns every
// skill when no filter is active. When the filter matches nothing, exports
// nothing and reports the package's published skill names through `reportMiss`.
function selectExportSkills(
    packageInfo: RegistryPackageSkillInfo,
    skillFilter: readonly string[] | undefined,
    reportMiss: ((availableSkillNames: readonly string[]) => void) | undefined,
): RegistrySkillSummary[] {
    const tokens = normalizeSkillFilterTokens(skillFilter);

    if (tokens === undefined) {
        return packageInfo.skills;
    }

    const selected = selectSkillsByFilter(packageInfo.skills, tokens);

    if (selected.length === 0) {
        reportMiss?.(packageInfo.skills.map(skill => skill.name));

        return [];
    }

    return selected;
}

// List the files written for an exported skill as forward-slash relative paths,
// sorted for deterministic reporting. Directories are walked recursively so
// reference files alongside SKILL.md are included.
async function listExportedSkillFiles(
    skillDirectoryPath: string,
): Promise<string[]> {
    const files: string[] = [];

    const walk = async (
        currentDirectoryPath: string,
        relativePrefix: string,
    ): Promise<void> => {
        const entries = await readdir(currentDirectoryPath, {
            withFileTypes: true,
        });

        for (const entry of entries) {
            const entryRelativePath = relativePrefix === ""
                ? entry.name
                : `${relativePrefix}/${entry.name}`;

            if (entry.isDirectory()) {
                await walk(join(currentDirectoryPath, entry.name), entryRelativePath);
                continue;
            }

            if (entry.isFile()) {
                files.push(entryRelativePath);
            }
        }
    };

    await walk(skillDirectoryPath, "");

    return files.sort();
}
