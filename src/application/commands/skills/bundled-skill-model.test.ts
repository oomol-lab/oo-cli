import type { AppSettings } from "../../schemas/settings.ts";

import { describe, expect, test } from "bun:test";

import {
    canUninstallManagedBundledSkillInstallation,
    isBundledSkillInstallationCurrentState,
    parseBundledSkillMetadataContent,
    readImplicitInvocationValue,
    renderBundledSkillFileContent,
    renderSkillMetadataJson,
    resolveBundledSkillInstallConflict,
    resolveBundledSkillManagedSynchronizationAction,
    writeImplicitInvocationValue,
} from "./bundled-skill-model.ts";

describe("bundled skill model", () => {
    test("renders the ownership policy file with the configured implicit invocation value", () => {
        const settings: AppSettings = {
            skills: {
                oo: {
                    implicit_invocation: false,
                },
            },
        };
        const content = [
            "policy:",
            "  allow_implicit_invocation: true",
            "",
        ].join("\n");

        expect(
            renderBundledSkillFileContent(
                "oo",
                "agents/openai.yaml",
                content,
                settings,
            ),
        ).toContain("allow_implicit_invocation: false");
        expect(
            renderBundledSkillFileContent("oo", "SKILL.md", "skill\n", settings),
        ).toBe("skill\n");
    });

    test("reads and writes the implicit invocation value while preserving CRLF formatting", () => {
        const content = [
            "policy:",
            "  allow_implicit_invocation: true",
            "",
        ].join("\r\n");

        expect(readImplicitInvocationValue(content)).toBeTrue();
        expect(writeImplicitInvocationValue(content, false)).toBe(
            [
                "policy:",
                "  allow_implicit_invocation: false",
                "",
            ].join("\r\n"),
        );
        expect(writeImplicitInvocationValue("allow_implicit_invocation: true\n", false)).toBe(
            "allow_implicit_invocation: false\n",
        );
    });

    test("parses and renders bundled skill metadata content", () => {
        expect(parseBundledSkillMetadataContent("{\"version\":\" 1.2.3 \"}\n")).toEqual({
            version: "1.2.3",
        });
        expect(parseBundledSkillMetadataContent("{\"version\":\"\"}\n")).toBeUndefined();
        expect(parseBundledSkillMetadataContent("not json")).toBeUndefined();
        expect(parseBundledSkillMetadataContent("[]")).toBeUndefined();
        expect(parseBundledSkillMetadataContent("{}")).toBeUndefined();
        expect(parseBundledSkillMetadataContent("{\"version\":1}")).toBeUndefined();
        expect(renderSkillMetadataJson({ version: "1.2.3" })).toBe(
            "{\n  \"version\": \"1.2.3\"\n}\n",
        );
    });

    test("throws when the ownership policy file does not define implicit invocation", () => {
        expect(() => writeImplicitInvocationValue("policy:\n", false)).toThrow(
            "Missing allow_implicit_invocation in bundled skill policy file.",
        );
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

    test("resolves synchronization actions for managed installations", () => {
        expect(resolveBundledSkillManagedSynchronizationAction({
            desiredImplicitInvocation: true,
            installedImplicitInvocation: true,
            isCurrentInstallation: false,
        })).toBe("sync-installation");
        expect(resolveBundledSkillManagedSynchronizationAction({
            desiredImplicitInvocation: true,
            installedImplicitInvocation: true,
            isCurrentInstallation: true,
        })).toBe("skip-current");
        expect(resolveBundledSkillManagedSynchronizationAction({
            desiredImplicitInvocation: false,
            installedImplicitInvocation: true,
            isCurrentInstallation: true,
        })).toBe("sync-policy");
    });

    test("evaluates current-state and uninstall decisions from precomputed facts", () => {
        expect(isBundledSkillInstallationCurrentState({
            hasAllBundledFiles: true,
            hasMetadataFile: true,
            installedVersion: "1.2.3",
            isManagedInstallation: true,
            version: "1.2.3",
        })).toBeTrue();
        expect(isBundledSkillInstallationCurrentState({
            hasAllBundledFiles: true,
            hasMetadataFile: false,
            installedVersion: "1.2.3",
            isManagedInstallation: true,
            version: "1.2.3",
        })).toBeFalse();

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
