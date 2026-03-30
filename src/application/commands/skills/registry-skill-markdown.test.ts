import { describe, expect, test } from "bun:test";

import {
    installedRegistrySkillCompatibility,
    normalizeInstalledRegistrySkillMarkdown,
    renderOoPackageExecutionGuidance,
} from "./registry-skill-markdown.ts";

describe("registry skill markdown", () => {
    const guidance = renderOoPackageExecutionGuidance();

    test("adds compatibility and places the guidance immediately after the title", () => {
        const content = [
            "---",
            "name: chatgpt",
            "description: >-",
            "  Chat with a model",
            "metadata:",
            "  title: ChatGPT",
            "---",
            "",
            "# ChatGPT",
            "",
            "Use `oo::text-tools::chat` for the remote workflow.",
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
            [
                "---",
                "name: chatgpt",
                "description: >-",
                "  Chat with a model",
                `compatibility: ${JSON.stringify(installedRegistrySkillCompatibility)}`,
                "metadata:",
                "  title: ChatGPT",
                "---",
                "",
                "# ChatGPT",
                "",
                guidance,
                "",
                "Use `oo::text-tools::chat` for the remote workflow.",
                "",
            ].join("\n"),
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
            [
                "---",
                "name: chatgpt",
                "description: \"Chat with a model\"",
                `compatibility: ${JSON.stringify(installedRegistrySkillCompatibility)}`,
                "metadata:",
                "  title: \"ChatGPT\"",
                "---",
                "",
                "# ChatGPT",
                "",
                guidance,
                "",
            ].join("\n"),
        );
    });

    test("places the oo execution note at the start when the body has no title", () => {
        const result = normalizeInstalledRegistrySkillMarkdown(
            [
                "---",
                "name: chatgpt",
                "description: \"Chat with a model\"",
                "---",
                "",
                "Use `oo::text-tools::chat` for the remote workflow.",
                "",
            ].join("\n"),
            {
                description: "Chat with a model",
                name: "chatgpt",
                title: "ChatGPT",
            },
            "openai",
        );

        expect(result).toBe(
            [
                "---",
                "name: chatgpt",
                "description: \"Chat with a model\"",
                `compatibility: ${JSON.stringify(installedRegistrySkillCompatibility)}`,
                "---",
                "",
                guidance,
                "",
                "Use `oo::text-tools::chat` for the remote workflow.",
                "",
            ].join("\n"),
        );
    });

    test("moves the guidance to immediately follow the title", () => {
        const content = [
            "---",
            "name: chatgpt",
            "description: \"Chat with a model\"",
            `compatibility: ${JSON.stringify(installedRegistrySkillCompatibility)}`,
            "---",
            "",
            "# ChatGPT",
            "",
            "Use `oo::text-tools::chat` for the remote workflow.",
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
            [
                "---",
                "name: chatgpt",
                "description: \"Chat with a model\"",
                `compatibility: ${JSON.stringify(installedRegistrySkillCompatibility)}`,
                "---",
                "",
                "# ChatGPT",
                "",
                guidance,
                "",
                "Use `oo::text-tools::chat` for the remote workflow.",
                "",
            ].join("\n"),
        );
    });
});
