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
import { createTerminalColors } from "../terminal-colors.ts";
import { resolveConnectorActionSchemaPath } from "./connector/schema-cache.ts";
import { mixedSearchKindColor } from "./search.ts";

describe("mixedSearchCommand CLI", () => {
    test("supports mixed search with text output and groups results by source", async () => {
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

                        if (
                            request.url.startsWith("https://search.")
                            && request.url.includes("/v1/packages/-/intent-search")
                        ) {
                            return new Response(JSON.stringify({
                                packages: [
                                    {
                                        blocks: [
                                            {
                                                description: "Send templated emails.",
                                                name: "send-email",
                                                title: "Send Email",
                                            },
                                        ],
                                        description: "Email automation package.",
                                        displayName: "Mail Tools",
                                        name: "@oomol/mail-tools",
                                        version: "1.2.3",
                                    },
                                ],
                            }));
                        }

                        if (request.url.startsWith("https://search.")) {
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

            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
            expect(requests.map(request => request.url).sort()).toEqual([
                "https://connector.oomol.com/v1/apps/authenticated?service=gmail",
                "https://search.oomol.com/v1/connector-actions?q=send+mail&keywords=gmail%2Cemail",
                "https://search.oomol.com/v1/packages/-/intent-search?q=send+mail&lang=en&excludeScopes=connector&excludePackages=llm",
            ]);
            expect(logContent).toContain(`"path":"/v1/packages/-/intent-search"`);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports mixed search with json output", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["search", "send mail", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (
                            request.url.startsWith("https://search.")
                            && request.url.includes("/v1/packages/-/intent-search")
                        ) {
                            return new Response(JSON.stringify({
                                packages: [
                                    {
                                        blocks: [
                                            {
                                                title: "Send Email",
                                            },
                                        ],
                                        description: "Email automation package.",
                                        displayName: "Mail Tools",
                                        name: "@oomol/mail-tools",
                                        version: "1.2.3",
                                    },
                                ],
                            }));
                        }

                        if (request.url.startsWith("https://search.")) {
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
                    blocks: [
                        {
                            description: "",
                            name: "",
                            title: "Send Email",
                        },
                    ],
                    description: "Email automation package.",
                    displayName: "Mail Tools",
                    kind: "package",
                    packageId: "@oomol/mail-tools@1.2.3",
                },
                {
                    authenticated: false,
                    description: "Send a Gmail message.",
                    kind: "connector",
                    name: "send_mail",
                    schemaPath: resolveConnectorActionSchemaPath(
                        join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "settings.toml"),
                        "gmail",
                        "send_mail",
                    ),
                    service: "gmail",
                },
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders kind lines after descriptions with field-specific colors", async () => {
        const sandbox = await createCliSandbox();
        const colors = createTerminalColors(true);

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["search", "send mail"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (
                            request.url.startsWith("https://search.")
                            && request.url.includes("/v1/packages/-/intent-search")
                        ) {
                            return new Response(JSON.stringify({
                                packages: [
                                    {
                                        description: "Email automation package.",
                                        displayName: "Mail Tools",
                                        name: "@oomol/mail-tools",
                                        version: "1.2.3",
                                    },
                                ],
                            }));
                        }

                        if (request.url.startsWith("https://search.")) {
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
                    stdout: {
                        hasColors: true,
                    },
                },
            );
            const strippedSnapshot = createCliSnapshot(result, {
                sandbox,
                stripAnsi: true,
            });

            expect(strippedSnapshot).toMatchSnapshot();
            expect(result.stdout).toContain(
                `Kind: ${colors.hex(mixedSearchKindColor)("package")}`,
            );
            expect(result.stdout).toContain(
                `Kind: ${colors.hex(mixedSearchKindColor)("connector")}`,
            );
            expect(strippedSnapshot.stdout).toContain(
                "Mail Tools (@oomol/mail-tools@1.2.3)\nEmail automation package.\nKind: package",
            );
            expect(strippedSnapshot.stdout).toContain(
                "gmail.send_mail\nSend a Gmail message.\nKind: connector",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders mixed search no-results output when both providers are empty", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["search", "send mail"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (
                            request.url.startsWith("https://search.")
                            && request.url.includes("/v1/packages/-/intent-search")
                        ) {
                            return new Response(JSON.stringify({
                                packages: [],
                            }));
                        }

                        return new Response(JSON.stringify({
                            data: [],
                        }));
                    },
                },
            );

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders mixed search help when text argument is omitted", async () => {
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
