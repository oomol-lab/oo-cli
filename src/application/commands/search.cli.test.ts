import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    readLatestLogContent,
    toRequest,
} from "../../../__tests__/helpers.ts";
import { APP_NAME } from "../config/app-config.ts";
import { createTerminalColors } from "../terminal-colors.ts";

const searchBlockTitleColor = "#CAA8FA";
const searchDisplayNameColor = "#59F78D";

describe("search CLI", () => {
    test("writes search request lifecycle logs", async () => {
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
                ["search", "image processing"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        packages: [],
                    })),
                },
            );
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(content).toContain(`"msg":"Search response cache miss."`);
            expect(content).toContain(`"msg":"Search request started."`);
            expect(content).toContain(`"msg":"Search request completed."`);
            expect(content).toContain(`"msg":"Search response cached."`);
            expect(content).toContain(`"path":"/v1/packages/-/intent-search"`);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("writes sqlite cache adapter logs across repeated search invocations", async () => {
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
                    packages: [],
                }));
            };

            const firstResult = await sandbox.run(["search", "cache me"], { fetcher });
            const firstContent = await readLatestLogContent(sandbox);
            const secondResult = await sandbox.run(["search", "cache me"], { fetcher });
            const secondContent = await readLatestLogContent(sandbox);

            expect(firstResult.exitCode).toBe(0);
            expect(secondResult.exitCode).toBe(0);
            expect(requestCount).toBe(1);
            expect(firstContent).toContain(`"msg":"Sqlite cache namespace opened."`);
            expect(firstContent).toContain(`"msg":"Sqlite cache lookup missed."`);
            expect(firstContent).toContain(`"msg":"Sqlite cache value stored."`);
            expect(secondContent).toContain(`"msg":"Sqlite cache lookup hit."`);
            expect(secondContent).toContain(`"cacheId":"search.intent-response"`);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports search command with text output", async () => {
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
                ["search", "image processing"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            packages: [
                                {
                                    name: "@oomol/image-tools",
                                    version: "1.2.3",
                                    displayName: "Image Tools",
                                    description: "Powerful image processing toolkit",
                                    blocks: [
                                        {
                                            name: "image-processor",
                                            title: "Image Processor",
                                            description:
                                                "Process and transform image formats",
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
                    "Image Tools (@oomol/image-tools@1.2.3)",
                    "Powerful image processing toolkit",
                    "Blocks:",
                    "- Image Processor (image-processor)",
                    "  Process and transform image formats",
                    "",
                ].join("\n"),
            );
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe(
                "https://search.oomol.com/v1/packages/-/intent-search?q=image+processing&lang=en",
            );
            expect(requests[0]?.headers.get("Authorization")).toBe("secret-1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("adds the localized request language to search queries", async () => {
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
                ["--lang", "zh", "search", "image processing"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            packages: [],
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(1);
            expect(
                new URL(requests[0]!.url).searchParams.get("lang"),
            ).toBe("zh-CN");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reuses cached search responses across cli invocations", async () => {
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
                    packages: [
                        {
                            name: "@oomol/image-tools",
                            version: "1.2.3",
                            displayName: "Image Tools",
                            description: "Powerful image processing toolkit",
                        },
                    ],
                }));
            };
            const firstResult = await sandbox.run(
                ["search", "image processing"],
                { fetcher },
            );
            const secondResult = await sandbox.run(
                ["search", "image processing"],
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

    test("renders search output with field-specific colors", async () => {
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
                ["search", "image processing"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        packages: [
                            {
                                name: "@oomol/image-tools",
                                version: "1.2.3",
                                displayName: "Image Tools",
                                description: "Powerful image processing toolkit",
                                blocks: [
                                    {
                                        name: "image-processor",
                                        title: "Image Processor",
                                        description:
                                            "Process and transform image formats",
                                    },
                                ],
                            },
                        ],
                    })),
                    stdout: {
                        hasColors: true,
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(createTerminalColors(true).strip(result.stdout)).toBe(
                [
                    "Image Tools (@oomol/image-tools@1.2.3)",
                    "Powerful image processing toolkit",
                    "Blocks:",
                    "- Image Processor (image-processor)",
                    "  Process and transform image formats",
                    "",
                ].join("\n"),
            );
            expect(result.stdout).toContain(
                `${colors.hex(searchDisplayNameColor)("Image Tools")} (@oomol/image-tools@1.2.3)`,
            );
            expect(result.stdout).toContain(
                `${colors.hex(searchBlockTitleColor)("Image Processor")} (image-processor)`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports search command with only-package-id text output", async () => {
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
                ["search", "image processing", "--only-package-id"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        packages: [
                            {
                                name: "@oomol/image-tools",
                                version: "1.2.3",
                                displayName: "Image Tools",
                                description: "Powerful image processing toolkit",
                            },
                            {
                                name: "@oomol/vision-kit",
                                version: "2.0.0",
                                displayName: "Vision Kit",
                            },
                        ],
                    })),
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "@oomol/image-tools@1.2.3",
                    "@oomol/vision-kit@2.0.0",
                    "",
                ].join("\n"),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports search command with json array output and trims long text", async () => {
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

            const rawResponse = JSON.stringify({
                packages: [
                    {
                        blocks: [
                            {
                                title: "Image Processor",
                            },
                        ],
                        displayName: "Image Tools",
                        name: "@oomol/image-tools",
                        version: "1.2.3",
                    },
                ],
                total: 1,
            });
            const requests: Request[] = [];
            const searchText = "x".repeat(210);
            const expectedQuery = "x".repeat(200);
            const result = await sandbox.run(
                ["search", searchText, "--json"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(rawResponse);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(`${JSON.stringify([
                {
                    blocks: [
                        {
                            title: "Image Processor",
                        },
                    ],
                    displayName: "Image Tools",
                    name: "@oomol/image-tools",
                    version: "1.2.3",
                },
            ])}\n`);
            expect(result.stderr).toBe("");
            expect(requests).toHaveLength(1);
            expect(
                new URL(requests[0]!.url).searchParams.get("q"),
            ).toBe(expectedQuery);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports search command with only-package-id json output", async () => {
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
                ["search", "image processing", "--format=json", "--only-package-id"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        packages: [
                            {
                                name: "@oomol/image-tools",
                                version: "1.2.3",
                                displayName: "Image Tools",
                            },
                            {
                                name: "@oomol/vision-kit",
                                version: "2.0.0",
                            },
                        ],
                    })),
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(`${JSON.stringify([
                "@oomol/image-tools@1.2.3",
                "@oomol/vision-kit@2.0.0",
            ])}\n`);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("validates the search format option", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["search", "image", "--format=yaml"]);

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain("Invalid format: yaml. Use json.");
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

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(expectedHelp.stdout);
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
