import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../../__tests__/helpers.ts";
import { createDirectorySymbolicLinkForTest } from "./__tests__/helpers.ts";
import { resolveAvailableManagedSkillHosts } from "./managed-skill-hosts.ts";

describe("resolveAvailableManagedSkillHosts", () => {
    test("always includes the universal host even when its home directory does not exist", async () => {
        const hostSandbox = await createManagedSkillHostSandbox();
        const rootDirectory = hostSandbox.rootDirectory;

        try {
            const hosts = await resolveAvailableManagedSkillHosts(hostSandbox.env);

            expect(hosts.map(host => host.agentName)).toEqual(["universal"]);
            expect(hosts[0]!.homeDirectory).toBe(join(rootDirectory, ".agents"));
        }
        finally {
            await hostSandbox.cleanup();
        }
    });

    test("includes non-always-provision hosts only when their home directory exists", async () => {
        const hostSandbox = await createManagedSkillHostSandbox();
        const rootDirectory = hostSandbox.rootDirectory;

        try {
            await mkdir(join(rootDirectory, ".claude"), { recursive: true });

            const hosts = await resolveAvailableManagedSkillHosts(hostSandbox.env);
            const agentNames = hosts.map(host => host.agentName);

            // universal is always provisioned; claude is included because its home
            // exists; hermes is excluded because its home does not.
            expect(agentNames).toContain("universal");
            expect(agentNames).toContain("claude");
            expect(agentNames).not.toContain("hermes");
        }
        finally {
            await hostSandbox.cleanup();
        }
    });

    test("collapses hosts whose skills directories resolve to the same path", async () => {
        const hostSandbox = await createManagedSkillHostSandbox();
        const rootDirectory = hostSandbox.rootDirectory;

        try {
            const sharedSkillsDirectory = join(rootDirectory, ".shared", "skills");

            await mkdir(sharedSkillsDirectory, { recursive: true });
            await mkdir(join(rootDirectory, ".agents"), { recursive: true });
            await mkdir(join(rootDirectory, ".claude"), { recursive: true });
            await createDirectorySymbolicLinkForTest(
                sharedSkillsDirectory,
                join(rootDirectory, ".agents", "skills"),
            );
            await createDirectorySymbolicLinkForTest(
                sharedSkillsDirectory,
                join(rootDirectory, ".claude", "skills"),
            );

            const hosts = await resolveAvailableManagedSkillHosts(hostSandbox.env);

            // Both homes publish into the same directory, so they are one host;
            // the universal fallback yields to the concrete agent.
            expect(hosts.map(host => host.agentName)).toEqual(["claude"]);
            expect(hosts[0]!.homeDirectory).toBe(join(rootDirectory, ".claude"));
        }
        finally {
            await hostSandbox.cleanup();
        }
    });

    test("keeps the first concrete agent when two concrete agents share a skills directory", async () => {
        const hostSandbox = await createManagedSkillHostSandbox();
        const rootDirectory = hostSandbox.rootDirectory;

        try {
            const claudeSkillsDirectory = join(rootDirectory, ".claude", "skills");

            await mkdir(claudeSkillsDirectory, { recursive: true });
            await mkdir(join(rootDirectory, ".trae-cn"), { recursive: true });
            await createDirectorySymbolicLinkForTest(
                claudeSkillsDirectory,
                join(rootDirectory, ".trae-cn", "skills"),
            );

            const hosts = await resolveAvailableManagedSkillHosts(hostSandbox.env);

            // The universal host has its own (still missing) skills directory, so
            // only the two aliased concrete agents collapse.
            expect(hosts.map(host => host.agentName)).toEqual(["universal", "claude"]);
        }
        finally {
            await hostSandbox.cleanup();
        }
    });

    test("collapses hosts whose home directories are aliased before any skills directory exists", async () => {
        const hostSandbox = await createManagedSkillHostSandbox();
        const rootDirectory = hostSandbox.rootDirectory;

        try {
            await mkdir(join(rootDirectory, ".agents"), { recursive: true });
            await createDirectorySymbolicLinkForTest(
                join(rootDirectory, ".agents"),
                join(rootDirectory, ".claude"),
            );

            const hosts = await resolveAvailableManagedSkillHosts(hostSandbox.env);

            expect(hosts.map(host => host.agentName)).toEqual(["claude"]);
        }
        finally {
            await hostSandbox.cleanup();
        }
    });
});

// Every host test needs an empty home directory tree plus the environment that
// points home resolution at it, and must remove the tree afterwards.
async function createManagedSkillHostSandbox(): Promise<{
    cleanup: () => Promise<void>;
    env: Record<string, string | undefined>;
    rootDirectory: string;
}> {
    const rootDirectory = await createTemporaryDirectory("oo-managed-hosts");

    return {
        cleanup: async () => {
            await rm(rootDirectory, { force: true, recursive: true });
        },
        env: { HOME: rootDirectory, USERPROFILE: rootDirectory },
        rootDirectory,
    };
}
