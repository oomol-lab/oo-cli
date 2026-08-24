import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    toRequest,
    writeAuthFile,
} from "../../../__tests__/helpers.ts";
import { APP_NAME } from "../config/app-config.ts";
import { readTelemetryRowsForTest } from "../telemetry/outbox.ts";

const teamsResponse = {
    teams: [
        {
            id: "team-1",
            name: "acme",
            role: "creator",
            system_created: false,
        },
        {
            id: "team-2",
            name: "beta",
            role: "member",
            system_created: false,
        },
        {
            id: "team-3",
            name: "atlas",
            role: "member",
            system_created: false,
        },
        {
            id: "team-4",
            name: "ansi\u001B[31m",
            role: "member",
            system_created: false,
        },
        {
            id: "team-5",
            name: "alert\u0007",
            role: "member",
            system_created: false,
        },
        {
            id: "team-6",
            name: "alpha\u007F",
            role: "member",
            system_created: false,
        },
        {
            id: "team-7",
            name: "archive\u0085",
            role: "member",
            system_created: false,
        },
    ],
};

describe("internal completion command", () => {
    test("filters team names and reuses the cached membership list", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const requests: Request[] = [];
            const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
                requests.push(toRequest(input, init));
                return new Response(JSON.stringify(teamsResponse));
            };

            const firstResult = await sandbox.run(
                ["__complete", "team-names", "a"],
                { fetcher },
            );
            const secondResult = await sandbox.run(
                ["__complete", "team-names", "b"],
                {
                    fetcher: async () => {
                        throw new Error("cached completion should not request teams again");
                    },
                },
            );

            expect(firstResult).toEqual({
                exitCode: 0,
                stderr: "",
                stdout: "acme\natlas\n",
            });
            expect(secondResult).toEqual({
                exitCode: 0,
                stderr: "",
                stdout: "beta\n",
            });
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe(
                "https://relation-control.oomol.com/v1/me/teams",
            );
            expect(readTelemetryRowsForTest(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
            )).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("isolates cached team names by account and endpoint", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox, {
                accounts: [
                    {
                        apiKey: "secret-1",
                        endpoint: "oomol.com",
                        id: "user-1",
                        name: "Alice",
                    },
                    {
                        apiKey: "secret-2",
                        endpoint: "oomol.dev",
                        id: "user-2",
                        name: "Bob",
                    },
                ],
            });
            let requestCount = 0;
            const fetcher = async () => {
                requestCount += 1;
                return new Response(JSON.stringify({
                    teams: [{
                        id: `team-${requestCount}`,
                        name: `account-${requestCount}`,
                        role: "member",
                        system_created: false,
                    }],
                }));
            };

            const firstResult = await sandbox.run(
                ["__complete", "team-names"],
                { fetcher },
            );
            await sandbox.run(["auth", "switch", "--user", "user-2"]);
            const secondResult = await sandbox.run(
                ["__complete", "team-names"],
                { fetcher },
            );

            expect(firstResult.stdout).toBe("account-1\n");
            expect(secondResult.stdout).toBe("account-2\n");
            expect(requestCount).toBe(2);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("silently returns no candidates when lookup fails", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            let requestCount = 0;
            const result = await sandbox.run(
                ["__complete", "team-names"],
                {
                    fetcher: async () => {
                        requestCount += 1;
                        throw new Error("offline");
                    },
                },
            );

            expect(result).toEqual({
                exitCode: 0,
                stderr: "",
                stdout: "",
            });
            expect(requestCount).toBe(1);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("returns no candidates while OO_API_KEY makes team use a no-op", async () => {
        const sandbox = await createCliSandbox();

        try {
            sandbox.env.OO_API_KEY = "env-secret";
            let requested = false;
            const result = await sandbox.run(
                ["__complete", "team-names"],
                {
                    fetcher: async () => {
                        requested = true;
                        return new Response(JSON.stringify(teamsResponse));
                    },
                },
            );

            expect(result).toEqual({
                exitCode: 0,
                stderr: "",
                stdout: "",
            });
            expect(requested).toBe(false);
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
