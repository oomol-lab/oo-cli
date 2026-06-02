import { describe, expect, test } from "bun:test";
import {
    createCliSandbox,
    createInteractiveInput,
    toRequest,
    writeAuthFile,
} from "../../../../__tests__/helpers.ts";

const VARIABLE = {
    name: "model-config",
    value: "{\"model\":\"gpt-4.1\"}",
    updatedAt: "2026-06-01T08:01:49.000Z",
};

describe("variables list", () => {
    test("GET /v1/variables with auth; text shows only name + updatedAt, not value", async () => {
        const sandbox = await createCliSandbox();
        const requests: Request[] = [];

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["variables", "list"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));
                    return new Response(JSON.stringify({ variables: [VARIABLE] }));
                },
            });

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(1);
            expect(requests[0]!.method).toBe("GET");

            const url = new URL(requests[0]!.url);
            expect(url.host).toBe("cli-api.oomol.com");
            expect(url.pathname).toBe("/v1/variables");
            expect(requests[0]!.headers.get("Authorization")).toBe("secret-1");

            expect(result.stdout).toContain("model-config");
            expect(result.stdout).toContain("2026-06-01T08:01:49.000Z");
            expect(result.stdout).not.toContain("gpt-4.1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json outputs the full value", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["variables", "list", "--json"], {
                fetcher: async () => new Response(JSON.stringify({ variables: [VARIABLE] })),
            });

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as { variables: { value: string }[] };
            expect(payload.variables[0]!.value).toBe(VARIABLE.value);
            expect(result.stdout).not.toContain("secret-1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("an empty list shows the no-variables message", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["vars", "list"], {
                fetcher: async () => new Response(JSON.stringify({ variables: [] })),
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("No variables.");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

describe("variables get", () => {
    test("outputs the full raw value", async () => {
        const sandbox = await createCliSandbox();
        const requests: Request[] = [];

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["variables", "get", "model-config"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));
                    return new Response(JSON.stringify(VARIABLE));
                },
            });

            expect(result.exitCode).toBe(0);
            expect(new URL(requests[0]!.url).pathname).toBe("/v1/variables/model-config");
            expect(result.stdout).toBe(`${VARIABLE.value}\n`);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("404 returns a not-found user error, exit 1", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["variables", "get", "missing"], {
                fetcher: async () => new Response("", { status: 404 }),
            });

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("missing");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

describe("variables create / update", () => {
    test("PUT body is {value} from a positional value", async () => {
        const sandbox = await createCliSandbox();
        const requests: Request[] = [];

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["variables", "create", "model-config", VARIABLE.value], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));
                    return new Response(JSON.stringify(VARIABLE));
                },
            });

            expect(result.exitCode).toBe(0);
            expect(requests[0]!.method).toBe("PUT");
            expect(new URL(requests[0]!.url).pathname).toBe("/v1/variables/model-config");
            expect(requests[0]!.headers.get("Authorization")).toBe("secret-1");
            expect(await requests[0]!.json()).toEqual({ value: VARIABLE.value });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("update alias behaves the same as create (PUT)", async () => {
        const sandbox = await createCliSandbox();
        const requests: Request[] = [];

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["variables", "update", "k", "v"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));
                    return new Response(JSON.stringify({ ...VARIABLE, name: "k", value: "v" }));
                },
            });

            expect(result.exitCode).toBe(0);
            expect(requests[0]!.method).toBe("PUT");
            expect(await requests[0]!.json()).toEqual({ value: "v" });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("an empty string is valid", async () => {
        const sandbox = await createCliSandbox();
        const requests: Request[] = [];

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["variables", "create", "k", ""], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));
                    return new Response(JSON.stringify({ ...VARIABLE, name: "k", value: "" }));
                },
            });

            expect(result.exitCode).toBe(0);
            expect(await requests[0]!.json()).toEqual({ value: "" });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--from-file reads the file contents verbatim", async () => {
        const sandbox = await createCliSandbox();
        const requests: Request[] = [];
        const filePath = `${sandbox.env.HOME}/value.txt`;
        await Bun.write(filePath, "from-file-value\n");

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["variables", "create", "k", "--from-file", filePath], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));
                    return new Response(JSON.stringify({ ...VARIABLE, name: "k", value: "from-file-value\n" }));
                },
            });

            expect(result.exitCode).toBe(0);
            expect(await requests[0]!.json()).toEqual({ value: "from-file-value\n" });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--stdin reads piped input (non-TTY)", async () => {
        const sandbox = await createCliSandbox();
        const requests: Request[] = [];
        const stdin = createInteractiveInput({ isTTY: false });
        stdin.feed("piped\nvalue");
        stdin.end();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["variables", "create", "k", "--stdin"], {
                stdin,
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));
                    return new Response(JSON.stringify({ ...VARIABLE, name: "k", value: "piped\nvalue" }));
                },
            });

            expect(result.exitCode).toBe(0);
            expect(await requests[0]!.json()).toEqual({ value: "piped\nvalue" });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--stdin errors under a TTY and sends no request, exit 2", async () => {
        const sandbox = await createCliSandbox();
        let called = false;
        const stdin = createInteractiveInput({ isTTY: true });

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["variables", "create", "k", "--stdin"], {
                stdin,
                fetcher: async () => {
                    called = true;
                    return new Response("{}");
                },
            });

            expect(result.exitCode).toBe(2);
            expect(called).toBe(false);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--stdin under a detached stdin PUTs an empty string immediately without hanging", async () => {
        const sandbox = await createCliSandbox();
        const requests: Request[] = [];

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["variables", "create", "k", "--stdin"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));
                    return new Response(JSON.stringify({ ...VARIABLE, name: "k", value: "" }));
                },
            });

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(1);
            expect(await requests[0]!.json()).toEqual({ value: "" });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("multiple value sources (positional + --stdin) error with exit 2 and send no request", async () => {
        const sandbox = await createCliSandbox();
        let called = false;
        const stdin = createInteractiveInput({ isTTY: false });
        stdin.feed("x");
        stdin.end();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["variables", "create", "k", "v", "--stdin"], {
                stdin,
                fetcher: async () => {
                    called = true;
                    return new Response("{}");
                },
            });

            expect(result.exitCode).toBe(2);
            expect(called).toBe(false);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("value over 64 KiB errors with exit 2 and sends no request", async () => {
        const sandbox = await createCliSandbox();
        let called = false;

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["variables", "create", "k", "x".repeat(65537)], {
                fetcher: async () => {
                    called = true;
                    return new Response("{}");
                },
            });

            expect(result.exitCode).toBe(2);
            expect(called).toBe(false);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("409 returns quota exceeded", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["variables", "create", "k", "v"], {
                fetcher: async () => new Response("", { status: 409 }),
            });

            expect(result.exitCode).toBe(1);
            expect(result.stderr.toLowerCase()).toContain("quota");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

describe("variables delete", () => {
    test("DELETE 204 succeeds; --json outputs {name, deleted: true}", async () => {
        const sandbox = await createCliSandbox();
        const requests: Request[] = [];

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["variables", "delete", "k", "--json"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));
                    return new Response("", { status: 204 });
                },
            });

            expect(result.exitCode).toBe(0);
            expect(requests[0]!.method).toBe("DELETE");
            expect(new URL(requests[0]!.url).pathname).toBe("/v1/variables/k");
            expect(JSON.parse(result.stdout)).toEqual({ name: "k", deleted: true });
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

describe("variables validation & auth", () => {
    test("an invalid name (contains /) errors with exit 2 and sends no request", async () => {
        const sandbox = await createCliSandbox();
        let called = false;

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["variables", "get", "a/b"], {
                fetcher: async () => {
                    called = true;
                    return new Response("{}");
                },
            });

            expect(result.exitCode).toBe(2);
            expect(called).toBe(false);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports an auth error when not logged in", async () => {
        const sandbox = await createCliSandbox();
        let called = false;

        try {
            const result = await sandbox.run(["variables", "list"], {
                fetcher: async () => {
                    called = true;
                    return new Response("{}");
                },
            });

            expect(result.exitCode).toBe(1);
            expect(called).toBe(false);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("the variable top-level alias works", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["variable", "list"], {
                fetcher: async () => new Response(JSON.stringify({ variables: [] })),
            });

            expect(result.exitCode).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
