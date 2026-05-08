import { describe, expect, test } from "bun:test";

import {
    installedRegistrySkillCompatibility,
    normalizeInstalledRegistrySkillMarkdown,
    removeManagedOoSkillArtifacts,
    renderOoPackageExecutionGuidance,
} from "./registry-skill-markdown.ts";

describe("registry skill markdown", () => {
    const guidance = renderOoPackageExecutionGuidance();

    test("renders compact oo execution guidance for package-backed skills", () => {
        expect(guidance).toContain("minimum viable execution contract");
        expect(guidance).toContain("Do not search for extra packages");
        expect(guidance).toContain("preserve the user's concrete constraints");
        expect(guidance).toContain("Download only an explicit `resultURL`");
        expect(guidance).toContain("structured `resultData` without `resultURL`");
        expect(guidance).toContain("do not guess parameters and do not run yet");
    });

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

    test("rewrites backticked oo self references to the published package name", () => {
        const content = [
            "---",
            "name: chatgpt",
            "description: \"Mention oo::self::summarize in prose.\"",
            "---",
            "",
            "# ChatGPT",
            "",
            "Use `oo::self::summarize` for the primary workflow.",
            "Mention oo::self::summarize in prose.",
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
            [
                "---",
                "name: chatgpt",
                "description: \"Mention oo::self::summarize in prose.\"",
                `compatibility: ${JSON.stringify(installedRegistrySkillCompatibility)}`,
                "---",
                "",
                "# ChatGPT",
                "",
                guidance,
                "",
                "Use `oo::@oomol/text-tools::summarize` for the primary workflow.",
                "Mention oo::self::summarize in prose.",
                "Keep `oo::text-tools::chat` unchanged.",
                "",
            ].join("\n"),
        );
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
            guidance,
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
