import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    expectTelemetryFreeOfTeamIdentity,
    toRequest,
    writeAuthFile,
} from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";
import {
    parseTelemetryRowPayload,
    readTelemetryRowsForTest,
} from "../../telemetry/outbox.ts";

const teamsResponse = {
    teams: [
        {
            id: "team-1",
            name: "acme",
            avatar: "",
            creator_user_id: "user-1",
            role: "creator",
        },
        {
            id: "team-2",
            name: "beta",
            role: "member",
        },
    ],
};

describe("teamCommand CLI", () => {
    test("lists accessible teams as JSON and marks the configured default", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await sandbox.run(["config", "set", "identity.team", "acme"]);

            const requests: Request[] = [];
            const result = await sandbox.run(["team", "list", "--json"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify(teamsResponse));
                },
            });
            const telemetryPayload = readTelemetryRowsForTest(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
            )
                .map(row => parseTelemetryRowPayload(row))
                .find(payload => payload?.properties?.command_full === "team.list");

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe(
                "https://relation-control.oomol.com/v1/me/teams",
            );
            expect(requests[0]?.headers.get("authorization")).toBe("secret-1");
            expect(JSON.parse(result.stdout)).toEqual([
                { name: "acme", id: "team-1", role: "creator", current: true },
                { name: "beta", id: "team-2", role: "member", current: false },
            ]);
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "team.list",
                    result_count_bucket: "1-5",
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("team");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders accessible teams as an aligned text table", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["team", "list"], {
                fetcher: async () => new Response(JSON.stringify(teamsResponse)),
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("acme");
            expect(result.stdout).toContain("beta");
            expect(result.stdout).toContain("creator");
            expect(result.stdout).toContain("member");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports personal identity when the account has no teams", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["team", "list"], {
                fetcher: async () => new Response(JSON.stringify({ teams: [] })),
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("personal identity");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails to list teams without an account", async () => {
        const sandbox = await createCliSandbox();

        try {
            let requested = false;
            const result = await sandbox.run(["team", "list"], {
                fetcher: async () => {
                    requested = true;

                    return new Response(JSON.stringify({ teams: [] }));
                },
            });

            expect(result.exitCode).toBe(1);
            expect(requested).toBe(false);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("shows the default team identity via current", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await sandbox.run(["config", "set", "identity.team", "acme"]);

            const jsonResult = await sandbox.run(["team", "current", "--json"]);
            const textResult = await sandbox.run(["team", "current"]);

            expect(jsonResult.exitCode).toBe(0);
            expect(JSON.parse(jsonResult.stdout)).toEqual({
                team: "acme",
                teamId: null,
                source: "config",
            });
            expect(textResult.stdout).toContain("acme");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports personal identity via current when no default is configured", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const jsonResult = await sandbox.run(["team", "current", "--json"]);
            const textResult = await sandbox.run(["team", "current"]);

            expect(jsonResult.exitCode).toBe(0);
            expect(JSON.parse(jsonResult.stdout)).toEqual({
                team: null,
                teamId: null,
                source: null,
            });
            expect(textResult.stdout).toContain("personal identity");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("sets the default team with use after checking membership", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const useResult = await sandbox.run(["team", "use", "beta"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify(teamsResponse));
                },
            });
            const currentResult = await sandbox.run(["team", "current", "--json"]);

            expect(useResult.exitCode).toBe(0);
            expect(requests).toHaveLength(1);
            expect(JSON.parse(currentResult.stdout)).toEqual({
                team: "beta",
                teamId: null,
                source: "config",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects use for a team the account cannot access", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["team", "use", "ghost"], {
                fetcher: async () => new Response(JSON.stringify(teamsResponse)),
            });
            const currentResult = await sandbox.run(["team", "current", "--json"]);

            expect(result.exitCode).toBe(1);
            expect(JSON.parse(currentResult.stdout)).toEqual({
                team: null,
                teamId: null,
                source: null,
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("clears the default team identity", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await sandbox.run(["config", "set", "identity.team", "acme"]);

            const clearResult = await sandbox.run(["team", "clear"]);
            const currentResult = await sandbox.run(["team", "current", "--json"]);

            expect(clearResult.exitCode).toBe(0);
            expect(JSON.parse(currentResult.stdout)).toEqual({
                team: null,
                teamId: null,
                source: null,
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports already-personal when clearing with no configured team", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["team", "clear"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("personal identity");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports the OO_TEAM_ID env override via current", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await sandbox.run(["config", "set", "identity.team", "acme"]);
            sandbox.env.OO_TEAM_ID = "team-1";

            const jsonResult = await sandbox.run(["team", "current", "--json"]);
            const textResult = await sandbox.run(["team", "current"]);
            const telemetryPayload = readTelemetryRowsForTest(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
            )
                .map(row => parseTelemetryRowPayload(row))
                .find(payload => payload?.properties?.command_full === "team.current");

            expect(jsonResult.exitCode).toBe(0);
            expect(JSON.parse(jsonResult.stdout)).toEqual({
                team: null,
                teamId: "team-1",
                source: "env_id",
            });
            expect(textResult.stdout).toContain("OO_TEAM_ID");
            expect(textResult.stdout).toContain("team-1");
            // The configured default is reported as inactive.
            expect(textResult.stdout).toContain("acme");
            expect(telemetryPayload).toMatchObject({
                properties: {
                    has_configured_team: true,
                    team_source: "env_id",
                },
            });
            // Only the source enum is reported: neither the env-selected id
            // nor the configured team name reaches telemetry.
            expectTelemetryFreeOfTeamIdentity(
                telemetryPayload?.properties,
                ["team-1", "acme"],
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports the OO_TEAM_NAME env override via current without resolving it", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await sandbox.run(["config", "set", "identity.team", "acme"]);
            sandbox.env.OO_TEAM_NAME = "beta";

            let requested = false;
            const jsonResult = await sandbox.run(["team", "current", "--json"], {
                fetcher: async () => {
                    requested = true;

                    return new Response(JSON.stringify(teamsResponse));
                },
            });
            const textResult = await sandbox.run(["team", "current"]);
            const telemetryPayload = readTelemetryRowsForTest(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
            )
                .map(row => parseTelemetryRowPayload(row))
                .find(payload => payload?.properties?.command_full === "team.current");

            expect(jsonResult.exitCode).toBe(0);
            expect(JSON.parse(jsonResult.stdout)).toEqual({
                team: "beta",
                teamId: null,
                source: "env_name",
            });
            // `team current` stays offline even under the env override.
            expect(requested).toBe(false);
            expect(textResult.stdout).toContain("OO_TEAM_NAME");
            expect(textResult.stdout).toContain("beta");
            // The ignored config default is reported alongside.
            expect(textResult.stdout).toContain("acme");
            expect(telemetryPayload).toMatchObject({
                properties: {
                    has_configured_team: true,
                    team_source: "env_name",
                },
            });
            expectTelemetryFreeOfTeamIdentity(
                telemetryPayload?.properties,
                ["beta", "acme"],
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("marks the env-selected team as current in the listing", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await sandbox.run(["config", "set", "identity.team", "acme"]);
            sandbox.env.OO_TEAM_ID = "team-2";

            const result = await sandbox.run(["team", "list", "--json"], {
                fetcher: async () => new Response(JSON.stringify(teamsResponse)),
            });

            expect(result.exitCode).toBe(0);
            // The env override outranks the configured default, so the marker
            // follows the id from OO_TEAM_ID instead of the `acme` name.
            expect(JSON.parse(result.stdout)).toEqual([
                { name: "acme", id: "team-1", role: "creator", current: false },
                { name: "beta", id: "team-2", role: "member", current: true },
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("hints that the env override still outranks a newly set default", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            sandbox.env.OO_TEAM_NAME = "acme";

            const result = await sandbox.run(["team", "use", "beta"], {
                fetcher: async () => new Response(JSON.stringify(teamsResponse)),
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Set the default team identity to beta.");
            expect(result.stdout).toContain("OO_TEAM_NAME");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("hints that the env override still selects a team after clearing", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await sandbox.run(["config", "set", "identity.team", "acme"]);
            sandbox.env.OO_TEAM_ID = "team-1";

            const clearResult = await sandbox.run(["team", "clear"]);
            const repeatResult = await sandbox.run(["team", "clear"]);

            expect(clearResult.exitCode).toBe(0);
            expect(clearResult.stdout).toContain("OO_TEAM_ID");
            // The saved default is gone, but the env override still selects a
            // team, so the output must not claim connector commands now run
            // personally — it reports the override instead.
            expect(clearResult.stdout).toContain("Cleared the default team identity");
            expect(clearResult.stdout).not.toContain(
                "connector commands now run under your personal identity",
            );
            // The follow-up clear has nothing to remove but still points at
            // the env override instead of promising a personal identity.
            expect(repeatResult.exitCode).toBe(0);
            expect(repeatResult.stdout).toContain("OO_TEAM_ID");
            expect(repeatResult.stdout).not.toContain("personal identity");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
