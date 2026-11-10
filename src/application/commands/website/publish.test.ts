import type { WebsiteBuild } from "./build.ts";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createLogCapture, toRequest } from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { deployText, publishWebsiteBuild } from "./publish.ts";

const apiBase = "https://websites-api.oomol.com";
const uploadUrl = "https://api.cloudflare.com/client/v4/accounts/account-a/workers/assets/upload?base64=true";
const websiteId = "0198a6f0-0000-7000-8000-000000000001";
const deploymentId = "0198a6f0-0000-7000-8000-000000000002";
const target = { account: { apiKey: "secret-1", endpoint: "oomol.com" }, headers: { "x-oo-team-name": "team-a" } };
const website = {
    id: websiteId,
    team_id: "team-a",
    name: "Example website",
    status: "live",
    hostname: `${websiteId}.leina.site`,
    url: `https://${websiteId}.leina.site/`,
    active_deployment_id: deploymentId,
    created_at: 1,
    updated_at: 2,
};
const deployment = {
    id: deploymentId,
    website_id: websiteId,
    status: "uploading",
    active: false,
    restorable: false,
    file_count: 2,
    total_bytes: 30,
    error_message: null,
    upload_expires_at: 3_600_001,
    created_at: 1,
    published_at: null,
    pruned_at: null,
};
const worker: WebsiteBuild["worker"] = {
    assets_binding: "ASSETS",
    assets_config: { run_worker_first: true },
    compatibility_date: "2026-07-15",
    compatibility_flags: ["nodejs_compat"],
    main_module: "entry.js",
    modules: [{ name: "entry.js", content_base64: Buffer.from("export default {}").toString("base64") }],
};

const favicon = "<svg xmlns=\"http://www.w3.org/2000/svg\"/>";
const script = "console.log(1)";

function shortHash(content: string): string {
    return createHash("sha256").update(content).digest("hex").slice(0, 32);
}

