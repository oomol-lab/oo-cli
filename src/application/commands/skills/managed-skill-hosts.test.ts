import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../../__tests__/helpers.ts";
import { resolveAvailableManagedSkillHosts } from "./managed-skill-hosts.ts";

describe("resolveAvailableManagedSkillHosts", () => {
    test("always includes the universal host even when its home directory does not exist", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-managed-hosts");
        const env = { HOME: rootDirectory, USERPROFILE: rootDirectory };

        try {
            const hosts = await resolveAvailableManagedSkillHosts(env);

            expect(hosts.map(host => host.agentName)).toEqual(["universal"]);
            expect(hosts[0]!.homeDirectory).toBe(join(rootDirectory, ".agents"));
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("includes non-always-provision hosts only when their home directory exists", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-managed-hosts");
        const env = { HOME: rootDirectory, USERPROFILE: rootDirectory };

        try {
            await mkdir(join(rootDirectory, ".claude"), { recursive: true });

            const hosts = await resolveAvailableManagedSkillHosts(env);
            const agentNames = hosts.map(host => host.agentName);

            // universal is always provisioned; claude is included because its home
            // exists; hermes is excluded because its home does not.
            expect(agentNames).toContain("universal");
            expect(agentNames).toContain("claude");
            expect(agentNames).not.toContain("hermes");
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });
});
