import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
    createFailedToOpenSocketError,
    toRequest,
    writeAuthFile,
} from "../../../../__tests__/helpers.ts";
import { createTerminalColors } from "../../terminal-colors.ts";

const skillSearchDisplayNameColor = "#59F78D";
const skillSearchPackageColor = "#CAA8FA";

const fullServerResponse = {
    data: [
        {
            description: "Generate text using AI models",
            icon: "https://example.com/text-generation.png",
            name: "text-generation",
            owner: "0195f082-f87a-7772-80a9-9a2e4245d4d5",
            packageName: "@oomol/ai-tools",
            packageVersion: "1.0.0",
            title: "Text Generation",
            when: "Use this when the user asks for text generation.",
        },
    ],
};

describe("skills search CLI", () => {
    test("supports skills search command with text output", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["skills", "search", "text generation"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify(fullServerResponse));
                    },
                },
            );

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "Text Generation (text-generation)",
                    "Generate text using AI models",
                    "Package: @oomol/ai-tools@1.0.0",
                    "",
                ].join("\n"),
            );
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe(
                "https://search.oomol.com/v1/packages/-/skills-search?text=text+generation&size=5",
            );
            expect(requests[0]?.headers.get("Authorization")).toBe("secret-1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports skills find alias with json output and keywords", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["skills", "find", "text generation", "--format=json", "--keywords=bar,baz"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            data: [
                                {
                                    description: "Generate text using AI models",
                                    icon: "https://example.com/text-generation.png",
                                    name: "text-generation",
                                    packageName: "@oomol/ai-tools",
                                    packageVersion: "1.0.0",
                                    title: "Text Generation",
                                },
                            ],
                        }));
                    },
                },
            );

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(JSON.parse(result.stdout)).toEqual([
                {
                    description: "Generate text using AI models",
                    name: "text-generation",
                    packageName: "@oomol/ai-tools",
                    packageVersion: "1.0.0",
                    skillDisplayName: "Text Generation",
                },
            ]);
            expect(result.stdout).not.toContain("\"icon\"");
            expect(result.stdout).not.toContain("\"owner\"");
            expect(result.stdout).not.toContain("\"title\"");
            expect(result.stdout).not.toContain("\"when\"");
            expect(requests).toHaveLength(1);
            expect(new URL(requests[0]!.url).searchParams.get("text")).toBe(
                "text generation",
            );
            expect(
                new URL(requests[0]!.url).searchParams.getAll("keywords"),
            ).toEqual(["bar", "baz"]);
            expect(new URL(requests[0]!.url).searchParams.get("size")).toBe("5");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports skills search with the --json alias", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["skills", "search", "text generation", "--json"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify(fullServerResponse));
                    },
                },
            );

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(JSON.parse(result.stdout)).toEqual([
                {
                    description: "Generate text using AI models",
                    name: "text-generation",
                    packageName: "@oomol/ai-tools",
                    packageVersion: "1.0.0",
                    skillDisplayName: "Text Generation",
                },
            ]);
            expect(result.stdout).not.toContain("\"icon\"");
            expect(result.stdout).not.toContain("\"owner\"");
            expect(result.stdout).not.toContain("\"title\"");
            expect(result.stdout).not.toContain("\"when\"");
            expect(requests).toHaveLength(1);
            expect(new URL(requests[0]!.url).searchParams.get("text")).toBe(
                "text generation",
            );
            expect(new URL(requests[0]!.url).searchParams.get("size")).toBe("5");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders skills search output with field-specific colors", async () => {
        const sandbox = await createCliSandbox();
        const colors = createTerminalColors(true);

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "search", "text generation"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        data: [
                            {
                                description: "Generate text using AI models",
                                name: "text-generation",
                                packageName: "@oomol/ai-tools",
                                packageVersion: "1.0.0",
                                title: "Text Generation",
                            },
                        ],
                    })),
                    stdout: {
                        hasColors: true,
                    },
                },
            );

            expect(createCliSnapshot(result, {
                stripAnsi: true,
            })).toMatchSnapshot();
            expect(result.stdout).toContain(
                `${colors.hex(skillSearchDisplayNameColor)("Text Generation")} (text-generation)`,
            );
            expect(result.stdout).toContain(
                `Package: ${colors.hex(skillSearchPackageColor)("@oomol/ai-tools@1.0.0")}`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("validates the skills search format option", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["skills", "search", "text", "--format=yaml"]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe("Invalid format: yaml. Use json.\n");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders skills search help when text argument is omitted", async () => {
        const sandbox = await createCliSandbox();

        try {
            const expectedHelp = await sandbox.run(["skills", "search", "--help"]);
            const result = await sandbox.run(["skills", "search"]);

            expect({
                expectedHelp: createCliSnapshot(expectedHelp),
                result: createCliSnapshot(result),
            }).toMatchSnapshot();
            expect(result).toEqual(expectedHelp);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("adds a sandbox hint when the skills search request cannot open a socket", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "search", "text generation"],
                {
                    fetcher: async () => {
                        throw createFailedToOpenSocketError("network down");
                    },
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "The skills search request failed: network down\nCurrent environment may be running in a network-restricted sandbox. Try requesting elevated permissions.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
