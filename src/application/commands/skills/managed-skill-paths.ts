import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
    bundledSkillMetadataFileName,
    codexSkillsDirectoryName,
} from "./bundled-skill-paths.ts";

export { bundledSkillMetadataFileName as managedSkillMetadataFileName } from "./bundled-skill-paths.ts";

interface PathOperations {
    isAbsolute: (path: string) => boolean;
    relative: (from: string, to: string) => string;
    resolve: (...paths: string[]) => string;
    sep: string;
}

const defaultPathOperations: PathOperations = {
    isAbsolute,
    relative,
    resolve,
    sep,
};

export function resolveManagedSkillsDirectoryPath(
    codexHomeDirectory: string,
): string {
    return join(codexHomeDirectory, codexSkillsDirectoryName);
}

export function resolveManagedSkillDirectoryPath(
    codexHomeDirectory: string,
    skillName: string,
): string {
    return join(resolveManagedSkillsDirectoryPath(codexHomeDirectory), skillName);
}

export function resolveManagedSkillCanonicalRootDirectoryPath(
    settingsFilePath: string,
): string {
    return join(dirname(settingsFilePath), codexSkillsDirectoryName);
}

export function resolveManagedSkillCanonicalDirectoryPath(
    settingsFilePath: string,
    skillName: string,
): string {
    return join(
        resolveManagedSkillCanonicalRootDirectoryPath(settingsFilePath),
        skillName,
    );
}

export function isPathWithinDirectory(
    baseDirectoryPath: string,
    targetPath: string,
    pathOperations: PathOperations = defaultPathOperations,
): boolean {
    const relativePath = pathOperations.relative(
        pathOperations.resolve(baseDirectoryPath),
        pathOperations.resolve(targetPath),
    );

    if (relativePath === "" || pathOperations.isAbsolute(relativePath)) {
        return false;
    }

    return relativePath.split(pathOperations.sep)[0] !== "..";
}

export function isManagedSkillPathContained(
    codexHomeDirectory: string,
    settingsFilePath: string,
    skillName: string,
): boolean {
    return isPathWithinDirectory(
        resolveManagedSkillsDirectoryPath(codexHomeDirectory),
        resolveManagedSkillDirectoryPath(codexHomeDirectory, skillName),
    ) && isPathWithinDirectory(
        resolveManagedSkillCanonicalRootDirectoryPath(settingsFilePath),
        resolveManagedSkillCanonicalDirectoryPath(settingsFilePath, skillName),
    );
}

export function resolveManagedSkillMetadataFilePath(
    skillDirectoryPath: string,
): string {
    return join(skillDirectoryPath, bundledSkillMetadataFileName);
}
