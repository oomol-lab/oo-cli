import type { CliSandbox } from "../../../../__tests__/helpers.ts";
import type { Fetcher } from "../../contracts/cli.ts";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import { createCliSandbox, createInteractiveInput, toRequest, writeAuthFile } from "../../../../__tests__/helpers.ts";

const apiBase = "https://spaces.oomol.com";
const space = {
    id: "0198a6f0-0000-7000-8000-000000000001",
    teamId: "team-a",
    slug: "blog",
    name: "Blog",
    status: "live",
    visibility: "team",
    url: "https://blog.example.test/",
    label: "blog",
    building: false,
    convexDeploymentName: "happy-otter-1",
    convexDeploymentUrl: "https://happy-otter-1.convex.cloud",
    nextChargeAt: 1_800_000_000,
    suspendedAt: null,
    graceUntil: null,
    lastError: null,
    createdBy: "user-1",
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_100,
};
const job = {
    id: "0198a6f0-0000-7000-8000-000000000002",
    kind: "deploy",
    status: "succeeded",
    version: 3,
    error: null,
    attempt: 1,
    createdAt: 1_700_000_200,
    startedAt: 1_700_000_201,
    finishedAt: 1_700_000_205,
};
const artifact = {
    id: "0198a6f0-0000-7000-8000-000000000003",
    version: 3,
    status: "unpacked",
    rollbackable: true,
    active: true,
    sizeBytes: 2_048,
    fileCount: 4,
    sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    createdAt: 1_700_000_200,
};

