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
    test("GET /v1/variables 带鉴权；文本只显示 name + updatedAt，不显示 value", async () => {
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

    test("--json 输出完整 value", async () => {
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

    test("空列表显示 no variables 文案", async () => {
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
    test("输出完整 raw value", async () => {
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

    test("404 返回 not found 用户错误，exit 1", async () => {
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
    test("PUT body 为 {value}，positional value", async () => {
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

    test("update alias 行为等同 create（PUT）", async () => {
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

    test("空字符串合法", async () => {
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

    test("--from-file 读取文件原文", async () => {
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

    test("--stdin 读取管道输入（非 TTY）", async () => {
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

    test("--stdin 在 TTY 下报错且不发请求，exit 2", async () => {
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

    test("--stdin 在 detached（未提供 stdin）下立即以空串 PUT，不挂住", async () => {
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

    test("多个 value 来源（positional + --stdin）报错 exit 2，不发请求", async () => {
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

    test("value 超过 64 KiB 报错 exit 2，不发请求", async () => {
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

    test("409 返回 quota exceeded", async () => {
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
    test("DELETE 204 成功；--json 输出 {name,deleted:true}", async () => {
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
    test("无效 name（含 /）报错 exit 2，不发请求", async () => {
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

    test("未登录时报 auth 错误", async () => {
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

    test("variable 顶层别名可用", async () => {
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
