import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { collectAgents } from "./info.ts";
import {
    availableBundledSkillAgentNames,
    resolveManagedSkillAgentHomeDirectory,
} from "./skills/managed-skill-agents.ts";
import { resolveManagedSkillsDirectoryPath } from "./skills/managed-skill-paths.ts";

describe("collectAgents", () => {
    let homeDirectory: string;

    beforeEach(async () => {
        homeDirectory = join(tmpdir(), `oo-info-${Bun.randomUUIDv7()}`);
        await mkdir(homeDirectory, { recursive: true });
    });

    afterEach(async () => {
        await rm(homeDirectory, { force: true, recursive: true });
    });

    test("reports not_installed when the agent home directory is missing", async () => {
        const env = createEnv(homeDirectory);
        const agents = await collectAgents(env);
        const claudeAgent = findAgent(agents, "claude");

        expect(claudeAgent.status).toBe("not_installed");
        expect(claudeAgent.skillDir).toBe(
            resolveManagedSkillsDirectoryPath(
                resolveManagedSkillAgentHomeDirectory(env, "claude"),
            ),
        );
    });

    test("reports no_skills when the agent home exists but the skill directory does not", async () => {
        const env = createEnv(homeDirectory);
        const claudeHome = resolveManagedSkillAgentHomeDirectory(env, "claude");
        await mkdir(claudeHome, { recursive: true });

        const agents = await collectAgents(env);
        const claudeAgent = findAgent(agents, "claude");

        expect(claudeAgent.status).toBe("no_skills");
    });

    test("reports available when both the agent home and the skill directory exist", async () => {
        const env = createEnv(homeDirectory);
        const claudeHome = resolveManagedSkillAgentHomeDirectory(env, "claude");
        await mkdir(resolveManagedSkillsDirectoryPath(claudeHome), {
            recursive: true,
        });

        const agents = await collectAgents(env);
        const claudeAgent = findAgent(agents, "claude");

        expect(claudeAgent.status).toBe("available");
    });

    test("returns one entry per supported skill agent in registered order", async () => {
        const env = createEnv(homeDirectory);
        const agents = await collectAgents(env);

        expect(agents.map(agent => agent.id)).toEqual([
            ...availableBundledSkillAgentNames,
        ]);
    });
});

function createEnv(home: string): Record<string, string | undefined> {
    return {
        HOME: home,
        USERPROFILE: home,
    };
}

function findAgent(
    agents: Awaited<ReturnType<typeof collectAgents>>,
    id: string,
): Awaited<ReturnType<typeof collectAgents>>[number] {
    const found = agents.find(agent => agent.id === id);

    if (!found) {
        throw new Error(`Expected info agent entry for ${id}.`);
    }

    return found;
}
