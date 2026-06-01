import { describe, expect, test } from "bun:test";

import {
    installedRegistrySkillCompatibility,
    normalizeInstalledRegistrySkillMarkdown,
    ooNoticeEndMarker,
    ooNoticeStartMarker,
    removeManagedOoSkillArtifacts,
} from "./registry-skill-markdown.ts";

const legacyOoNotice = [
    ooNoticeStartMarker,
    "",
    "Important: legacy cloud task execution guidance.",
    "",
    ooNoticeEndMarker,
].join("\n");

describe("registry skill markdown", () => {
    test("adds compatibility without injecting execution guidance", () => {
        const content = [
            "---",
            "name: chatgpt",
            "description: Chat with a model",
            "metadata:",
            "  title: ChatGPT",
            "---",
            "",
            "# ChatGPT",
            "",
            "Use the connector workflow.",
            "",
        ].join("\n");

        const result = normalizeInstalledRegistrySkillMarkdown(
            content,
            {
                description: "Chat with a model",
                name: "chatgpt",
                title: "ChatGPT",
            },
            "openai",
        );

        expect(result).toBe(
            `${[
                "---",
                "name: chatgpt",
                "description: Chat with a model",
                `compatibility: ${JSON.stringify(installedRegistrySkillCompatibility)}`,
                "metadata:",
                "  title: ChatGPT",
                "---",
                "",
                "# ChatGPT",
                "",
                "Use the connector workflow.",
            ].join("\n")}\n`,
        );
    });

    test("creates a minimal frontmatter when the skill file does not have one", () => {
        const result = normalizeInstalledRegistrySkillMarkdown(
            "# ChatGPT\n",
            {
                description: "Chat with a model",
                name: "chatgpt",
                title: "ChatGPT",
            },
            "openai",
        );

        expect(result).toBe(
            `${[
                "---",
                "name: chatgpt",
                "description: \"Chat with a model\"",
                `compatibility: ${JSON.stringify(installedRegistrySkillCompatibility)}`,
                "metadata:",
                "  title: \"ChatGPT\"",
                "---",
                "",
                "# ChatGPT",
            ].join("\n")}\n`,
        );
    });

    test("does not rewrite backticked oo self references", () => {
        const content = [
            "---",
            "name: chatgpt",
            "description: \"Mention oo::self::summarize in prose.\"",
            "---",
            "",
            "# ChatGPT",
            "",
            "Use `oo::self::summarize` for the primary workflow.",
            "Keep `oo::text-tools::chat` unchanged.",
            "",
        ].join("\n");

        const result = normalizeInstalledRegistrySkillMarkdown(
            content,
            {
                description: "Chat with a model",
                name: "chatgpt",
                title: "ChatGPT",
            },
            "@oomol/text-tools",
        );

        expect(result).toBe(
            `${[
                "---",
                "name: chatgpt",
                "description: \"Mention oo::self::summarize in prose.\"",
                `compatibility: ${JSON.stringify(installedRegistrySkillCompatibility)}`,
                "---",
                "",
                "# ChatGPT",
                "",
                "Use `oo::self::summarize` for the primary workflow.",
                "Keep `oo::text-tools::chat` unchanged.",
            ].join("\n")}\n`,
        );
    });

    test("strips a legacy managed OO notice block during normalize", () => {
        const content = [
            "---",
            "name: chatgpt",
            "description: \"Chat with a model\"",
            "---",
            "",
            "# ChatGPT",
            "",
            legacyOoNotice,
            "",
            "Keep the connector workflow.",
            "",
        ].join("\n");

        const result = normalizeInstalledRegistrySkillMarkdown(
            content,
            {
                description: "Chat with a model",
                name: "chatgpt",
                title: "ChatGPT",
            },
            "openai",
        );

        expect(result).not.toContain(ooNoticeStartMarker);
        expect(result).not.toContain("cloud task execution guidance");
        expect(result).toContain("# ChatGPT");
        expect(result).toContain("Keep the connector workflow.");
    });

    test("removes managed OO artifacts from skill markdown", () => {
        const result = removeManagedOoSkillArtifacts([
            "---",
            "name: chatgpt",
            "description: \"Chat with a model\"",
            `compatibility: ${JSON.stringify(installedRegistrySkillCompatibility)}`,
            "metadata:",
            "  title: ChatGPT",
            "---",
            "",
            "# ChatGPT",
            "",
            "Keep this introduction.",
            "",
            legacyOoNotice,
            "",
            "Keep this tail.",
            "",
        ].join("\n"));

        expect(result).toBe([
            "---",
            "name: chatgpt",
            "description: \"Chat with a model\"",
            "metadata:",
            "  title: ChatGPT",
            "---",
            "",
            "# ChatGPT",
            "",
            "Keep this introduction.",
            "",
            "Keep this tail.",
            "",
        ].join("\n"));
    });

    test("keeps custom compatibility when removing managed OO artifacts", () => {
        const content = [
            "---",
            "name: chatgpt",
            "description: \"Chat with a model\"",
            "compatibility: Requires a custom runtime.",
            "---",
            "",
            "# ChatGPT",
            "",
        ].join("\n");

        expect(removeManagedOoSkillArtifacts(content)).toBe(content);
    });
});
