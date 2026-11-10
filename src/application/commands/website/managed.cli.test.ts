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
            const result = await sandbox.run(["website", "inquiries", "--site", website.id, "--cursor", "cursor-a", "--team", "team-a", "--json"], {
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
                { args: ["deployments", "--site", website.id], path: `/v1/websites/${website.id}/deployments`, body: { items: [deployment] }, output: { items: [deployment] } },
                { args: ["deployment", deployment.id, "--site", website.id], path: `/v1/websites/${website.id}/deployments/${deployment.id}`, body: { deployment }, output: deployment },
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
            const result = await sandbox.run(["website", "rollback", deployment.id, "--site", website.id, "--team", "team-a", "--json"], {
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
            expect(JSON.parse(result.stdout)).toEqual({ ...website, project_dir: dir });
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

    test("starts a new create attempt when the directory holds only a stale or unreadable journal", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const dir = join(sandbox.env.HOME!, "stale-site");
            const keys: (string | null)[] = [];
            let rejecting = true;
            const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
                keys.push(toRequest(input, init).headers.get("Idempotency-Key"));
                return rejecting
                    ? Response.json({ message: "Website limit reached", code: "website_limit_reached" }, { status: 409 })
                    : Response.json({ website }, { status: 201 });
            };
            expect((await sandbox.run(["website", "create", "First name", "--dir", dir, "--team", "team-a"], { fetcher })).exitCode).toBe(1);
            rejecting = false;
            const renamed = await sandbox.run(["website", "create", website.name, "--dir", dir, "--team", "team-a", "--json"], { fetcher });
            expect(renamed.exitCode).toBe(0);
            expect(keys).toHaveLength(2);
            expect(keys[1]).not.toBe(keys[0]);
            expect(JSON.parse(await Bun.file(join(dir, ".leina-create.json")).text())).toMatchObject({ key: keys[1], name: website.name });

            const corruptDir = join(sandbox.env.HOME!, "corrupt-site");
            await Bun.write(join(corruptDir, ".leina-create.json"), "{not json");
            const corrupt = await sandbox.run(["website", "create", website.name, "--dir", corruptDir, "--team", "team-a", "--json"], { fetcher });
            expect(corrupt.exitCode).toBe(0);
            expect(await Bun.file(join(corruptDir, "leina-website.json")).exists()).toBeTrue();

            const busyDir = join(sandbox.env.HOME!, "busy-site");
            await Bun.write(join(busyDir, "README.md"), "existing");
            const busy = await sandbox.run(["website", "create", website.name, "--dir", busyDir, "--team", "team-a"], { fetcher });
            expect(busy.exitCode).toBe(2);
            expect(busy.stderr).toContain("empty directory");
        }
        finally { await sandbox.cleanup(); }
    });

    test("reports an unreadable project link instead of a parse error", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const dir = join(sandbox.env.HOME!, "linked-site");
            const fetcher = async () => Response.json({ website }, { status: 201 });
            const args = ["website", "create", website.name, "--dir", dir, "--team", "team-a"];
            expect((await sandbox.run(args, { fetcher })).exitCode).toBe(0);
            await Bun.write(join(dir, "leina-website.json"), "{not json");

            const create = await sandbox.run(args, { fetcher });
            expect(create.exitCode).toBe(2);
            expect(create.stderr).toContain("linked to a different website");

            const requests: string[] = [];
            const deploy = await sandbox.run(["website", "deploy", "--project", dir, "--team", "team-a"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init).url);
                    return Response.json({ website });
                },
            });
            expect(deploy.exitCode).toBe(2);
            expect(deploy.stderr).toContain("leina-website.json");
            expect(requests).toEqual([]);
        }
        finally { await sandbox.cleanup(); }
    });

    test("defaults to the current directory for the project and its website", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const paths: string[] = [];
            const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
                const request = toRequest(input, init);
                paths.push(`${request.method} ${new URL(request.url).pathname}`);
                if (request.method === "POST" && !request.url.endsWith("/rollback"))
                    return Response.json({ website }, { status: 201 });
                return Response.json({ website, deployment, items: [], next_cursor: null });
            };

            // Without a project link there is no website to act on.
            const unlinked = await sandbox.run(["website", "get", "--team", "team-a"], { fetcher });
            expect(unlinked.exitCode).toBe(2);
            expect(unlinked.stderr).toContain("--site");
            expect(paths).toEqual([]);

            const created = await sandbox.run(["website", "create", website.name, "--team", "team-a", "--json"], { fetcher });
            expect(created.exitCode).toBe(0);
            expect(JSON.parse(created.stdout).project_dir).toBe(sandbox.cwd);
            expect(JSON.parse(await Bun.file(join(sandbox.cwd, "leina-website.json")).text()).website_id).toBe(website.id);

            // Retrying the same create stays in the current directory.
            const retried = await sandbox.run(["website", "create", website.name, "--team", "team-a", "--json"], { fetcher });
            expect(retried.exitCode).toBe(0);
            expect(JSON.parse(retried.stdout).project_dir).toBe(sandbox.cwd);

            // A directory that already holds files gets a subdirectory named
            // after the website instead.
            const nested = await sandbox.run(["website", "create", " Second/Site: v2. ", "--team", "team-a", "--json"], { fetcher });
            expect(nested.exitCode).toBe(0);
            const nestedDir = join(sandbox.cwd, "second-site-v2");
            expect(JSON.parse(nested.stdout).project_dir).toBe(nestedDir);
            expect(JSON.parse(await Bun.file(join(nestedDir, "leina-website.json")).text()).website_id).toBe(website.id);

            const base = `/v1/websites/${website.id}`;
            const cases = [
                { args: ["get"], request: `GET ${base}` },
                { args: ["deployments"], request: `GET ${base}/deployments` },
                { args: ["deployment", deployment.id], request: `GET ${base}/deployments/${deployment.id}` },
                { args: ["rollback", deployment.id], request: `POST ${base}/rollback` },
                { args: ["inquiries"], request: `GET ${base}/inquiries` },
                // An explicit website wins over the project link.
                { args: ["get", "--site", "other-site"], request: "GET /v1/websites/other-site" },
            ];
            for (const item of cases) {
                paths.length = 0;
                const result = await sandbox.run(["website", ...item.args, "--team", "team-a", "--json"], { fetcher });
                expect(result.exitCode).toBe(0);
                expect(paths).toEqual([item.request]);
            }
        }
        finally { await sandbox.cleanup(); }
    });

    test("shows the service message and code when a request fails", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const fetcher = async () => Response.json({ message: "Website not found", code: "website_not_found" }, { status: 404 });
            const result = await sandbox.run(["website", "get", "--site", website.id, "--team", "team-a"], { fetcher });
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("Website not found");
            expect(result.stderr).toContain("website_not_found");
            expect(result.stderr).toContain("404");
            const json = await sandbox.run(["website", "get", "--site", website.id, "--team", "team-a", "--json"], { fetcher });
            expect(json.exitCode).toBe(1);
            expect(JSON.parse(json.stderr).error.details).toEqual({ httpStatus: 404, serviceCode: "website_not_found" });
        }
        finally { await sandbox.cleanup(); }
    });

    test("refuses a project linked to another team before executing its build", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const dir = join(sandbox.env.HOME!, "other-site");
            await Bun.write(join(dir, "leina-website.json"), JSON.stringify({ website_id: website.id, team_id: "team-b" }));
            const requests: string[] = [];
            const result = await sandbox.run(["website", "deploy", "--project", dir, "--team", "team-a", "--json"], {
                fetcher: async (input, init) => {
                    requests.push(new URL(toRequest(input, init).url).pathname);
                    return Response.json({ website });
                },
            });
            // The website is the one the project link names, not a CLI argument.
            expect(requests).toEqual([`/v1/websites/${website.id}`]);
            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("different team");
        }
        finally { await sandbox.cleanup(); }
    });

    test("refuses a project without a website link before any request", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const requests: string[] = [];
            const result = await sandbox.run(["website", "deploy", "--team", "team-a"], {
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
