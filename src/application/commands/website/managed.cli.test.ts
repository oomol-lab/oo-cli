import { rename } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { createCliSandbox, toRequest, writeAuthFile } from "../../../../__tests__/helpers.ts";

const apiBase = "https://websites-api.oomol.com";
const website = {
    id: "0198a6f0-0000-7000-8000-000000000001",
    team_id: "team-a",
    name: "Example website",
    status: "draft",
    hostname: "0198a6f0-0000-7000-8000-000000000001.sitelive.net",
    url: "https://0198a6f0-0000-7000-8000-000000000001.sitelive.net/",
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
const customDomain = {
    hostname: "www.example.com",
    url: "https://www.example.com/",
    status: "pending",
    message: null,
    verification: { type: "TXT", name: "_sitelive.www.example.com", value: "0123456789abcdef0123456789abcdef" },
    dns: { type: "CNAME", name: "www.example.com", value: "cname.sitelive.net" },
    created_at: 1,
    verified_at: 1,
    checked_at: null,
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
            expect(JSON.parse(await Bun.file(join(dir, "sitelive-website.json")).text())).toEqual({
                website_id: website.id,
                team_id: website.team_id,
            });
            const config = await Bun.file(join(dir, "astro.config.mjs")).text();
            expect(config).toContain("output: \"server\"");
            expect(config).toContain("@astrojs/cloudflare");
            expect(config).not.toContain("base:");
            expect(await Bun.file(join(dir, "src", "pages", "products", "featured.astro")).exists()).toBeTrue();
            const contact = await Bun.file(join(dir, "src", "pages", "contact.astro")).text();
            expect(contact).toContain("data-inquiry-form");
            expect(contact).toContain("\"/_sitelive/inquiry\"");
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
            expect(JSON.parse(await Bun.file(join(dir, ".sitelive-create.json")).text())).toMatchObject({ key: keys[1], name: website.name });

            const corruptDir = join(sandbox.env.HOME!, "corrupt-site");
            await Bun.write(join(corruptDir, ".sitelive-create.json"), "{not json");
            const corrupt = await sandbox.run(["website", "create", website.name, "--dir", corruptDir, "--team", "team-a", "--json"], { fetcher });
            expect(corrupt.exitCode).toBe(0);
            expect(await Bun.file(join(corruptDir, "sitelive-website.json")).exists()).toBeTrue();

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
            await Bun.write(join(dir, "sitelive-website.json"), "{not json");

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
            expect(deploy.stderr).toContain("sitelive-website.json");
            expect(requests).toEqual([]);
        }
        finally { await sandbox.cleanup(); }
    });

    test("keeps working in a project that carries the legacy link and journal names", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const requests: Request[] = [];
            const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
                const request = toRequest(input, init);
                requests.push(request);
                return request.method === "POST"
                    ? Response.json({ website }, { status: 201 })
                    : Response.json({ website });
            };
            const args = ["website", "create", website.name, "--team", "team-a", "--json"];
            expect((await sandbox.run(args, { fetcher })).exitCode).toBe(0);
            // An older release wrote the same two files under these names.
            await rename(join(sandbox.cwd, "sitelive-website.json"), join(sandbox.cwd, "leina-website.json"));
            await rename(join(sandbox.cwd, ".sitelive-create.json"), join(sandbox.cwd, ".leina-create.json"));

            const got = await sandbox.run(["website", "get", "--team", "team-a", "--json"], { fetcher });
            expect(got.exitCode).toBe(0);
            expect(new URL(requests.at(-1)!.url).pathname).toBe(`/v1/websites/${website.id}`);

            // Retrying the create replays the same website in place: same
            // key, same directory, and no second link file.
            const retried = await sandbox.run(args, { fetcher });
            expect(retried.exitCode).toBe(0);
            expect(JSON.parse(retried.stdout).project_dir).toBe(sandbox.cwd);
            expect(requests.at(-1)!.headers.get("Idempotency-Key")).toBe(requests[0]!.headers.get("Idempotency-Key"));
            expect(await Bun.file(join(sandbox.cwd, "sitelive-website.json")).exists()).toBeFalse();
            expect(await Bun.file(join(sandbox.cwd, ".sitelive-create.json")).exists()).toBeFalse();
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
                return Response.json({ website, deployment, items: [], next_cursor: null, custom_domain: null });
            };

            // Without a project link there is no website to act on.
            const unlinked = await sandbox.run(["website", "get", "--team", "team-a"], { fetcher });
            expect(unlinked.exitCode).toBe(2);
            expect(unlinked.stderr).toContain("--site");
            expect(paths).toEqual([]);

            const created = await sandbox.run(["website", "create", website.name, "--team", "team-a", "--json"], { fetcher });
            expect(created.exitCode).toBe(0);
            expect(JSON.parse(created.stdout).project_dir).toBe(sandbox.cwd);
            expect(JSON.parse(await Bun.file(join(sandbox.cwd, "sitelive-website.json")).text()).website_id).toBe(website.id);

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
            expect(JSON.parse(await Bun.file(join(nestedDir, "sitelive-website.json")).text()).website_id).toBe(website.id);

            const base = `/v1/websites/${website.id}`;
            const cases = [
                { args: ["get"], request: `GET ${base}` },
                { args: ["deployments"], request: `GET ${base}/deployments` },
                { args: ["deployment", deployment.id], request: `GET ${base}/deployments/${deployment.id}` },
                { args: ["rollback", deployment.id], request: `POST ${base}/rollback` },
                { args: ["resume"], request: `POST ${base}/resume` },
                { args: ["delete", "--yes"], request: `DELETE ${base}` },
                { args: ["inquiries"], request: `GET ${base}/inquiries` },
                { args: ["domain"], request: `GET ${base}/custom-domain` },
                { args: ["domain", "remove"], request: `DELETE ${base}/custom-domain` },
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

    test("prints the website details as labeled text", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const draft = await sandbox.run(["website", "get", "--site", website.id, "--team", "team-a"], {
                fetcher: async () => Response.json({ website }),
            });
            expect(draft.exitCode).toBe(0);
            expect(draft.stdout).toBe([
                website.name,
                `  - ID: ${website.id}`,
                "  - Status: draft",
                `  - URL: ${website.url}`,
                "  - Active deployment: none (not published yet)",
                "  - Custom domain: none",
                "  - Analytics: available after the first deploy",
                "  - Created at: 1970-01-01T00:00:00.001Z",
                "  - Updated at: 1970-01-01T00:00:00.001Z",
                "",
            ].join("\n"));
            const live = await sandbox.run(["website", "get", "--site", website.id, "--team", "team-a"], {
                fetcher: async () => Response.json({ website: { ...website, status: "live", active_deployment_id: deployment.id } }),
            });
            expect(live.stdout).toContain("  - Status: live\n");
            expect(live.stdout).toContain(`  - Active deployment: ${deployment.id}\n`);
            const bound = await sandbox.run(["website", "get", "--site", website.id, "--team", "team-a"], {
                fetcher: async () => Response.json({ website: { ...website, custom_domain: { ...customDomain, status: "active" } } }),
            });
            expect(bound.stdout).toContain("  - Custom domain: www.example.com (active)\n");
            const analytics = { website_id: website.id, report_url: `https://analytics.oomol.com/teams/team-a/websites/${website.id}` };
            const tracked = await sandbox.run(["website", "get", "--site", website.id, "--team", "team-a"], {
                fetcher: async () => Response.json({ website: { ...website, analytics } }),
            });
            expect(tracked.stdout).toContain(`  - Analytics: ${analytics.report_url}\n`);
            const json = await sandbox.run(["website", "get", "--site", website.id, "--team", "team-a", "--json"], {
                fetcher: async () => Response.json({ website: { ...website, analytics } }),
            });
            expect(JSON.parse(json.stdout).analytics).toEqual(analytics);
        }
        finally { await sandbox.cleanup(); }
    });

    test("shows the billing state of a website and keeps it in JSON", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const active = { status: "active", next_charge_at: 86_400_000, suspended_at: null, grace_ends_at: null };
            const suspended = { status: "suspended", next_charge_at: null, suspended_at: 86_400_000, grace_ends_at: 950_400_000 };
            const paid = await sandbox.run(["website", "get", "--site", website.id, "--team", "team-a"], {
                fetcher: async () => Response.json({ website: { ...website, billing: active } }),
            });
            expect(paid.stdout).toContain("  - Billing: active, next charge 1970-01-02T00:00:00.000Z\n");
            const unpaid = await sandbox.run(["website", "get", "--site", website.id, "--team", "team-a"], {
                fetcher: async () => Response.json({ website: { ...website, billing: suspended } }),
            });
            expect(unpaid.stdout).toContain("  - Billing: suspended since 1970-01-02T00:00:00.000Z");
            expect(unpaid.stdout).toContain("oo website resume before 1970-01-12T00:00:00.000Z");
            const json = await sandbox.run(["website", "get", "--site", website.id, "--team", "team-a", "--json"], {
                fetcher: async () => Response.json({ website: { ...website, billing: suspended } }),
            });
            expect(JSON.parse(json.stdout).billing).toEqual(suspended);
            const listed = await sandbox.run(["website", "list", "--team", "team-a"], {
                fetcher: async () => Response.json({ items: [{ ...website, billing: active }, { ...website, name: "Unpaid", billing: suspended }] }),
            });
            expect(listed.stdout).toBe([
                `${website.id}  ${website.name}  draft  ${website.url}`,
                `${website.id}  Unpaid  draft  ${website.url}  suspended`,
                "",
            ].join("\n"));
        }
        finally { await sandbox.cleanup(); }
    });

    test("resumes a suspended website with an idempotency key and no body", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            let request: Request | undefined;
            const result = await sandbox.run(["website", "resume", "--site", website.id, "--team", "team-a"], {
                fetcher: async (input, init) => {
                    request = toRequest(input, init);
                    return Response.json({ website: { ...website, status: "live" } });
                },
            });
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(`${website.url}\n`);
            expect(request!.method).toBe("POST");
            expect(request!.url).toBe(`${apiBase}/v1/websites/${website.id}/resume`);
            expect(request!.headers.get("Idempotency-Key")).toBeTruthy();
            expect(request!.headers.get("x-oo-team-name")).toBe("team-a");
            expect(await request!.text()).toBe("");
        }
        finally { await sandbox.cleanup(); }
    });

    test("deletes a website only when the deletion is confirmed", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const requests: Request[] = [];
            const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
                requests.push(toRequest(input, init));
                return new Response(null, { status: 204 });
            };
            const unconfirmed = await sandbox.run(["website", "delete", "--site", website.id, "--team", "team-a"], { fetcher });
            expect(unconfirmed.exitCode).toBe(2);
            expect(unconfirmed.stderr).toContain("--yes");
            expect(unconfirmed.stderr).toContain(website.id);
            expect(requests).toEqual([]);

            const confirmed = await sandbox.run(["website", "delete", "--site", website.id, "--team", "team-a", "--yes", "--json"], { fetcher });
            expect(confirmed.exitCode).toBe(0);
            expect(JSON.parse(confirmed.stdout)).toEqual({ id: website.id, deleted: true });
            expect(requests).toHaveLength(1);
            expect(requests[0]!.method).toBe("DELETE");
            expect(requests[0]!.url).toBe(`${apiBase}/v1/websites/${website.id}`);
            expect(requests[0]!.headers.get("x-oo-team-name")).toBe("team-a");
            expect(requests[0]!.headers.get("Idempotency-Key")).toBeNull();

            const text = await sandbox.run(["website", "delete", "--site", website.id, "--team", "team-a", "-y"], { fetcher });
            expect(text.exitCode).toBe(0);
            expect(text.stdout).toBe(`Deleted website ${website.id}.\n`);
        }
        finally { await sandbox.cleanup(); }
    });

    test("binds, shows and removes a custom domain", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const requests: Request[] = [];
            let current: typeof customDomain | null = null;
            const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
                const request = toRequest(input, init);
                requests.push(request);
                if (request.method === "POST")
                    current = customDomain;
                if (request.method === "DELETE")
                    current = null;
                return Response.json({ custom_domain: current });
            };
            const url = `${apiBase}/v1/websites/${website.id}/custom-domain`;

            // The name is normalized the way the service stores it.
            const bound = await sandbox.run(["website", "domain", "set", " WWW.Example.com. ", "--site", website.id, "--team", "team-a", "--json"], { fetcher });
            expect(bound.exitCode).toBe(0);
            expect(JSON.parse(bound.stdout)).toEqual({ custom_domain: customDomain });
            expect(requests[0]!.method).toBe("POST");
            expect(requests[0]!.url).toBe(url);
            expect(requests[0]!.headers.get("x-oo-team-name")).toBe("team-a");
            expect(requests[0]!.headers.get("Idempotency-Key")).toBeTruthy();
            expect(await requests[0]!.json()).toEqual({ hostname: "www.example.com" });

            const shown = await sandbox.run(["website", "domain", "--site", website.id, "--team", "team-a"], { fetcher });
            expect(shown.exitCode).toBe(0);
            expect(shown.stdout).toBe([
                "www.example.com",
                "  - Status: pending",
                "  - URL: https://www.example.com/",
                "  - DNS record: CNAME www.example.com -> cname.sitelive.net",
                "Add the DNS record at your DNS provider, then run oo website domain to check the status.",
                "",
            ].join("\n"));
            expect(requests[1]!.method).toBe("GET");
            expect(requests[1]!.url).toBe(url);

            const removed = await sandbox.run(["website", "domain", "remove", "--site", website.id, "--team", "team-a"], { fetcher });
            expect(removed.exitCode).toBe(0);
            expect(removed.stdout).toBe("No custom domain is bound.\n");
            expect(requests[2]!.method).toBe("DELETE");
            expect(requests[2]!.url).toBe(url);
            expect(requests[2]!.headers.get("Idempotency-Key")).toBeNull();
        }
        finally { await sandbox.cleanup(); }
    });

    test("prints the failure reason of a custom domain and omits the hint once it is active", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const args = ["website", "domain", "--site", website.id, "--team", "team-a"];
            const failed = await sandbox.run(args, {
                fetcher: async () => Response.json({ custom_domain: { ...customDomain, status: "error", message: "CNAME record not found" } }),
            });
            expect(failed.stdout).toContain("  - Status: error\n");
            expect(failed.stdout).toContain("  - Message: CNAME record not found\n");
            const active = await sandbox.run(args, {
                fetcher: async () => Response.json({ custom_domain: { ...customDomain, status: "active", checked_at: 2 } }),
            });
            expect(active.stdout).toBe([
                "www.example.com",
                "  - Status: active",
                "  - URL: https://www.example.com/",
                "  - DNS record: CNAME www.example.com -> cname.sitelive.net",
                "",
            ].join("\n"));
        }
        finally { await sandbox.cleanup(); }
    });

    test("lists the ownership record until the domain is verified", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const args = ["website", "domain", "--site", website.id, "--team", "team-a"];
            const unverified = {
                ...customDomain,
                status: "unverified",
                message: "TXT record _sitelive.www.example.com not found",
                verified_at: null,
            };
            const claimed = await sandbox.run(args, {
                fetcher: async () => Response.json({ custom_domain: unverified }),
            });
            expect(claimed.exitCode).toBe(0);
            expect(claimed.stdout).toBe([
                "www.example.com",
                "  - Status: unverified",
                "  - URL: https://www.example.com/",
                "  - Ownership record: TXT _sitelive.www.example.com -> 0123456789abcdef0123456789abcdef",
                "  - DNS record: CNAME www.example.com -> cname.sitelive.net",
                "  - Message: TXT record _sitelive.www.example.com not found",
                "Add both records at your DNS provider, then run oo website domain to verify ownership of the domain.",
                "",
            ].join("\n"));

            // A service without ownership verification sends neither field.
            const { verification: _verification, verified_at: _verifiedAt, ...legacy } = customDomain;
            const old = await sandbox.run(args, {
                fetcher: async () => Response.json({ custom_domain: legacy }),
            });
            expect(old.exitCode).toBe(0);
            expect(old.stdout).toBe([
                "www.example.com",
                "  - Status: pending",
                "  - URL: https://www.example.com/",
                "  - DNS record: CNAME www.example.com -> cname.sitelive.net",
                "Add the DNS record at your DNS provider, then run oo website domain to check the status.",
                "",
            ].join("\n"));
        }
        finally { await sandbox.cleanup(); }
    });

    test("rejects an invalid domain name before any request", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const requests: string[] = [];
            for (const hostname of ["localhost", "https://www.example.com", "*.example.com", "example.com:8080"]) {
                const result = await sandbox.run(["website", "domain", "set", hostname, "--site", website.id, "--team", "team-a"], {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init).url);
                        return Response.json({ custom_domain: customDomain });
                    },
                });
                expect(result.exitCode).toBe(2);
                expect(result.stderr).toContain("not a valid domain name");
            }
            expect(requests).toEqual([]);
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

    test("explains billing and permission failures instead of echoing the service", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const failing = (status: number, code: string) => async () => Response.json({ message: "Service message", code }, { status });

            // The team cannot pay: the CLI-wide insufficient balance contract.
            const broke = await sandbox.run(["website", "create", website.name, "--team", "team-a", "--json"], { fetcher: failing(402, "insufficient_balance") });
            expect(broke.exitCode).toBe(3);
            const brokeError = JSON.parse(broke.stderr).error;
            expect(brokeError.code).toBe("billing.insufficientCredit");
            expect(brokeError.details).toEqual({ billingUrl: "https://console.oomol.com/billing", httpStatus: 402, serviceCode: "insufficient_balance" });

            const cases = [
                { args: ["rollback", deployment.id], status: 409, code: "website_suspended", hint: "oo website resume" },
                { args: ["resume"], status: 409, code: "website_not_suspended", hint: "not suspended" },
                { args: ["rollback", deployment.id], status: 409, code: "website_busy", hint: "Another operation" },
                { args: ["domain", "set", "www.example.com"], status: 403, code: "manager_required", hint: "team creator or admin" },
                { args: ["delete", "--yes"], status: 403, code: "manager_required", hint: "team creator or admin" },
                { args: ["create", "Another"], status: 409, code: "website_limit_reached", hint: "website limit" },
            ];
            for (const item of cases) {
                const args = ["website", ...item.args, ...(item.args[0] === "create" ? [] : ["--site", website.id]), "--team", "team-a"];
                const result = await sandbox.run(args, { fetcher: failing(item.status, item.code) });
                expect(result.exitCode).toBe(1);
                expect(result.stderr).toContain(item.hint);
                expect(result.stderr).not.toContain("Service message");
                const json = await sandbox.run([...args, "--json"], { fetcher: failing(item.status, item.code) });
                expect(JSON.parse(json.stderr).error.details).toEqual({ httpStatus: item.status, serviceCode: item.code });
            }
        }
        finally { await sandbox.cleanup(); }
    });

    test("refuses to build a suspended website", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const dir = join(sandbox.env.HOME!, "unpaid-site");
            await Bun.write(join(dir, "sitelive-website.json"), JSON.stringify({ website_id: website.id, team_id: website.team_id }));
            const requests: string[] = [];
            const result = await sandbox.run(["website", "deploy", "--project", dir, "--team", "team-a", "--json"], {
                fetcher: async (input, init) => {
                    requests.push(new URL(toRequest(input, init).url).pathname);
                    return Response.json({ website: { ...website, billing: { status: "suspended", next_charge_at: null, suspended_at: 1, grace_ends_at: 2 } } });
                },
            });
            // Only the website was read: no build ran and no deployment was created.
            expect(requests).toEqual([`/v1/websites/${website.id}`]);
            expect(result.exitCode).toBe(1);
            const error = JSON.parse(result.stderr).error;
            expect(error.message).toContain("oo website resume");
            expect(error.details).toEqual({ serviceCode: "website_suspended" });
        }
        finally { await sandbox.cleanup(); }
    });

    test("refuses a project linked to another team before executing its build", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const dir = join(sandbox.env.HOME!, "other-site");
            await Bun.write(join(dir, "sitelive-website.json"), JSON.stringify({ website_id: website.id, team_id: "team-b" }));
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
            expect(result.stderr).toContain("sitelive-website.json");
            expect(requests).toEqual([]);
        }
        finally { await sandbox.cleanup(); }
    });
});
