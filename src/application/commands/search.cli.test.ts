import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
    readLatestLogContent,
    toRequest,
    writeAuthFile,
} from "../../../__tests__/helpers.ts";
import { APP_NAME } from "../config/app-config.ts";
import {
    parseTelemetryRowPayload,
    readTelemetryRowsForTest,
} from "../telemetry/outbox.ts";

describe("searchCommand CLI", () => {
    test("searches connector actions with text output", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["search", "send mail"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        return new Response(JSON.stringify({
                            success: true,
                            message: "ok",
                            data: [
                                {
                                    authenticated: true,
                                    description: "Send a Gmail message.",
                                    name: "send_mail",
                                    service: "gmail",
                                },
                            ],
                        }));
                    },
                },
            );
            const logContent = await readLatestLogContent(sandbox);
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
            expect(requests.map(request => request.url).sort()).toEqual([
                "https://connector.oomol.com/v1/actions/search?q=send+mail",
            ]);
            expect(logContent).not.toContain("/v1/packages/-/intent-search");
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "search",
                    query_length_bucket: "6-20",
                    result_count_bucket: "1-5",
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("keyword_count_bucket");
            expect(telemetryPayload?.properties).not.toHaveProperty("query");
            expect(telemetryPayload?.properties).not.toHaveProperty("text");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("sends the team identity header and records its source when --team is given", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["search", "send mail", "--team", "acme"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            success: true,
                            message: "ok",
                            data: [
                                {
                                    authenticated: true,
                                    description: "Send a Gmail message.",
                                    name: "send_mail",
                                    service: "gmail",
                                },
                            ],
                        }));
                    },
                },
            );
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(1);
            // The action list is identity-independent, but the team identity is
            // forwarded so the backend scopes each result's authenticated flag.
            expect(requests[0]?.url).toBe(
                "https://connector.oomol.com/v1/actions/search?q=send+mail",
            );
            expect(requests[0]?.headers.get("x-oo-team-name")).toBe("acme");
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "search",
                    identity_source: "flag",
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("team");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("validates the OO_TEAM_ID env team and sends both identity headers", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            sandbox.env.OO_TEAM_ID = "team-1";

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["search", "send mail"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (new URL(request.url).pathname.startsWith("/v1/teams/")) {
                            return new Response(JSON.stringify({
                                id: "team-1",
                                name: "acme",
                                role: "member",
                                system_created: false,
                            }));
                        }

                        return new Response(JSON.stringify({
                            success: true,
                            message: "ok",
                            data: [],
                        }));
                    },
                },
            );
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(result.exitCode).toBe(0);
            // The id is validated and completed first, then the search request
            // carries both identity dimensions.
            expect(requests).toHaveLength(2);
            expect(requests[0]?.url).toBe(
                "https://relation-control.oomol.com/v1/teams/team-1",
            );
            expect(requests[1]?.headers.get("x-oo-team-id")).toBe("team-1");
            expect(requests[1]?.headers.get("x-oo-team-name")).toBe("acme");
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "search",
                    identity_source: "env_id",
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports connector search with json output", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["search", "send mail", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/v1/actions/search")) {
                            return new Response(JSON.stringify({
                                success: true,
                                message: "ok",
                                data: [
                                    {
                                        authenticated: false,
                                        description: "Send a Gmail message.",
                                        inputSchema: {
                                            type: "object",
                                        },
                                        name: "send_mail",
                                        outputSchema: {
                                            type: "object",
                                        },
                                        service: "gmail",
                                    },
                                ],
                            }));
                        }

                        return new Response(JSON.stringify({
                            data: [],
                        }));
                    },
                },
            );

            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
            // Schema payloads warm the local action schema cache but stay out
            // of the search output contract.
            expect(JSON.parse(result.stdout)).toEqual([
                {
                    authenticated: false,
                    description: "Send a Gmail message.",
                    name: "send_mail",
                    service: "gmail",
                },
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders no-results output when there are no connector actions", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["search", "send mail"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        data: [],
                    })),
                },
            );

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders search help when text argument is omitted", async () => {
        const sandbox = await createCliSandbox();

        try {
            const expectedHelp = await sandbox.run(["search", "--help"]);
            const result = await sandbox.run(["search"]);

            expect({
                expectedHelp: createCliSnapshot(expectedHelp),
                result: createCliSnapshot(result),
            }).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
