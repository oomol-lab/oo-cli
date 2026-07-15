import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
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
            expect(JSON.parse(jsonResult.stdout)).toEqual({ team: "acme" });
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
            expect(JSON.parse(jsonResult.stdout)).toEqual({ team: null });
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
            expect(JSON.parse(currentResult.stdout)).toEqual({ team: "beta" });
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
            expect(JSON.parse(currentResult.stdout)).toEqual({ team: null });
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
            expect(JSON.parse(currentResult.stdout)).toEqual({ team: null });
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
});