describe("spaces commands", () => {
    test("lists every page of the selected team's spaces", async () => {
        await withSandbox(async (sandbox) => {
            const pages = [{ items: [space], nextCursor: "cursor-2" }, { items: [{ ...space, id: "space-2", slug: "docs" }] }];
            const service = createService({ "GET /v1/spaces": () => Response.json(pages.shift()) });
            const result = await sandbox.run(["spaces", "list", "--status", "live", "--team", "team-a", "--json"], service);

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout).map((item: { slug: string }) => item.slug)).toEqual(["blog", "docs"]);
            expect(service.requests).toHaveLength(2);
            expect(service.requests[0]!.headers.get("Authorization")).toBe("secret-1");
            expect(service.requests[0]!.headers.get("x-oo-team-name")).toBe("team-a");
            expect(new URL(service.requests[0]!.url).searchParams.get("status")).toBe("live");
            expect(new URL(service.requests[1]!.url).searchParams.get("cursor")).toBe("cursor-2");
        });
    });

    test("renders the list and a single space as text", async () => {
        await withSandbox(async (sandbox) => {
            const service = createService({
                "GET /v1/spaces": () => Response.json({ items: [{ ...space, building: true }] }),
                "GET /v1/spaces/blog": () => Response.json(space),
            });
            const list = await sandbox.run(["spaces", "list"], service);
            const get = await sandbox.run(["spaces", "get", "blog"], service);

            expect(list.stdout).toContain("Slug  Status  Visibility  URL");
            expect(list.stdout).toContain(`blog  live*   team        ${space.url}  2023-11-14T22:15:00Z  ${space.id}`);
            expect(get.stdout).toStartWith("blog\n");
            expect(get.stdout).toContain(`  - ID: ${space.id}\n`);
            expect(get.stdout).toContain("  - Next charge: 2027-01-15T08:00:00Z\n");
            expect(get.stdout).toContain("  - Suspended at: -\n");
        });
    });

    test("rejects an unknown status before any request", async () => {
        await withSandbox(async (sandbox) => {
            const service = createService({});
            const result = await sandbox.run(["spaces", "list", "--status", "paused", "--json"], service);

            expect(result.exitCode).toBe(2);
            expect(JSON.parse(result.stderr).error.code).toBe("spaces.invalidStatus");
            expect(service.requests).toHaveLength(0);
        });
    });

    test("creates a space with an idempotency key", async () => {
        await withSandbox(async (sandbox) => {
            const service = createService({ "POST /v1/spaces": () => Response.json(space, { status: 201 }) });
            const result = await sandbox.run(["spaces", "create", "blog", "--name", "Blog", "--visibility", "public", "--json"], service);

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout).id).toBe(space.id);
            expect(service.requests[0]!.headers.get("Idempotency-Key")).toBeTruthy();
            expect(await service.requests[0]!.json()).toEqual({ name: "Blog", slug: "blog", visibility: "public" });
            expect((await sandbox.run(["spaces", "create", "blog", "--visibility", "secret"], service)).exitCode).toBe(2);
            expect(service.requests).toHaveLength(1);
        });
    });

    test("deletes only with an explicit confirmation", async () => {
        await withSandbox(async (sandbox) => {
            const service = createService({
                "DELETE /v1/spaces/blog": () => Response.json({ job: { ...job, kind: "delete_space", status: "queued" } }, { status: 202 }),
            });
            const refused = await sandbox.run(["spaces", "delete", "blog"], service);

            expect(refused.exitCode).toBe(2);
            expect(service.requests).toHaveLength(0);

            const result = await sandbox.run(["spaces", "delete", "blog", "-y", "--json"], service);

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout).job.kind).toBe("delete_space");
            expect(service.requests[0]!.headers.get("Idempotency-Key")).toBeTruthy();
        });
    });

    test("resumes named spaces by id, or every suspended space with --all", async () => {
        await withSandbox(async (sandbox) => {
            const bodies: unknown[] = [];
            const service = createService({
                "GET /v1/spaces/blog": () => Response.json(space),
                "POST /v1/spaces/resume": async (request) => {
                    bodies.push(await request.json());

                    return Response.json({ resumed: [space], skipped: [{ spaceId: "space-2", code: "insufficient_balance" }] });
                },
            });
            const named = await sandbox.run(["spaces", "resume", "blog"], service);
            const all = await sandbox.run(["spaces", "resume", "--all", "--json"], service);

            expect(named.stdout).toBe(`Resumed 1, skipped 1\n  resumed  blog  ${space.url}\n  skipped  space-2  insufficient_balance\n`);
            expect(JSON.parse(all.stdout).skipped).toEqual([{ spaceId: "space-2", code: "insufficient_balance" }]);
            expect(bodies).toEqual([{ spaceIds: [space.id] }, {}]);
            expect((await sandbox.run(["spaces", "resume"], service)).exitCode).toBe(2);
            expect((await sandbox.run(["spaces", "resume", "blog", "--all"], service)).exitCode).toBe(2);
        });
    });

    test("uploads a prebuilt directory and reports the queued job", async () => {
        await withSandbox(async (sandbox) => {
            await writeFiles(sandbox.cwd, { "site/index.html": "<h1>hi</h1>", "site/app.js": "1" });

            const service = createService({
                "POST /v1/spaces/blog/deploys": () => Response.json({ job: { ...job, status: "queued", version: null } }, { status: 202 }),
            });
            const result = await sandbox.run(["spaces", "deploy", "blog", "--dir", "site", "--json"], service);
            const upload = service.requests[0]!;

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({ job: { ...job, status: "queued", version: null } });
            expect(result.stderr).toBe("");
            expect(upload.headers.get("Content-Type")).toBe("application/zip");
            expect(upload.headers.get("Idempotency-Key")).toBeTruthy();
            expect(new Uint8Array(await upload.arrayBuffer()).subarray(0, 2)).toEqual(new Uint8Array([0x50, 0x4B]));
        });
    });

    test("waits for the job and adds the site URL", async () => {
        await withSandbox(async (sandbox) => {
            await writeFiles(sandbox.cwd, { "site/index.html": "<h1>hi</h1>" });

            const service = createService({
                "GET /v1/spaces/blog": () => Response.json(space),
                "POST /v1/spaces/blog/deploys": () => Response.json({ job }, { status: 202 }),
            });
            const json = await sandbox.run(["spaces", "deploy", "blog", "--dir", "site", "--wait", "--json"], service);
            const text = await sandbox.run(["spaces", "deploy", "blog", "--dir", "site", "--wait", "--timeout", "90s"], service);

            expect(JSON.parse(json.stdout)).toEqual({ ...job, url: space.url });
            expect(text.stdout).toBe(`Deploy succeeded: version 3\n${space.url}\n`);
            expect(json.stderr).toBe("");
            expect(text.stderr.split("\n")).toEqual([
                expect.stringContaining("Packed 1 files into "),
                expect.stringContaining(" to blog"),
                `Waiting for job ${job.id} (timeout 1m30s)`,
                "",
            ]);
        });
    });

    test("fails when the awaited job does not succeed", async () => {
        await withSandbox(async (sandbox) => {
            await writeFiles(sandbox.cwd, { "site/index.html": "<h1>hi</h1>" });

            const failed = { ...job, error: "artifact_invalid", status: "failed", version: null };
            const service = createService({ "POST /v1/spaces/blog/deploys": () => Response.json({ job: failed }, { status: 202 }) });
            const result = await sandbox.run(["spaces", "deploy", "blog", "--dir", "site", "--wait", "--json"], service);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(JSON.parse(result.stderr).error).toMatchObject({
                code: "spaces.jobFailed",
                details: { jobId: job.id, jobKind: "deploy", jobStatus: "failed" },
            });
        });
    });

    test("rejects conflicting deploy sources and a bad timeout before any request", async () => {
        await withSandbox(async (sandbox) => {
            const service = createService({});
            const cases = [
                ["--dir", "site", "--zip", "site.zip"],
                ["--dir", "site", "--project", "."],
                ["--zip", "site.zip", "--no-install"],
                ["--dir", "site", "--timeout", "soon"],
            ];

            for (const args of cases) {
                expect((await sandbox.run(["spaces", "deploy", "blog", ...args], service)).exitCode).toBe(2);
            }

            expect(service.requests).toHaveLength(0);
        });
    });

    test.skipIf(process.platform === "win32")("deploys a project: backend first, then the build, then the upload", async () => {
        await withSandbox(async (sandbox) => {
            await writeFiles(sandbox.cwd, {
                "build.js": [
                    "const fs = require('node:fs');",
                    "fs.mkdirSync('dist', { recursive: true });",
                    "fs.writeFileSync('dist/index.html', [process.env.VITE_CONVEX_URL, process.env.APP_URL, fs.existsSync('backend.json'), process.env.CONVEX_DEPLOY_KEY ?? 'no-key'].join('|'));",
                ].join("\n"),
                "convex/schema.ts": "",
                "node_modules/convex/bin/main.js": [
                    "const fs = require('node:fs');",
                    "fs.writeFileSync('backend.json', JSON.stringify({ args: process.argv.slice(2), key: process.env.CONVEX_DEPLOY_KEY }));",
                    "console.log('convex output');",
                ].join("\n"),
                "package.json": JSON.stringify({ scripts: { build: "node build.js" } }),
            });

            const service = createService({
                "GET /v1/spaces/blog": () => Response.json(space),
                [`GET /v1/spaces/${space.id}`]: () => Response.json(space),
                [`POST /v1/spaces/${space.id}/deploy-credentials`]: () => Response.json({
                    deploymentUrl: space.convexDeploymentUrl,
                    deploymentName: space.convexDeploymentName,
                    deployKey: "deploy-key-1",
                    expiresAt: 1_700_003_600,
                }),
                [`POST /v1/spaces/${space.id}/deploys`]: () => Response.json({ job }, { status: 202 }),
            });
            const result = await sandbox.run(
                ["spaces", "deploy", "blog", "--no-install", "--url-env", "APP_URL", "--wait", "--json"],
                service,
            );

            expect(result.stderr).not.toContain("deploy-key-1");
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({
                ...job,
                backendDeployed: true,
                convexDeploymentUrl: space.convexDeploymentUrl,
                url: space.url,
            });
            expect(result.stderr).toContain("convex output");
            expect(JSON.parse(await readFile(join(sandbox.cwd, "backend.json"), "utf8"))).toEqual({
                args: ["deploy", "--yes"],
                key: "deploy-key-1",
            });
            // The build ran after the backend, with the deployment URL and
            // without the deploy key.
            expect(await readFile(join(sandbox.cwd, "dist", "index.html"), "utf8"))
                .toBe(`${space.convexDeploymentUrl}|${space.convexDeploymentUrl}|true|no-key`);
            expect(service.requests.map(request => `${request.method} ${new URL(request.url).pathname}`)).toEqual([
                "GET /v1/spaces/blog",
                `POST /v1/spaces/${space.id}/deploy-credentials`,
                `POST /v1/spaces/${space.id}/deploys`,
                `GET /v1/spaces/${space.id}`,
            ]);
        });
    });

    test("refuses a project deploy to a suspended space before building", async () => {
        await withSandbox(async (sandbox) => {
            await writeFiles(sandbox.cwd, { "package.json": JSON.stringify({ scripts: { build: "exit 1" } }) });

            const service = createService({ "GET /v1/spaces/blog": () => Response.json({ ...space, status: "suspended" }) });
            const result = await sandbox.run(["spaces", "deploy", "blog", "--json"], service);

            expect(result.exitCode).toBe(1);
            expect(JSON.parse(result.stderr).error).toMatchObject({
                code: "spaces.suspended",
                details: { serviceCode: "space_suspended" },
            });
            expect(service.requests).toHaveLength(1);
        });
    });

    test("reads jobs and versions", async () => {
        await withSandbox(async (sandbox) => {
            const service = createService({
                "GET /v1/spaces/blog/artifacts": () => Response.json({ items: [artifact] }),
                "GET /v1/spaces/blog/deploys": () => Response.json({ items: [job] }),
                [`GET /v1/spaces/blog/deploys/${job.id}`]: () => Response.json(job),
            });
            const deployments = await sandbox.run(["spaces", "deployments", "blog", "--json"], service);
            const deployment = await sandbox.run(["spaces", "deployment", "blog", job.id], service);
            const artifacts = await sandbox.run(["spaces", "artifacts", "blog"], service);

            expect(JSON.parse(deployments.stdout)).toEqual([job]);
            expect(deployment.stdout).toStartWith(`${job.id}\n  - Kind: deploy\n  - Status: succeeded\n  - Version: 3\n`);
            expect(artifacts.stdout).toContain("v3       unpacked  yes     yes           2.00 KiB  4      2023-11-14T22:16:40Z  0123456789ab");
        });
    });

    test("rolls back to a version given as a number or as printed by artifacts", async () => {
        await withSandbox(async (sandbox) => {
            const bodies: unknown[] = [];
            const service = createService({
                "POST /v1/spaces/blog/rollback": async (request) => {
                    bodies.push(await request.json());

                    return Response.json({ job: { ...job, kind: "rollback", status: "queued" } }, { status: 202 });
                },
            });
            const result = await sandbox.run(["spaces", "rollback", "blog", "2"], service);

            await sandbox.run(["spaces", "rollback", "blog", "v3", "--json"], service);

            expect(result.stdout).toBe(`Rollback queued: job ${job.id} (queued)\n`);
            expect(bodies).toEqual([{ version: 2 }, { version: 3 }]);

            for (const version of ["0", "latest", "1.5", "-1"]) {
                expect((await sandbox.run(["spaces", "rollback", "blog", "--", version], service)).exitCode).toBe(2);
            }

            expect(bodies).toHaveLength(2);
        });
    });

    test("sets an environment variable from stdin without echoing the value", async () => {
        await withSandbox(async (sandbox) => {
            const secret = "﻿line-1\nline-2\n";
            let body: unknown;
            const service = createService({
                "PUT /v1/spaces/blog/env/API_KEY": async (request) => {
                    body = await request.json();

                    return Response.json({ name: "API_KEY", value: secret });
                },
            });
            const result = await sandbox.run(["spaces", "env", "set", "blog", "API_KEY", "--stdin", "--json"], {
                ...service,
                stdin: createPipedInput(secret),
            });

            expect(result.exitCode).toBe(0);
            expect(body).toEqual({ value: secret });
            expect(JSON.parse(result.stdout)).toEqual({ name: "API_KEY" });
            expect(result.stderr).toBe("");
        });
    });

    test("stores empty stdin as an empty value", async () => {
        await withSandbox(async (sandbox) => {
            let body: unknown;
            const service = createService({
                "PUT /v1/spaces/blog/env/EMPTY": async (request) => {
                    body = await request.json();

                    return Response.json({ name: "EMPTY" });
                },
            });
            const result = await sandbox.run(["spaces", "env", "set", "blog", "EMPTY", "--stdin"], {
                ...service,
                stdin: createPipedInput(""),
            });

            expect(result.stdout).toBe("Set EMPTY.\n");
            expect(body).toEqual({ value: "" });
        });
    });

    test("rejects a value that is not piped, a bad name and an oversized value", async () => {
        await withSandbox(async (sandbox) => {
            const service = createService({});
            const cases = [
                { args: ["KEY"], code: "spaces.stdinRequired", stdin: createPipedInput("x") },
                { args: ["1BAD", "--stdin"], code: "spaces.invalidEnvName", stdin: createPipedInput("x") },
                { args: ["KEY", "--stdin"], code: "spaces.stdinTty", stdin: createInteractiveInput({ isTTY: true }) },
                { args: ["KEY", "--stdin"], code: "spaces.envValueTooLarge", stdin: createPipedInput("中".repeat(2_731)) },
            ];

            for (const item of cases) {
                const result = await sandbox.run(["spaces", "env", "set", "blog", ...item.args, "--json"], {
                    ...service,
                    stdin: item.stdin,
                });

                expect(result.exitCode).toBe(2);
                expect(JSON.parse(result.stderr).error.code).toBe(item.code);
            }

            expect(service.requests).toHaveLength(0);
        });
    });

    test("lists variable names only and removes one after confirmation", async () => {
        await withSandbox(async (sandbox) => {
            const service = createService({
                "DELETE /v1/spaces/blog/env/API_KEY": () => Response.json({ name: "API_KEY" }),
                "GET /v1/spaces/blog/env": () => Response.json({ names: ["API_KEY"], values: { API_KEY: "secret" } }),
            });
            const list = await sandbox.run(["spaces", "env", "list", "blog", "--json"], service);
            const refused = await sandbox.run(["spaces", "env", "remove", "blog", "API_KEY"], service);
            const removed = await sandbox.run(["spaces", "env", "remove", "blog", "API_KEY", "--yes"], service);

            expect(JSON.parse(list.stdout)).toEqual({ names: ["API_KEY"] });
            expect(refused.exitCode).toBe(2);
            expect(removed.stdout).toBe("Removed API_KEY.\n");
        });
    });

    test("reads and changes who can open the site", async () => {
        await withSandbox(async (sandbox) => {
            let body: unknown;
            const service = createService({
                "GET /v1/spaces/blog/access": () => Response.json({ visibility: "team" }),
                "POST /v1/spaces/blog/access/revoke-sessions": () => Response.json({ ok: true }),
                "PUT /v1/spaces/blog/access": async (request) => {
                    body = await request.json();

                    return Response.json({ visibility: "public" });
                },
            });
            const get = await sandbox.run(["spaces", "access", "get", "blog"], service);
            const set = await sandbox.run(["spaces", "access", "set", "blog", "--visibility", "public", "--json"], service);
            const revoke = await sandbox.run(["spaces", "access", "revoke-sessions", "blog", "--json"], service);

            expect(get.stdout).toBe("team\n");
            expect(JSON.parse(set.stdout)).toEqual({ visibility: "public" });
            expect(body).toEqual({ visibility: "public" });
            expect(JSON.parse(revoke.stdout)).toEqual({ ok: true });
            expect((await sandbox.run(["spaces", "access", "set", "blog"], service)).exitCode).toBe(2);
            expect((await sandbox.run(["spaces", "access", "set", "blog", "--visibility", "private"], service)).exitCode).toBe(2);
        });
    });

    test("shows daily usage for a UTC period", async () => {
        await withSandbox(async (sandbox) => {
            const usage = {
                from: "2026-09-01",
                to: "2026-09-02",
                items: [{
                    spaceId: space.id,
                    day: "2026-09-01",
                    sampledAt: 1_700_000_000,
                    seedStatus: "complete",
                    metrics: {
                        dataEgressGb: { unit: "GB", currentDay: 0.001234567, currentMonth: 0.5 },
                        functionCalls: { unit: "count", currentDay: 12, currentMonth: 340 },
                    },
                }],
            };
            const service = createService({ "GET /v1/spaces/blog/usage": () => Response.json(usage) });
            const result = await sandbox.run(["spaces", "usage", "blog", "--from", "2026-09-01", "--to", "2026-09-02"], service);
            const query = new URL(service.requests[0]!.url).searchParams;

            expect(result.stdout).toContain("2026-09-01  complete  12           340            -         0.0012     2023-11-14T22:13:20Z");
            expect(query.get("from")).toBe("2026-09-01");
            expect(query.get("to")).toBe("2026-09-02");
            expect((await sandbox.run(["spaces", "usage", "blog", "--from", "09/01/2026"], service)).exitCode).toBe(2);
            expect(service.requests).toHaveLength(1);
        });
    });

    test("reports a service failure with its code in the details", async () => {
        await withSandbox(async (sandbox) => {
            const service = createService({
                "GET /v1/spaces/nope": () => Response.json({ code: "space_not_found", message: "Space not found" }, { status: 404 }),
            });
            const result = await sandbox.run(["spaces", "get", "nope", "--json"], service);

            expect(result.exitCode).toBe(1);
            expect(JSON.parse(result.stderr).error).toEqual({
                code: "spaces.serviceError",
                details: { httpStatus: 404, serviceCode: "space_not_found" },
                exitCode: 1,
                message: "Spaces request failed with HTTP 404 (space_not_found): Space not found",
            });
        });
    });
});

