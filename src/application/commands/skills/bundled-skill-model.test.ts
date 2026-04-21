import { describe, expect, test } from "bun:test";

import {
    bundledSkillDevelopmentVersion,
    canUninstallManagedBundledSkillInstallation,
    parseBundledSkillMetadataContent,
    resolveBundledSkillInstallConflict,
} from "./bundled-skill-model.ts";

describe("bundled skill model", () => {
    test("parses bundled skill metadata content", () => {
        expect(parseBundledSkillMetadataContent(
            `{"version":"${bundledSkillDevelopmentVersion}"}\n`,
        )).toEqual({
            version: bundledSkillDevelopmentVersion,
        });
        expect(parseBundledSkillMetadataContent("{\"version\":\" 1.2.3 \"}\n")).toEqual({
            version: "1.2.3",
        });
        expect(parseBundledSkillMetadataContent("{\"version\":\"\"}\n")).toBeUndefined();
        expect(parseBundledSkillMetadataContent("not json")).toBeUndefined();
        expect(parseBundledSkillMetadataContent("[]")).toBeUndefined();
        expect(parseBundledSkillMetadataContent("{}")).toBeUndefined();
        expect(parseBundledSkillMetadataContent("{\"version\":1}")).toBeUndefined();
    });

    test("resolves install conflicts with the installed path taking priority over canonical storage", () => {
        expect(resolveBundledSkillInstallConflict({
            canonicalDirectoryExists: true,
            canonicalDirectoryManaged: false,
            installedDirectoryExists: false,
            installedDirectoryManaged: false,
        })).toBe("storageConflict");
        expect(resolveBundledSkillInstallConflict({
            canonicalDirectoryExists: true,
            canonicalDirectoryManaged: false,
            installedDirectoryExists: true,
            installedDirectoryManaged: false,
        })).toBe("nameConflict");
        expect(resolveBundledSkillInstallConflict({
            canonicalDirectoryExists: true,
            canonicalDirectoryManaged: true,
            installedDirectoryExists: true,
            installedDirectoryManaged: true,
        })).toBeUndefined();
    });

    test("evaluates uninstall decisions from precomputed facts", () => {
        expect(canUninstallManagedBundledSkillInstallation({
            installedDirectoryExists: true,
            installedDirectoryManaged: true,
        })).toBeTrue();
        expect(canUninstallManagedBundledSkillInstallation({
            installedDirectoryExists: true,
            installedDirectoryManaged: false,
        })).toBeFalse();
    });
});
