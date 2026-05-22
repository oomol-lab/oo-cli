import { tmpdir } from "node:os";
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
            "universal",
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
            "universal, codex, claude, hermes, codebuddy, workbuddy, trae, trae-cn, openclaw, qoderwork, deepseek-tui",
        );
        expect(compareManagedSkillAgentNames("universal", "codex")).toBeLessThan(0);
        expect(compareManagedSkillAgentNames("codex", "claude")).toBeLessThan(0);
        expect(compareManagedSkillAgentNames("deepseek-tui", "qoderwork")).toBeGreaterThan(0);
    });

    test("resolves default and explicit home directories", () => {
        const codexHomeDirectory = join(tmpdir(), "codex-home");
        const openClawHomeDirectory = join(tmpdir(), "openclaw-home");
        const userHomeDirectory = join(tmpdir(), "user-home");
        const env = {
            CODEX_HOME: codexHomeDirectory,
            HERMES_HOME: " ",
            HOME: userHomeDirectory,
            OPENCLAW_HOME: openClawHomeDirectory,
        };

        expect(resolveManagedSkillAgentHomeDirectory(env, "codex")).toBe(
            codexHomeDirectory,
        );
        expect(resolveManagedSkillAgentHomeDirectory(env, "universal")).toBe(
            join(userHomeDirectory, ".agents"),
        );
        expect(resolveManagedSkillAgentHomeDirectory(env, "hermes")).toBe(
            join(userHomeDirectory, ".hermes"),
        );
        expect(resolveManagedSkillAgentHomeDirectory(env, "openclaw")).toBe(
            openClawHomeDirectory,
        );
        expect(resolveManagedSkillAgentHomeDirectory(env, "deepseek-tui")).toBe(
            join(userHomeDirectory, ".deepseek"),
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
        const missingHomeDirectory = join(tmpdir(), "trae-cn");
        const error = createManagedSkillAgentNotInstalledError(
            "trae-cn",
            missingHomeDirectory,
            {
                t: (key: string) => `label:${key}`,
            },
        );

        expect(error).toMatchObject({
            exitCode: 1,
            key: "errors.skills.agentNotInstalled",
            params: {
                agentName: "label:skills.list.host.trae-cn",
                path: missingHomeDirectory,
            },
        });
    });
});
