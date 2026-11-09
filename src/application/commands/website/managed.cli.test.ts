import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { createCliSandbox, toRequest, writeAuthFile } from "../../../../__tests__/helpers.ts";

const site = {
    id: "11111111-1111-4111-8111-111111111111",
    teamId: "team-a",
    name: "Example website",
    status: "draft",
    publicUrl: "https://websites.oomol.com/s/example/",
    consoleUrl: "https://console.leina.ai/websites/example?team=team-a",
    basePath: "/s/example/",
    analyticsStatus: "pending",
};

describe("managed website commands", () => {
    test("paginates inquiries without changing the selected team", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            let request: Request | undefined;
            const result = await sandbox.run(["website", "inquiries", site.id, "--cursor", "cursor-a", "--team", "team-a", "--json"], {
                fetcher: async (input, init) => {
                    request = toRequest(input, init);
                    return Response.json({ items: [], nextCursor: null });
                },
            });
            expect(result.exitCode).toBe(0);
            expect(new URL(request!.url).searchParams.get("cursor")).toBe("cursor-a");
            expect(request!.headers.get("x-oo-team-name")).toBe("team-a");
        }
        finally { await sandbox.cleanup(); }
    });

    test("queries and retries a deployment under the selected team", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const deployment = { id: "release-a", siteId: site.id, status: "publishing", error: null, createdAt: 1 };
            for (const command of ["deployment", "retry"]) {
                let request: Request | undefined;
                const result = await sandbox.run(["website", command, site.id, deployment.id, "--team", "team-a", "--json"], {
                    fetcher: async (input, init) => {
                        request = toRequest(input, init);
                        return Response.json(command === "retry" ? { deployment } : deployment);
                    },
                });
                expect(result.exitCode).toBe(0);
                expect(request!.headers.get("x-oo-team-name")).toBe("team-a");
                expect(request!.method).toBe(command === "retry" ? "POST" : "GET");
                expect(new URL(request!.url).pathname).toBe(`/v1/websites/${site.id}/deployments/release-a${command === "retry" ? "/retry" : ""}`);
            }
        }
        finally { await sandbox.cleanup(); }
    });

    test("rolls back a retained release using an idempotency key", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            let request: Request | undefined;
            const result = await sandbox.run(["website", "rollback", site.id, "release-a", "--team", "team-a", "--json"], {
                fetcher: async (input, init) => {
                    request = toRequest(input, init);
                    return Response.json(site);
                },
            });
            expect(result.exitCode).toBe(0);
            expect(request!.headers.get("Idempotency-Key")).toBeTruthy();
            expect(await request!.json()).toEqual({ deploymentId: "release-a" });
        }
        finally { await sandbox.cleanup(); }
    });

    test("creates an Astro SSR project using only the managed account and team", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const dir = join(sandbox.env.HOME!, "new-site");
            const requests: Request[] = [];
            const result = await sandbox.run(["website", "create", site.name, "--dir", dir, "--team", "team-a", "--json"], {
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);
                    requests.push(request);
                    return Response.json(site, { status: 201 });
                },
            });
            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(1);
            expect(requests[0]!.url).toBe("https://websites.oomol.com/v1/websites");
            expect(requests[0]!.headers.get("Authorization")).toBe("secret-1");
            expect(requests[0]!.headers.get("x-oo-team-name")).toBe("team-a");
            expect(requests[0]!.headers.get("Idempotency-Key")).toBeTruthy();
            expect(JSON.parse(await Bun.file(join(dir, "leina-website.json")).text())).toEqual({
                siteId: site.id,
                teamId: site.teamId,
                basePath: site.basePath,
            });
            const config = await Bun.file(join(dir, "astro.config.mjs")).text();
            expect(config).toContain("output: \"server\"");
            expect(config).toContain("@astrojs/cloudflare");
            expect(await Bun.file(join(dir, "src/pages/products/featured.astro")).exists()).toBeTrue();
            expect(await Bun.file(join(dir, "src/pages/contact.astro")).text()).toContain("data-leina-inquiry");
        }
        finally { await sandbox.cleanup(); }
    });

    test("reuses the create key after a service failure", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const dir = join(sandbox.env.HOME!, "retry-site");
            const keys: (string | null)[] = [];
            let failing = true;
            const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
                keys.push(toRequest(input, init).headers.get("Idempotency-Key"));
                return failing ? Response.json({}, { status: 503 }) : Response.json(site, { status: 201 });
            };
            const args = ["website", "create", site.name, "--dir", dir, "--team", "team-a", "--json"];
            expect((await sandbox.run(args, { fetcher })).exitCode).toBe(1);
            failing = false;
            expect((await sandbox.run(args, { fetcher })).exitCode).toBe(0);
            expect(new Set(keys).size).toBe(1);
        }
        finally { await sandbox.cleanup(); }
    });

    test("refuses a project linked to another site before executing its build", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const dir = join(sandbox.env.HOME!, "other-site");
            await Bun.write(join(dir, "leina-website.json"), JSON.stringify({ siteId: "other", teamId: "team-b" }));
            const result = await sandbox.run(["website", "deploy", site.id, "--project", dir, "--team", "team-a", "--json"], {
                fetcher: async () => Response.json(site),
            });
            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("different website or team");
        }
        finally { await sandbox.cleanup(); }
    });

    test("queries a fixed analytics window in the selected team", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const data = { status: "ready", siteId: site.id, days: 7, from: 1, to: 2, visitors: 2, pageviews: 3, inquiries: 1, daily: [] };
            let request: Request | undefined;
            const result = await sandbox.run(["website", "analytics", site.id, "--team", "team-a", "--json"], {
                fetcher: async (input, init) => {
                    request = toRequest(input, init);
                    return Response.json(data);
                },
            });
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual(data);
            expect(new URL(request!.url).searchParams.get("days")).toBe("7");
            expect(request!.headers.get("x-oo-team-name")).toBe("team-a");
            expect((await sandbox.run(["website", "analytics", site.id, "--days", "31"])).exitCode).not.toBe(0);
        }
        finally { await sandbox.cleanup(); }
    });
});
