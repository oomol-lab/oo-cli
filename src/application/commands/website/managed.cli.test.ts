import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { createCliSandbox, toRequest, writeAuthFile } from "../../../../__tests__/helpers.ts";

const apiBase = "https://websites-api.oomol.com";
const website = {
    id: "0198a6f0-0000-7000-8000-000000000001",
    team_id: "team-a",
    name: "Example website",
    status: "draft",
    hostname: "0198a6f0-0000-7000-8000-000000000001.leina.site",
    url: "https://0198a6f0-0000-7000-8000-000000000001.leina.site/",
    active_deployment_id: null,
    created_at: 1,
    updated_at: 1,
};
const deployment = {
    id: "0198a6f0-0000-7000-8000-000000000002",
    website_id: website.id,
    status: "succeeded",
    active: true,
    restorable: true,
    file_count: 3,
    total_bytes: 1024,
    error_message: null,
    upload_expires_at: 3_600_001,
    created_at: 1,
    published_at: 2,
    pruned_at: null,
};

describe("managed website commands", () => {
    test("paginates inquiries without changing the selected team", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            let request: Request | undefined;
            const result = await sandbox.run(["website", "inquiries", website.id, "--cursor", "cursor-a", "--team", "team-a", "--json"], {
                fetcher: async (input, init) => {
                    request = toRequest(input, init);
                    return Response.json({ items: [], next_cursor: null });
                },
            });
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({ items: [], next_cursor: null });
            const url = new URL(request!.url);
            expect(url.origin + url.pathname).toBe(`${apiBase}/v1/websites/${website.id}/inquiries`);
            expect(url.searchParams.get("cursor")).toBe("cursor-a");
            expect(request!.headers.get("x-oo-team-name")).toBe("team-a");
        }
        finally { await sandbox.cleanup(); }
    });

    test("reads deployments under the selected team", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const cases = [
                { args: ["deployments", website.id], path: `/v1/websites/${website.id}/deployments`, body: { items: [deployment] }, output: { items: [deployment] } },
                { args: ["deployment", website.id, deployment.id], path: `/v1/websites/${website.id}/deployments/${deployment.id}`, body: { deployment }, output: deployment },
            ];
            for (const item of cases) {
                let request: Request | undefined;
                const result = await sandbox.run(["website", ...item.args, "--team", "team-a", "--json"], {
                    fetcher: async (input, init) => {
                        request = toRequest(input, init);
                        return Response.json(item.body);
                    },
                });
                expect(result.exitCode).toBe(0);
                expect(JSON.parse(result.stdout)).toEqual(item.output);
                expect(request!.method).toBe("GET");
                expect(request!.url).toBe(`${apiBase}${item.path}`);
                expect(request!.headers.get("x-oo-team-name")).toBe("team-a");
                expect(request!.headers.get("Idempotency-Key")).toBeNull();
            }
        }
        finally { await sandbox.cleanup(); }
    });

    test("rolls back to a deployment using an idempotency key", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            let request: Request | undefined;
            const result = await sandbox.run(["website", "rollback", website.id, deployment.id, "--team", "team-a", "--json"], {
                fetcher: async (input, init) => {
                    request = toRequest(input, init);
                    return Response.json({ website: { ...website, status: "live", active_deployment_id: deployment.id } });
                },
            });
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout).active_deployment_id).toBe(deployment.id);
            expect(request!.method).toBe("POST");
            expect(request!.url).toBe(`${apiBase}/v1/websites/${website.id}/rollback`);
            expect(request!.headers.get("Idempotency-Key")).toBeTruthy();
            expect(await request!.json()).toEqual({ deployment_id: deployment.id });
        }
        finally { await sandbox.cleanup(); }
    });

    test("creates an Astro SSR project using only the managed account and team", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const dir = join(sandbox.env.HOME!, "new-site");
            const requests: Request[] = [];
            const result = await sandbox.run(["website", "create", website.name, "--dir", dir, "--team", "team-a", "--json"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));
                    return Response.json({ website }, { status: 201 });
                },
            });
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual(website);
            expect(requests).toHaveLength(1);
            expect(requests[0]!.url).toBe(`${apiBase}/v1/websites`);
            expect(requests[0]!.headers.get("Authorization")).toBe("secret-1");
            expect(requests[0]!.headers.get("x-oo-team-name")).toBe("team-a");
            expect(requests[0]!.headers.get("Idempotency-Key")).toBeTruthy();
            expect(await requests[0]!.json()).toEqual({ name: website.name });
            expect(JSON.parse(await Bun.file(join(dir, "leina-website.json")).text())).toEqual({
                website_id: website.id,
                team_id: website.team_id,
            });
            const config = await Bun.file(join(dir, "astro.config.mjs")).text();
            expect(config).toContain("output: \"server\"");
            expect(config).toContain("@astrojs/cloudflare");
            expect(config).not.toContain("base:");
            expect(await Bun.file(join(dir, "src", "pages", "products", "featured.astro")).exists()).toBeTrue();
            const contact = await Bun.file(join(dir, "src", "pages", "contact.astro")).text();
            expect(contact).toContain("data-leina-inquiry");
            expect(contact).toContain("\"/_leina/inquiry\"");
            expect(await Bun.file(join(dir, "src", "layouts", "Site.astro")).text()).not.toContain("tracker.js");
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
                return failing
                    ? Response.json({ message: "Internal error", code: "internal_error" }, { status: 500 })
                    : Response.json({ website }, { status: 201 });
            };
            const args = ["website", "create", website.name, "--dir", dir, "--team", "team-a", "--json"];
            expect((await sandbox.run(args, { fetcher })).exitCode).toBe(1);
            failing = false;
            expect((await sandbox.run(args, { fetcher })).exitCode).toBe(0);
            expect(keys).toHaveLength(2);
            expect(new Set(keys).size).toBe(1);
        }
        finally { await sandbox.cleanup(); }
    });

    test("shows the service message and code when a request fails", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const fetcher = async () => Response.json({ message: "Website not found", code: "website_not_found" }, { status: 404 });
            const result = await sandbox.run(["website", "get", website.id, "--team", "team-a"], { fetcher });
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("Website not found");
            expect(result.stderr).toContain("website_not_found");
            expect(result.stderr).toContain("404");
            const json = await sandbox.run(["website", "get", website.id, "--team", "team-a", "--json"], { fetcher });
            expect(json.exitCode).toBe(1);
            expect(JSON.parse(json.stderr).error.details).toEqual({ httpStatus: 404, serviceCode: "website_not_found" });
        }
        finally { await sandbox.cleanup(); }
    });

    test("refuses a project linked to another site before executing its build", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const dir = join(sandbox.env.HOME!, "other-site");
            await Bun.write(join(dir, "leina-website.json"), JSON.stringify({ website_id: "other", team_id: "team-b" }));
            const result = await sandbox.run(["website", "deploy", website.id, "--project", dir, "--team", "team-a", "--json"], {
                fetcher: async () => Response.json({ website }),
            });
            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("different website or team");
        }
        finally { await sandbox.cleanup(); }
    });

    test("refuses a project without a website link before any request", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const requests: string[] = [];
            const result = await sandbox.run(["website", "deploy", website.id, "--project", sandbox.cwd, "--team", "team-a"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init).url);
                    return Response.json({ website });
                },
            });
            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("leina-website.json");
            expect(requests).toEqual([]);
        }
        finally { await sandbox.cleanup(); }
    });
});
