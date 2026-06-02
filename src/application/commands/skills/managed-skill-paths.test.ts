import { join, posix, win32 } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    isManagedSkillPathContained,
    isPathWithinDirectory,
    managedSkillMetadataFileName,
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillCanonicalRootDirectoryPath,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
    resolveManagedSkillsDirectoryPath,
} from "./managed-skill-paths.ts";

describe("managed skill paths", () => {
    test("resolves the Universal installation directory for any skill name", () => {
        expect(resolveManagedSkillDirectoryPath("/tmp/.agents", "chatgpt")).toBe(
            join("/tmp/.agents", "skills", "chatgpt"),
        );
    });

    test("resolves the Universal skills root directory", () => {
        expect(resolveManagedSkillsDirectoryPath("/tmp/.agents")).toBe(
            join("/tmp/.agents", "skills"),
        );
    });

    test("resolves the canonical config directory for any skill name", () => {
        expect(
            resolveManagedSkillCanonicalDirectoryPath(
                "/tmp/config/settings.toml",
                "chatgpt",
            ),
        ).toBe(join("/tmp/config", "skills", "registry", "chatgpt"));
    });

    test("resolves the canonical skills root directory", () => {
        expect(
            resolveManagedSkillCanonicalRootDirectoryPath(
                "/tmp/config/settings.toml",
            ),
        ).toBe(join("/tmp/config", "skills", "registry"));
    });

    test("keeps contained managed skill paths and rejects escaping ones", () => {
        expect(
            isManagedSkillPathContained(
                "/tmp/.agents",
                "/tmp/config/settings.toml",
                "chatgpt",
            ),
        ).toBeTrue();
        expect(
            isManagedSkillPathContained(
                "/tmp/.agents",
                "/tmp/config/settings.toml",
                ".hidden",
            ),
        ).toBeTrue();
        expect(
            isManagedSkillPathContained(
                "/tmp/.agents",
                "/tmp/config/settings.toml",
                "..foo",
            ),
        ).toBeTrue();
        expect(
            isManagedSkillPathContained(
                "/tmp/.agents",
                "/tmp/config/settings.toml",
                "../..",
            ),
        ).toBeFalse();
        expect(
            isManagedSkillPathContained(
                "/tmp/.agents",
                "/tmp/config/settings.toml",
                "../../outside",
            ),
        ).toBeFalse();
    });

    test("detects escaping paths in posix and win32 mode", () => {
        expect(
            isPathWithinDirectory(
                "/tmp/.agents/skills",
                "/tmp/.agents/skills/.hidden",
                posix,
            ),
        ).toBeTrue();
        expect(
            isPathWithinDirectory(
                "/tmp/.agents/skills",
                "/tmp/.agents",
                posix,
            ),
        ).toBeFalse();
        expect(
            isPathWithinDirectory(
                "C:\\agents\\skills",
                "C:\\agents\\skills\\..foo",
                win32,
            ),
        ).toBeTrue();
        expect(
            isPathWithinDirectory(
                "C:\\agents\\skills",
                "D:\\elsewhere",
                win32,
            ),
        ).toBeFalse();
    });

    test("resolves the managed skill metadata file path", () => {
        expect(
            resolveManagedSkillMetadataFilePath(
                join("/tmp/config", "skills", "chatgpt"),
            ),
        ).toBe(
            join(
                "/tmp/config",
                "skills",
                "chatgpt",
                managedSkillMetadataFileName,
            ),
        );
    });
});
