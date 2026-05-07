import { describe, expect, test } from "bun:test";

import { availableBundledSkillAgentNames } from "./embedded-assets.ts";
import {
    isManagedSkillPublicationCurrent,
    resolveManagedSkillPublicationMode,
} from "./managed-skill-publication.ts";

describe("managed skill publication policy", () => {
    test("allows symlink publication only for explicitly supported agents", () => {
        const modes = Object.fromEntries(
            availableBundledSkillAgentNames.map(agentName => [
                agentName,
                resolveManagedSkillPublicationMode(agentName),
            ]),
        );

        expect(modes).toEqual({
            "claude": "symlink-or-copy",
            "codebuddy": "copy",
            "codex": "symlink-or-copy",
            "hermes": "copy",
            "openclaw": "copy",
            "qoderwork": "symlink-or-copy",
            "trae": "copy",
            "trae-cn": "copy",
            "workbuddy": "copy",
        });
    });

    test("treats a missing copy-mode target as not current", async () => {
        await expect(
            isManagedSkillPublicationCurrent(
                "/tmp/oo-missing-managed-skill-publication-target",
                "copy",
            ),
        ).resolves.toBeFalse();
    });
});
