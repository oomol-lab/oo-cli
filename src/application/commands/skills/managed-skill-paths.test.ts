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
    test("resolves the Codex installation directory for any skill name", () => {
        expect(resolveManagedSkillDirectoryPath("/tmp/.codex", "chatgpt")).toBe(
            join("/tmp/.codex", "skills", "chatgpt"),
        );
    });

    test("resolves the Codex skills root directory", () => {
        expect(resolveManagedSkillsDirectoryPath("/tmp/.codex")).toBe(
            join("/tmp/.codex", "skills"),
        );
    });

    test("resolves the canonical config directory for any skill name", () => {
        expect(
            resolveManagedSkillCanonicalDirectoryPath(
                "/tmp/config/settings.toml",
                "chatgpt",
            ),
        ).toBe(join("/tmp/config", "skills", "chatgpt"));
    });

    test("resolves the canonical skills root directory", () => {
        expect(
            resolveManagedSkillCanonicalRootDirectoryPath(
                "/tmp/config/settings.toml",
            ),
        ).toBe(join("/tmp/config", "skills"));
    });

    test("keeps contained managed skill paths and rejects escaping ones", () => {
        expect(
            isManagedSkillPathContained(
                "/tmp/.codex",
                "/tmp/config/settings.toml",
                "chatgpt",
            ),
        ).toBeTrue();
        expect(
            isManagedSkillPathContained(
                "/tmp/.codex",
                "/tmp/config/settings.toml",
                ".hidden",
            ),
        ).toBeTrue();
        expect(
            isManagedSkillPathContained(
                "/tmp/.codex",
                "/tmp/config/settings.toml",
                "..foo",
            ),
        ).toBeTrue();
        expect(
            isManagedSkillPathContained(
                "/tmp/.codex",
                "/tmp/config/settings.toml",
                "../..",
            ),
        ).toBeFalse();
        expect(
            isManagedSkillPathContained(
                "/tmp/.codex",
                "/tmp/config/settings.toml",
                "../../outside",
            ),
        ).toBeFalse();
    });

    test("detects escaping paths in posix and win32 mode", () => {
        expect(
            isPathWithinDirectory(
                "/tmp/.codex/skills",
                "/tmp/.codex/skills/.hidden",
                posix,
            ),
        ).toBeTrue();
        expect(
            isPathWithinDirectory(
                "/tmp/.codex/skills",
                "/tmp/.codex",
                posix,
            ),
        ).toBeFalse();
        expect(
            isPathWithinDirectory(
                "C:\\codex\\skills",
                "C:\\codex\\skills\\..foo",
                win32,
            ),
        ).toBeTrue();
        expect(
            isPathWithinDirectory(
                "C:\\codex\\skills",
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
