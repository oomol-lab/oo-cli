import { describe, expect, test } from "bun:test";

import { createTextBuffer } from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { writeManagedSkillInstallSummary } from "./install-output.ts";

describe("skills install output", () => {
    test("renders agents before skills when both detail lines are present", () => {
        const stdout = createTextBuffer();

        writeManagedSkillInstallSummary(
            {
                stdout: stdout.writer,
                translator: createTranslator("en"),
            },
            createMultiSkillMultiAgentSummaries(),
        );

        expect(stdout.read()).toBe(
            [
                "Installed 2 skills to 2 agents.",
                "Agents: Universal, Claude Code",
                "Skills: chatgpt, vision",
                "",
            ].join("\n"),
        );
    });

    test("renders plural skills in Chinese multi-skill summaries", () => {
        const stdout = createTextBuffer();

        writeManagedSkillInstallSummary(
            {
                stdout: stdout.writer,
                translator: createTranslator("zh"),
            },
            createMultiSkillMultiAgentSummaries(),
        );

        const firstLine = stdout.read().split("\n")[0]!;

        expect(firstLine).toContain("skills");
        expect(firstLine).not.toContain("skill ");
    });
});

function createMultiSkillMultiAgentSummaries() {
    return [
        {
            name: "chatgpt",
            publications: [
                {
                    agentName: "universal",
                    path: "/tmp/universal/skills/chatgpt",
                },
                {
                    agentName: "claude",
                    path: "/tmp/claude/skills/chatgpt",
                },
            ],
        },
        {
            name: "vision",
            publications: [
                {
                    agentName: "universal",
                    path: "/tmp/universal/skills/vision",
                },
                {
                    agentName: "claude",
                    path: "/tmp/claude/skills/vision",
                },
            ],
        },
    ] as const;
}