describe("publishWebsiteBuild", () => {
    let assetsDir: string;

    beforeEach(async () => {
        assetsDir = await mkdtemp(join(tmpdir(), "oo-website-assets-"));
        await Bun.write(join(assetsDir, "favicon.svg"), favicon);
        await Bun.write(join(assetsDir, "_astro", "app.js"), script);
        await Bun.write(join(assetsDir, ".assetsignore"), "_worker.js\n");
        await Bun.write(join(assetsDir, "_worker.js", "index.js"), "ignored");
    });

    afterEach(async () => {
        await rm(assetsDir, { recursive: true, force: true });
    });

    test("uploads the missing buckets to Cloudflare and publishes with the completion token", async () => {
        const requests: Request[] = [];
        const uploadResponses = [
            Response.json({ success: true, result: { jwt: null } }, { status: 202 }),
            Response.json({ success: true, result: { jwt: "completion-jwt" } }, { status: 201 }),
        ];
        const context = createContext(async (request) => {
            requests.push(request);
            if (request.url === uploadUrl) {
                return uploadResponses.shift()!;
            }
            if (request.url.endsWith("/publish")) {
                return Response.json({ website, deployment: { ...deployment, status: "succeeded", active: true } });
            }
            return Response.json({
                deployment,
                upload: { url: uploadUrl, jwt: "upload-jwt", buckets: [[shortHash(favicon)], [shortHash(script)]], expires_at: 3_600_001 },
            }, { status: 201 });
        });

        const result = await publishWebsiteBuild(target, websiteId, { assetsDir, worker }, context);

        expect(result.website.url).toBe(website.url);
        expect(requests.map(request => `${request.method} ${request.url}`)).toEqual([
            `POST ${apiBase}/v1/websites/${websiteId}/deployments`,
            `POST ${uploadUrl}`,
            `POST ${uploadUrl}`,
            `POST ${apiBase}/v1/websites/${websiteId}/deployments/${deploymentId}/publish`,
        ]);

        const [create, firstUpload, secondUpload, publish] = requests as [Request, Request, Request, Request];
        expect(await create.json()).toEqual({
            manifest: {
                "/_astro/app.js": { hash: shortHash(script), size: script.length },
                "/favicon.svg": { hash: shortHash(favicon), size: favicon.length },
            },
        });
        expect(create.headers.get("Authorization")).toBe("secret-1");
        expect(create.headers.get("x-oo-team-name")).toBe("team-a");

        for (const upload of [firstUpload, secondUpload]) {
            expect(upload.headers.get("Authorization")).toBe("Bearer upload-jwt");
            expect(upload.headers.get("x-oo-team-name")).toBeNull();
            expect(upload.headers.get("Idempotency-Key")).toBeNull();
        }
        // Bun's formData() parser drops part content types, so the raw body
        // shows what Cloudflare receives.
        const firstBody = await firstUpload.clone().text();
        expect(firstBody).toContain(`name="${shortHash(favicon)}"`);
        expect(firstBody).toContain("Content-Type: image/svg+xml");
        const firstForm = await firstUpload.formData();
        expect([...firstForm.keys()]).toEqual([shortHash(favicon)]);
        expect(await (firstForm.get(shortHash(favicon)) as File).text()).toBe(Buffer.from(favicon).toString("base64"));
        expect([...(await secondUpload.formData()).keys()]).toEqual([shortHash(script)]);

        expect(await publish.json()).toEqual({ completion_token: "completion-jwt", ...worker });
        const keys = [create.headers.get("Idempotency-Key"), publish.headers.get("Idempotency-Key")];
        expect(keys.every(key => key !== null && key !== "")).toBeTrue();
        expect(new Set(keys).size).toBe(2);
    });

    test("publishes with the upload token when Cloudflare already has every asset", async () => {
        const requests: Request[] = [];
        const context = createContext(async (request) => {
            requests.push(request);
            if (request.url.endsWith("/publish")) {
                return Response.json({ website, deployment: { ...deployment, status: "succeeded", active: true } });
            }
            return Response.json({
                deployment,
                upload: { url: uploadUrl, jwt: "upload-jwt", buckets: [], expires_at: 3_600_001 },
            }, { status: 201 });
        });

        await publishWebsiteBuild(target, websiteId, { assetsDir, worker }, context);

        expect(requests).toHaveLength(2);
        expect(await requests[1]!.json()).toMatchObject({ completion_token: "upload-jwt" });
    });

    test("reports the reason when the service rejects the deployment", async () => {
        const context = createContext(async (request) => {
            if (request.url.endsWith("/publish")) {
                return Response.json({ message: "Uncaught SyntaxError in entry.js", code: "deployment_rejected" }, { status: 422 });
            }
            return Response.json({
                deployment,
                upload: { url: uploadUrl, jwt: "upload-jwt", buckets: [], expires_at: 3_600_001 },
            }, { status: 201 });
        });

        const error = await publishWebsiteBuild(target, websiteId, { assetsDir, worker }, context).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(CliUserError);
        expect((error as CliUserError).key).toBe("errors.websiteManaged.deploymentRejected");
        expect((error as CliUserError).params).toEqual({ message: "Uncaught SyntaxError in entry.js" });
        expect((error as CliUserError).details).toEqual({ httpStatus: 422, serviceCode: "deployment_rejected" });
    });
});

describe("deployText", () => {
    const published = { ...deployment, status: "succeeded" as const, active: true };
    const analytics = { website_id: websiteId, report_url: `https://analytics.oomol.com/teams/team-a/websites/${websiteId}` };

    test("keeps stdout to the website URL and notes the analytics report on stderr", () => {
        const text = deployText({ website: { ...website, status: "live", analytics }, deployment: published }, createTranslator("en"));

        expect(text).toEqual({ stdout: `${website.url}\n`, stderr: `Analytics: ${analytics.report_url}\n` });
    });

    test("writes nothing to stderr while the website has no analytics report", () => {
        for (const value of [null, undefined]) {
            const text = deployText({ website: { ...website, status: "live", analytics: value }, deployment: published }, createTranslator("en"));

            expect(text).toEqual({ stdout: `${website.url}\n`, stderr: "" });
        }
    });
});

function createContext(handle: (request: Request) => Promise<Response>) {
    return {
        fetcher: async (input: string | URL | Request, init?: RequestInit) => await handle(toRequest(input, init)),
        logger: createLogCapture().logger,
        translator: createTranslator("en"),
    };
}