async function withSandbox(run: (sandbox: CliSandbox) => Promise<void>): Promise<void> {
    const sandbox = await createCliSandbox();

    try {
        await writeAuthFile(sandbox);
        await run(sandbox);
    }
    finally {
        await sandbox.cleanup();
    }
}

// A fake Spaces service: routes are keyed by "<METHOD> <path>", and a request
// without a route fails the test.
function createService(routes: Record<string, (request: Request) => Promise<Response> | Response>): {
    fetcher: Fetcher;
    requests: Request[];
} {
    const requests: Request[] = [];

    return {
        fetcher: async (input, init) => {
            const request = toRequest(input, init);
            const url = new URL(request.url);
            const route = routes[`${request.method} ${url.pathname}`];

            if (url.origin !== apiBase || route === undefined) {
                throw new Error(`Unexpected request: ${request.method} ${request.url}`);
            }

            // Recorded as a second instance, so a route can consume the body.
            requests.push(toRequest(input, init));

            return await route(request);
        },
        requests,
    };
}

function createPipedInput(content: string): ReturnType<typeof createInteractiveInput> {
    const stdin = createInteractiveInput({ isTTY: false });

    stdin.feed(content);
    stdin.end();

    return stdin;
}

async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
    for (const [path, content] of Object.entries(files)) {
        const target = join(root, path);

        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
    }
}
