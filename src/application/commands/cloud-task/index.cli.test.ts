import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
    readLatestLogContent,
    toRequest,
} from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";
import { createTerminalColors } from "../../terminal-colors.ts";

const searchDisplayNameColor = "#59F78D";

describe("cloudTaskCommand CLI", () => {
    test("writes package info and cloud-task request logs during task creation", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(
                ["cloud-task", "run", "foo/bar@1.2.3", "--block-id", "main"],
                {
                    fetcher: async (input) => {
                        const request = toRequest(input);

                        if (request.url.startsWith("https://registry.")) {
                            return new Response(JSON.stringify({
                                blocks: [
                                    {
                                        blockName: "main",
                                        inputHandleDefs: [],
                                        outputHandleDefs: [],
                                        title: "Main",
                                    },
                                ],
                                packageName: "foo/bar",
                                packageVersion: "1.2.3",
                                title: "Foo Bar",
                            }));
                        }

                        return new Response(JSON.stringify({
                            taskID: "task-1",
                        }));
                    },
                },
            );
            const content = await readLatestLogContent(sandbox);

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(content).toContain(`"msg":"Package info request started."`);
            expect(content).toContain(`"msg":"Package info request completed."`);
            expect(content).toContain(`"msg":"Cloud task request started."`);
            expect(content).toContain(`"msg":"Cloud task request completed."`);
            expect(content).toContain(`"packageName":"foo/bar"`);
            expect(content).toContain(`"packageVersion":"1.2.3"`);
            expect(content).toContain(`"path":"/v3/users/me/tasks"`);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports cloud-task run with json output", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "cloud-task",
                    "run",
                    "qrcode@1.0.4",
                    "-b",
                    "Exist",
                    "-d",
                    "{\"count\":3}",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url.startsWith("https://registry.")) {
                            return new Response(JSON.stringify({
                                packageName: "qrcode",
                                packageVersion: "1.0.4",
                                title: "QR Code",
                                description: "The QR Code Toolkit.",
                                blocks: [
                                    {
                                        blockName: "Exist",
                                        title: "Exist QR Code",
                                        description: "Checks whether an image contains a QR code.",
                                        inputHandleDefs: [
                                            {
                                                handle: "count",
                                                description: "Retry count",
                                                json_schema: {
                                                    type: "integer",
                                                },
                                            },
                                        ],
                                        outputHandleDefs: [],
                                    },
                                ],
                            }));
                        }

                        return new Response(JSON.stringify({
                            taskID: "550e8400-e29b-41d4-a716-446655440017",
                        }));
                    },
                },
            );

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(JSON.parse(result.stdout)).toEqual({
                taskID: "550e8400-e29b-41d4-a716-446655440017",
            });
            expect(requests).toHaveLength(2);
            expect(requests[0]?.url).toBe(
                "https://registry.oomol.com/-/oomol/package-info/qrcode/1.0.4?lang=en",
            );
            expect(requests[1]?.url).toBe(
                "https://cloud-task.oomol.com/v3/users/me/tasks",
            );
            expect(requests[1]?.method).toBe("POST");
            expect(requests[1]?.headers.get("Authorization")).toBe("secret-1");
            expect(requests[1]?.headers.get("Content-Type")).toBe("application/json");
            await expect(requests[1]?.json()).resolves.toEqual({
                blockName: "Exist",
                inputValues: {
                    count: 3,
                },
                packageName: "qrcode",
                packageVersion: "1.0.4",
                type: "serverless",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports cloud-task run dry-run with @file payloads", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );
            const payloadPath = join(sandbox.cwd, "cloud-task-payload.txt");

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );
            await Bun.write(payloadPath, "{\"secret\":\"value\"}");

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "cloud-task",
                    "run",
                    "secret-tool@1.2.3",
                    "-b",
                    "main",
                    "-d",
                    `@${payloadPath}`,
                    "--dry-run",
                ],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        return new Response(JSON.stringify({
                            packageName: "secret-tool",
                            packageVersion: "1.2.3",
                            title: "Secret Tool",
                            description: "Handles secrets.",
                            blocks: [
                                {
                                    blockName: "main",
                                    title: "Main",
                                    description: "Runs the main block.",
                                    inputHandleDefs: [
                                        {
                                            handle: "secret",
                                            description: "Secret value",
                                            json_schema: {
                                                contentMediaType: "oomol/secret",
                                                type: "string",
                                            },
                                        },
                                    ],
                                    outputHandleDefs: [],
                                },
                            ],
                        }));
                    },
                },
            );

            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe(
                "https://registry.oomol.com/-/oomol/package-info/secret-tool/1.2.3?lang=en",
            );
        }
        finally {
            await Bun.file(join(sandbox.cwd, "cloud-task-payload.txt")).delete();
            await sandbox.cleanup();
        }
    });

    test("supports cloud-task result, log, and list json output", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const requests: Request[] = [];
            const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
                const request = toRequest(input, init);

                requests.push(request);

                if (request.url.endsWith("/result")) {
                    return new Response(JSON.stringify({
                        resultData: { output: "ok" },
                        resultURL: "https://example.com/result.json",
                        status: "success",
                        traceID: "trace-1",
                    }));
                }

                if (request.url.includes("/logs")) {
                    return new Response(JSON.stringify({
                        logs: [
                            {
                                level: "info",
                                message: "running",
                            },
                        ],
                    }));
                }

                return new Response(JSON.stringify({
                    nextToken: "eyJsYXN0SWQiOiIxMjMifQ==",
                    tasks: [
                        {
                            blockName: "main",
                            createdAt: 1704067200000,
                            endTime: null,
                            failedMessage: null,
                            ownerID: "user-1",
                            packageID: "foo",
                            progress: 50,
                            resultURL: null,
                            schedulerPayload: {
                                type: "serverless",
                            },
                            startTime: null,
                            status: "running",
                            subscriptionID: null,
                            taskID: "550e8400-e29b-41d4-a716-446655440019",
                            taskType: "user",
                            updatedAt: 1704067200000,
                            workload: "serverless",
                            workloadID: "550e8400-e29b-41d4-a716-446655440020",
                        },
                    ],
                }));
            };

            const resultResponse = await sandbox.run(
                ["cloud-task", "result", "task-1", "--json"],
                {
                    fetcher,
                },
            );
            const logResponse = await sandbox.run(
                ["cloud-task", "log", "task-1", "--json", "--page=2"],
                {
                    fetcher,
                },
            );
            const listResponse = await sandbox.run(
                [
                    "cloud-task",
                    "list",
                    "--json",
                    "--size=1",
                    "--nextToken=eyJsYXN0SWQiOiIxMjMifQ==",
                    "--status=running",
                    "--package-name=foo",
                    "--block-name=main",
                ],
                {
                    fetcher,
                },
            );

            expect({
                listResponse: createCliSnapshot(listResponse),
                logResponse: createCliSnapshot(logResponse),
                resultResponse: createCliSnapshot(resultResponse),
            }).toMatchSnapshot();
            expect(JSON.parse(resultResponse.stdout)).toEqual({
                resultData: { output: "ok" },
                resultURL: "https://example.com/result.json",
                status: "success",
                traceID: "trace-1",
            });
            expect(JSON.parse(logResponse.stdout)).toEqual({
                logs: [
                    {
                        level: "info",
                        message: "running",
                    },
                ],
            });
            expect(JSON.parse(listResponse.stdout)).toEqual({
                nextToken: "eyJsYXN0SWQiOiIxMjMifQ==",
                tasks: [
                    {
                        blockName: "main",
                        createdAt: 1704067200000,
                        endTime: null,
                        failedMessage: null,
                        ownerID: "user-1",
                        packageID: "foo",
                        progress: 50,
                        resultURL: null,
                        schedulerPayload: {
                            type: "serverless",
                        },
                        startTime: null,
                        status: "running",
                        subscriptionID: null,
                        taskID: "550e8400-e29b-41d4-a716-446655440019",
                        taskType: "user",
                        updatedAt: 1704067200000,
                        workload: "serverless",
                        workloadID: "550e8400-e29b-41d4-a716-446655440020",
                    },
                ],
            });
            expect(requests.map(request => request.url)).toEqual([
                "https://cloud-task.oomol.com/v3/users/me/tasks/task-1/result",
                "https://cloud-task.oomol.com/v3/users/me/tasks/task-1/logs?page=2",
                "https://cloud-task.oomol.com/v3/users/me/tasks?size=1&nextToken=eyJsYXN0SWQiOiIxMjMifQ%3D%3D&status=running&packageID=foo&blockName=main",
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports cloud-task wait and its alias with timeout parsing", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const requests: Request[] = [];
            const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
                const request = toRequest(input, init);

                requests.push(request);

                return new Response(JSON.stringify({
                    resultData: {
                        output: "ok",
                    },
                    status: "success",
                }));
            };

            const waitResponse = await sandbox.run(
                ["cloud-task", "wait", "task-1", "--timeout=360"],
                {
                    fetcher,
                },
            );
            const aliasResponse = await sandbox.run(
                ["cloud-task", "wati", "task-2", "--timeout=1m"],
                {
                    fetcher,
                },
            );

            expect({
                aliasResponse: createCliSnapshot(aliasResponse, {
                    stripAnsi: true,
                }),
                waitResponse: createCliSnapshot(waitResponse, {
                    stripAnsi: true,
                }),
            }).toMatchSnapshot();
            expect(requests.map(request => request.url)).toEqual([
                "https://cloud-task.oomol.com/v3/users/me/tasks/task-1/result",
                "https://cloud-task.oomol.com/v3/users/me/tasks/task-2/result",
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("validates cloud-task wait timeout values", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            let fetchCount = 0;
            const result = await sandbox.run(
                ["cloud-task", "wait", "task-1", "--timeout=9s"],
                {
                    fetcher: async () => {
                        fetchCount += 1;

                        return new Response(JSON.stringify({
                            status: "success",
                        }));
                    },
                },
            );

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(fetchCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("treats omitted input handles with default values as optional in cloud-task run", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "cloud-task",
                    "run",
                    "hash-tool@1.0.0",
                    "-b",
                    "main",
                    "-d",
                    "{}",
                    "--dry-run",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            packageName: "hash-tool",
                            packageVersion: "1.0.0",
                            title: "Hash Tool",
                            description: "Generate hash values.",
                            blocks: [
                                {
                                    blockName: "main",
                                    title: "Main",
                                    description: "Generate hash values from input text.",
                                    inputHandleDefs: [
                                        {
                                            handle: "input",
                                            description: "Input text",
                                            value: "",
                                            json_schema: {
                                                type: "string",
                                            },
                                        },
                                        {
                                            handle: "lowercased",
                                            description: "Lowercase output",
                                            value: false,
                                            json_schema: {
                                                type: "boolean",
                                            },
                                        },
                                    ],
                                    outputHandleDefs: [],
                                },
                            ],
                        }));
                    },
                },
            );

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(requests).toHaveLength(1);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("accepts omitted and empty --data values by treating them as empty objects", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const fetcher = async () => new Response(JSON.stringify({
                packageName: "hash-tool",
                packageVersion: "1.0.0",
                title: "Hash Tool",
                description: "Generate hash values.",
                blocks: [
                    {
                        blockName: "main",
                        title: "Main",
                        description: "Generate hash values from input text.",
                        inputHandleDefs: [
                            {
                                handle: "input",
                                description: "Input text",
                                value: "",
                                json_schema: {
                                    type: "string",
                                },
                            },
                            {
                                handle: "lowercased",
                                description: "Lowercase output",
                                value: false,
                                json_schema: {
                                    type: "boolean",
                                },
                            },
                        ],
                        outputHandleDefs: [],
                    },
                ],
            }));

            const omittedDataResult = await sandbox.run(
                [
                    "cloud-task",
                    "run",
                    "hash-tool@1.0.0",
                    "-b",
                    "main",
                    "--dry-run",
                ],
                {
                    fetcher,
                },
            );
            const emptyDataResult = await sandbox.run(
                [
                    "cloud-task",
                    "run",
                    "hash-tool@1.0.0",
                    "-b",
                    "main",
                    "-d",
                    "",
                    "--dry-run",
                ],
                {
                    fetcher,
                },
            );

            expect({
                emptyDataResult: createCliSnapshot(emptyDataResult),
                omittedDataResult: createCliSnapshot(omittedDataResult),
            }).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders cloud-task result text output with colors and grouped details", async () => {
        const sandbox = await createCliSandbox();
        const colors = createTerminalColors(true);

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(
                ["cloud-task", "result", "task-1"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        resultData: {
                            output: "ok",
                        },
                        resultURL: "https://example.com/result.json",
                        status: "success",
                    })),
                    stdout: {
                        hasColors: true,
                    },
                },
            );

            expect(createCliSnapshot(
                result,
                {
                    stripAnsi: true,
                },
            )).toMatchSnapshot();
            expect(result.stdout).toContain(colors.green("✓"));
            expect(result.stdout).toContain(colors.green.bold("success"));
            expect(result.stdout).toContain(colors.bold("task-1"));
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders cloud-task list text output with colors and summary blocks", async () => {
        const sandbox = await createCliSandbox();
        const colors = createTerminalColors(true);

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(
                ["cloud-task", "list", "--size=1"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        nextToken: "next-token",
                        tasks: [
                            {
                                blockName: "main",
                                createdAt: 1704067200000,
                                endTime: null,
                                failedMessage: null,
                                ownerID: "user-1",
                                packageID: "foo",
                                progress: 50,
                                resultURL: null,
                                schedulerPayload: {
                                    inputValues: {
                                        foo: "bar",
                                    },
                                    type: "serverless",
                                },
                                startTime: null,
                                status: "running",
                                subscriptionID: null,
                                taskID: "task-1",
                                taskType: "user",
                                updatedAt: 1704067200000,
                                workload: "serverless",
                                workloadID: "workload-1",
                            },
                        ],
                    })),
                    stdout: {
                        hasColors: true,
                    },
                },
            );

            expect(createCliSnapshot(
                result,
                {
                    stripAnsi: true,
                },
            )).toMatchSnapshot();
            expect(result.stdout).toContain(colors.blue("▶"));
            expect(result.stdout).toContain(colors.blue.bold("running"));
            expect(result.stdout).toContain(colors.hex(searchDisplayNameColor)("foo"));
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("requires a package filter when cloud-task list receives a block filter", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(["cloud-task", "list", "--block-id=main"]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
