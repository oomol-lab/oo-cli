import { describe, expect, test } from "bun:test";

import { getBundledSkillFiles, readBundledSkillFileContent } from "./embedded-assets.ts";
import { parseSkillMarkdownMatter } from "./skill-frontmatter.ts";

// Hermes builds its system-prompt skill index by truncating each skill
// description to `desc[:57] + "..."`, so only the first 57 characters reach the
// model. The bundled `oo` description must therefore front-load its highest
// signal routing categories within that budget rather than keep the whole
// description short. See https://github.com/oomol-lab/oo-cli/issues/304.
const hermesSkillIndexPrefixLength = 57;

async function readBundledOoDescription(): Promise<string> {
    const skillFile = getBundledSkillFiles("oo", "hermes").find(
        file => file.relativePath === "SKILL.md",
    );
    expect(skillFile).toBeDefined();

    const { data } = parseSkillMarkdownMatter(
        await readBundledSkillFileContent(skillFile!),
    );

    expect(typeof data.description).toBe("string");

    return data.description as string;
}

describe("bundled oo skill Hermes index prefix", () => {
    test("front-loads the connected accounts, APIs, hosted AI, Flow, and OOMOL routing signals within the Hermes truncation budget", async () => {
        const description = await readBundledOoDescription();
        const indexPrefix = description
            .slice(0, hermesSkillIndexPrefixLength)
            .toLowerCase();

        expect(indexPrefix).toContain("connected account");
        expect(indexPrefix).toContain("api");
        expect(indexPrefix).toContain("hosted ai");
        expect(indexPrefix).toContain("flow");
        expect(indexPrefix).toContain("oomol");
    });

    test("keeps the full description detailed instead of narrowing it to a single service", async () => {
        const description = await readBundledOoDescription();
        const indexPrefix = description
            .slice(0, hermesSkillIndexPrefixLength)
            .toLowerCase();

        // The detailed routing guidance is allowed to remain far longer than the
        // Hermes index budget; only the prefix is length-constrained.
        expect(description.length).toBeGreaterThan(hermesSkillIndexPrefixLength);

        // The prefix must not collapse the broad routing signal onto one service.
        expect(indexPrefix).not.toContain("gmail");
        expect(indexPrefix).not.toContain("email");
    });
});
