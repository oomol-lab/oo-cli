import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    availableBundledSkillAgentNames,
    compareManagedSkillAgentNames,
    createManagedSkillAgentNotInstalledError,
    formatSupportedSkillAgentNames,
    parseManagedSkillAgentOption,
    readManagedSkillAgentLabel,
    resolveManagedSkillAgentHomeDirectory,
} from "./managed-skill-agents.ts";

describe("managed skill agents", () => {
    test("exposes supported agents in display order", () => {
        expect([...availableBundledSkillAgentNames]).toEqual([
            "codex",
            "claude",
            "hermes",
            "codebuddy",
            "workbuddy",
            "trae",
            "trae-cn",
            "openclaw",
            "qoderwork",
            "deepseek-tui",
        ]);
        expect(formatSupportedSkillAgentNames()).toBe(
            "codex, claude, hermes, codebuddy, workbuddy, trae, trae-cn, openclaw, qoderwork, deepseek-tui",
        );
        expect(compareManagedSkillAgentNames("codex", "claude")).toBeLessThan(0);
        expect(compareManagedSkillAgentNames("deepseek-tui", "qoderwork")).toBeGreaterThan(0);
    });

    test("resolves default and explicit home directories", () => {
        const env = {
            CODEX_HOME: "/tmp/codex-home",
            HERMES_HOME: " ",
            HOME: "/tmp/user-home",
            OPENCLAW_HOME: "/tmp/openclaw-home",
        };

        expect(resolveManagedSkillAgentHomeDirectory(env, "codex")).toBe(
            "/tmp/codex-home",
        );
        expect(resolveManagedSkillAgentHomeDirectory(env, "hermes")).toBe(
            join("/tmp/user-home", ".hermes"),
        );
        expect(resolveManagedSkillAgentHomeDirectory(env, "openclaw")).toBe(
            "/tmp/openclaw-home",
        );
        expect(resolveManagedSkillAgentHomeDirectory(env, "deepseek-tui")).toBe(
            join("/tmp/user-home", ".deepseek"),
        );
    });

    test("derives labels from agent names", () => {
        const translator = {
            t: (key: string) => `label:${key}`,
        };

        expect(readManagedSkillAgentLabel("deepseek-tui", translator)).toBe(
            "label:skills.list.host.deepseek-tui",
        );
        expect(readManagedSkillAgentLabel("trae-cn", translator)).toBe(
            "label:skills.list.host.trae-cn",
        );
    });

    test("parses supported agent options with the generated agent list", () => {
        expect(parseManagedSkillAgentOption(undefined, "error.key")).toBeUndefined();
        expect(parseManagedSkillAgentOption("openclaw", "error.key")).toBe("openclaw");
        expect(() => parseManagedSkillAgentOption("unknown", "error.key"))
            .toThrowError(expect.objectContaining({
                key: "error.key",
                params: {
                    agents: formatSupportedSkillAgentNames(),
                    value: "unknown",
                },
            }));
    });

    test("creates generic not-installed errors with translated labels", () => {
        const error = createManagedSkillAgentNotInstalledError(
            "trae-cn",
            "/tmp/trae-cn",
            {
                t: (key: string) => `label:${key}`,
            },
        );

        expect(error).toMatchObject({
            exitCode: 1,
            key: "errors.skills.agentNotInstalled",
            params: {
                agentName: "label:skills.list.host.trae-cn",
                path: "/tmp/trae-cn",
            },
        });
    });
});
