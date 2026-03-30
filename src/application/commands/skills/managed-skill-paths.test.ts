import { describe, expect, test } from "bun:test";

import {
    managedSkillMetadataFileName,
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";

describe("managed skill paths", () => {
    test("resolves the Codex installation directory for any skill name", () => {
        expect(resolveManagedSkillDirectoryPath("/tmp/.codex", "chatgpt")).toBe(
            "/tmp/.codex/skills/chatgpt",
        );
    });

    test("resolves the canonical config directory for any skill name", () => {
        expect(
            resolveManagedSkillCanonicalDirectoryPath(
                "/tmp/config/settings.toml",
                "chatgpt",
            ),
        ).toBe("/tmp/config/skills/chatgpt");
    });

    test("resolves the managed skill metadata file path", () => {
        expect(
            resolveManagedSkillMetadataFilePath("/tmp/config/skills/chatgpt"),
        ).toBe(`/tmp/config/skills/chatgpt/${managedSkillMetadataFileName}`);
    });
});
