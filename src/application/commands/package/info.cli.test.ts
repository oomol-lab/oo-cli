import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createCliSandbox, toRequest } from "../../../../__tests__/helpers.ts";
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
                ["package", "info", "qrcode"],
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

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "QR Code (qrcode@1.0.4)",
                    "The QR Code Toolkit.",
                    "",
                    "- Exist QR Code (Exist)",
                    "  Checks whether an image contains a QR code.",
                    "  Input:",
                    "    - input  string (image)  [optional]  Image input",
                    "    - tags   Array<string>   [required]  Tag list",
                    "    - mode   string          [optional]  Scan mode",
                    "    - count  integer         [optional]  Retry count",
                    "  Output:",
                    "    - output    boolean  Boolean result",
                    "    - metadata  unknown  Unstructured metadata",
                    "",
                    "- Decode QR Code (Decode)",
                    "  Reads the QR code payload from an image.",
                    "  Input:",
                    "    - image  string (image)  [required]  Image to decode",
                    "  Output:",
                    "    - text  string  Decoded text payload",
                    "",
                ].join("\n"),
            );
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
                ["package", "info", "qrcode@1.0.4", "--json"],
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

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
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
            const cases = [
                {
                    argv: ["package", "info", "pdf@1.0.0", "--format=json"],
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
                    argv: ["package", "info", "pdf", "--format=json"],
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
                    argv: ["package", "info", "@foo/epub", "--format=json"],
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
                    argv: ["package", "info", "@bar/epub@1.0.0", "--format=json"],
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
                    argv: ["package", "info", "@baz@md@latest", "--format=json"],
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

                expect(result.exitCode).toBe(0);
                expect(result.stderr).toBe("");
                expect(JSON.parse(result.stdout)).toEqual({
                    blocks: [],
                    description: testCase.response.description,
                    displayName: testCase.response.title,
                    packageName: testCase.response.packageName,
                    packageVersion: testCase.response.packageVersion,
                });
            }

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
                ["package", "info", "qrcode@1.0.4"],
                { fetcher },
            );
            const secondResult = await sandbox.run(
                ["package", "info", "qrcode@1.0.4"],
                { fetcher },
            );

            expect(firstResult.exitCode).toBe(0);
            expect(secondResult.exitCode).toBe(0);
            expect(firstResult.stdout).toBe(secondResult.stdout);
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
                ["package", "info", "qrcode"],
                { fetcher },
            );
            const latestAgainResult = await sandbox.run(
                ["package", "info", "qrcode"],
                { fetcher },
            );
            const explicitVersionResult = await sandbox.run(
                ["package", "info", "qrcode@1.0.4"],
                { fetcher },
            );

            expect(latestResult.exitCode).toBe(0);
            expect(latestAgainResult.exitCode).toBe(0);
            expect(explicitVersionResult.exitCode).toBe(0);
            expect(requestCount).toBe(2);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports package info command help with the --json alias", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["package", "info", "--help"]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("--json");
            expect(result.stdout).toContain("Alias for --format=json");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
