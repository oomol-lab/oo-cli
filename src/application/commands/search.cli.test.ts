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
                ["search", "send mail", "--keywords=gmail,email,gmail"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url.includes("/v1/connector-actions")) {
                            return new Response(JSON.stringify({
                                data: [
                                    {
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
                            data: ["gmail"],
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
                "https://connector.oomol.com/v1/apps/authenticated?service=gmail",
                "https://search.oomol.com/v1/connector-actions?q=send+mail&keywords=gmail%2Cemail",
            ]);
            expect(logContent).not.toContain("/v1/packages/-/intent-search");
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "search",
                    keyword_count_bucket: "1-5",
                    query_length_bucket: "6-20",
                    result_count_bucket: "1-5",
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("query");
            expect(telemetryPayload?.properties).not.toHaveProperty("text");
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

                        if (request.url.includes("/v1/connector-actions")) {
                            return new Response(JSON.stringify({
                                data: [
                                    {
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
