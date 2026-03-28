import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
    expectCliSnapshot,
    toRequest,
} from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";

describe("packageInfoCommand CLI", () => {
    test("supports package info command with text output", async () => {
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
                ["packages", "info", "qrcode"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

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
                                            group: "Image Input",
                                            collapsed: true,
                                        },
                                        {
                                            handle: "input",
                                            description: "Image input",
                                            value: "sample.png",
                                            json_schema: {
                                                "contentMediaType": "oomol/image",
                                                "anyOf": [
                                                    {
                                                        "type": "string",
                                                        "ui:widget": "text",
                                                    },
                                                ],
                                                "ui:options": {
                                                    labels: ["Base64 with Text"],
                                                },
                                            },
                                        },
                                        {
                                            handle: "tags",
                                            description: "Tag list",
                                            json_schema: {
                                                type: "array",
                                                items: {
                                                    type: "string",
                                                },
                                            },
                                        },
                                        {
                                            handle: "mode",
                                            description: "Scan mode",
                                            json_schema: {
                                                type: "string",
                                                default: "auto",
                                            },
                                        },
                                        {
                                            handle: "count",
                                            description: "Retry count",
                                            nullable: true,
                                            value: null,
                                            json_schema: {
                                                type: "integer",
                                            },
                                        },
                                    ],
                                    outputHandleDefs: [
                                        {
                                            handle: "output",
                                            description: "Boolean result",
                                            json_schema: {
                                                "type": "boolean",
                                                "ui:widget": "switch",
                                            },
                                        },
                                        {
                                            handle: "metadata",
                                            description: "Unstructured metadata",
                                            json_schema: {},
                                        },
                                    ],
                                },
                                {
                                    blockName: "Decode",
                                    title: "Decode QR Code",
                                    description: "Reads the QR code payload from an image.",
                                    inputHandleDefs: [
                                        {
                                            handle: "image",
                                            description: "Image to decode",
                                            json_schema: {
                                                type: "string",
                                                contentMediaType: "oomol/image",
                                            },
                                        },
                                    ],
                                    outputHandleDefs: [
                                        {
                                            handle: "text",
                                            description: "Decoded text payload",
                                            json_schema: {
                                                type: "string",
                                            },
                                        },
                                    ],
                                },
                            ],
                        }));
                    },
                },
            );

            expectCliSnapshot(result);
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe(
                "https://registry.oomol.com/-/oomol/package-info/qrcode/latest?lang=en",
            );
            expect(requests[0]?.headers.get("Authorization")).toBe("secret-1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("normalizes input ext metadata, applies input schema patches, and keeps output handle schema raw in package info json output", async () => {
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
                ["packages", "info", "qrcode@1.0.4", "--json"],
                {
                    fetcher: async () => new Response(JSON.stringify({
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
                                        handle: "input",
                                        description: "Image input",
                                        nullable: false,
                                        value: "sample.png",
                                        json_schema: {
                                            "anyOf": [
                                                {
                                                    "type": "string",
                                                    "ui:widget": "text",
                                                    "ui:placeholder": "Base64 text input",
                                                },
                                            ],
                                            "ui:help": "ignored",
                                            "ui:options": {
                                                labels: ["Base64 with Text"],
                                            },
                                        },
                                    },
                                    {
                                        handle: "placeholder",
                                        description: "Optional placeholder",
                                        nullable: true,
                                        value: null,
                                        json_schema: {
                                            type: "string",
                                        },
                                    },
                                    {
                                        handle: "fileInput",
                                        description: "Input file",
                                        json_schema: {
                                            "type": "string",
                                            "ui:widget": "file",
                                        },
                                    },
                                    {
                                        handle: "excludes",
                                        description: "Excluded usernames",
                                        value: ["alice", "bob"],
                                        json_schema: {
                                            type: "array",
                                            items: {
                                                type: "string",
                                            },
                                        },
                                    },
                                    {
                                        handle: "count",
                                        description: "Winner count",
                                        value: 3,
                                        json_schema: {
                                            type: "integer",
                                        },
                                    },
                                    {
                                        handle: "tags",
                                        description: "Tag list",
                                        json_schema: {
                                            type: "array",
                                            items: {
                                                type: "string",
                                            },
                                        },
                                    },
                                ],
                                outputHandleDefs: [
                                    {
                                        handle: "output",
                                        description: "Boolean result",
                                        json_schema: {
                                            "type": "boolean",
                                            "ui:widget": "switch",
                                            "ui:tone": "success",
                                        },
                                    },
                                ],
                            },
                        ],
                    })),
                },
            );

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(JSON.parse(result.stdout)).toEqual({
                blocks: [
                    {
                        blockName: "Exist",
                        title: "Exist QR Code",
                        description: "Checks whether an image contains a QR code.",
                        inputHandle: {
                            input: {
                                description: "Image input",
                                ext: {
                                    anyOf: [
                                        {
                                            widget: "text",
                                        },
                                    ],
                                },
                                nullable: false,
                                schema: {
                                    anyOf: [
                                        {
                                            type: "string",
                                        },
                                    ],
                                },
                                value: "sample.png",
                            },
                            placeholder: {
                                description: "Optional placeholder",
                                nullable: true,
                                schema: {
                                    type: "string",
                                },
                                value: null,
                            },
                            fileInput: {
                                description: "Input file",
                                ext: {
                                    widget: "file",
                                },
                                schema: {
                                    format: "uri",
                                    type: "string",
                                },
                            },
                            excludes: {
                                description: "Excluded usernames",
                                schema: {
                                    type: "array",
                                    items: {
                                        type: "string",
                                    },
                                },
                                value: ["alice", "bob"],
                            },
                            count: {
                                description: "Winner count",
                                schema: {
                                    type: "integer",
                                },
                                value: 3,
                            },
                            tags: {
                                description: "Tag list",
                                schema: {
                                    type: "array",
                                    items: {
                                        type: "string",
                                    },
                                },
                            },
                        },
                        outputHandle: {
                            output: {
                                description: "Boolean result",
                                schema: {
                                    "ui:tone": "success",
                                    "ui:widget": "switch",
                                    "type": "boolean",
                                },
                            },
                        },
                    },
                ],
                description: "The QR Code Toolkit.",
                displayName: "QR Code",
                packageName: "qrcode",
                packageVersion: "1.0.4",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports package info package specifier variants and json output", async () => {
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
            const snapshots = [];
            const cases = [
                {
                    argv: ["packages", "info", "pdf@1.0.0", "--format=json"],
                    expectedUrl:
                        "https://registry.oomol.com/-/oomol/package-info/pdf/1.0.0?lang=en",
                    response: {
                        packageName: "pdf",
                        packageVersion: "1.0.0",
                        title: "PDF Toolkit",
                        description: "Inspect PDF files",
                        blocks: [],
                    },
                },
                {
                    argv: ["packages", "info", "pdf", "--format=json"],
                    expectedUrl:
                        "https://registry.oomol.com/-/oomol/package-info/pdf/latest?lang=en",
                    response: {
                        packageName: "pdf",
                        packageVersion: "1.0.0",
                        title: "PDF Toolkit",
                        description: "Inspect PDF files",
                        blocks: [],
                    },
                },
                {
                    argv: ["packages", "info", "@foo/epub", "--format=json"],
                    expectedUrl:
                        "https://registry.oomol.com/-/oomol/package-info/%40foo%2Fepub/latest?lang=en",
                    response: {
                        packageName: "@foo/epub",
                        packageVersion: "2.0.0",
                        title: "Scoped EPUB",
                        description: "Read EPUB packages",
                        blocks: [],
                    },
                },
                {
                    argv: ["packages", "info", "@bar/epub@1.0.0", "--format=json"],
                    expectedUrl:
                        "https://registry.oomol.com/-/oomol/package-info/%40bar%2Fepub/1.0.0?lang=en",
                    response: {
                        packageName: "@bar/epub",
                        packageVersion: "1.0.0",
                        title: "Bar EPUB",
                        description: "Read EPUB packages",
                        blocks: [],
                    },
                },
                {
                    argv: ["packages", "info", "@baz@md@latest", "--format=json"],
                    expectedUrl:
                        "https://registry.oomol.com/-/oomol/package-info/%40baz%40md/latest?lang=en",
                    response: {
                        packageName: "@baz@md",
                        packageVersion: "3.2.1",
                        title: "Baz Markdown",
                        description: "Read Markdown packages",
                        blocks: [],
                    },
                },
            ] as const;

            for (const testCase of cases) {
                const result = await sandbox.run(
                    [...testCase.argv],
                    {
                        fetcher: async (input, init) => {
                            requests.push(toRequest(input, init));

                            return new Response(JSON.stringify(testCase.response));
                        },
                    },
                );

                snapshots.push(createCliSnapshot(result));
                expect(JSON.parse(result.stdout)).toEqual({
                    blocks: [],
                    description: testCase.response.description,
                    displayName: testCase.response.title,
                    packageName: testCase.response.packageName,
                    packageVersion: testCase.response.packageVersion,
                });
            }

            expect(snapshots).toMatchSnapshot();
            expect(requests.map(request => request.url)).toEqual(
                cases.map(testCase => testCase.expectedUrl),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reuses cached package info responses for explicit versions", async () => {
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

            let requestCount = 0;
            const fetcher = async () => {
                requestCount += 1;

                return new Response(JSON.stringify({
                    packageName: "qrcode",
                    packageVersion: "1.0.4",
                    title: "QR Code",
                    description: "The QR Code Toolkit.",
                    blocks: [],
                }));
            };

            const firstResult = await sandbox.run(
                ["packages", "info", "qrcode@1.0.4"],
                { fetcher },
            );
            const secondResult = await sandbox.run(
                ["packages", "info", "qrcode@1.0.4"],
                { fetcher },
            );

            expect(firstResult.exitCode).toBe(0);
            expect(secondResult.exitCode).toBe(0);
            expect({
                firstResult: createCliSnapshot(firstResult),
                secondResult: createCliSnapshot(secondResult),
            }).toMatchSnapshot();
            expect(requestCount).toBe(1);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not read latest package info lookups from cache and backfills the resolved version", async () => {
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

            let requestCount = 0;
            const fetcher = async () => {
                requestCount += 1;

                return new Response(JSON.stringify({
                    packageName: "qrcode",
                    packageVersion: "1.0.4",
                    title: "QR Code",
                    description: "The QR Code Toolkit.",
                    blocks: [],
                }));
            };

            const latestResult = await sandbox.run(
                ["packages", "info", "qrcode"],
                { fetcher },
            );
            const latestAgainResult = await sandbox.run(
                ["packages", "info", "qrcode"],
                { fetcher },
            );
            const explicitVersionResult = await sandbox.run(
                ["packages", "info", "qrcode@1.0.4"],
                { fetcher },
            );

            expect({
                explicitVersionResult: createCliSnapshot(explicitVersionResult),
                latestAgainResult: createCliSnapshot(latestAgainResult),
                latestResult: createCliSnapshot(latestResult),
            }).toMatchSnapshot();
            expect(requestCount).toBe(2);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports package info command help with the --json alias", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["packages", "info", "--help"]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
