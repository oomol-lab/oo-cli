import type { Translator } from "../../contracts/translator.ts";
import type { OoRequestFailure } from "../shared/oo-request.ts";
import type { WebsiteRequestContext, WebsitesApiTarget } from "./api.ts";
import type { WebsiteBuild } from "./build.ts";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import ignore from "ignore";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { createRetryingFetcher } from "../../shared/retrying-fetcher.ts";
import { requestOoResponse } from "../shared/oo-request.ts";
import { deploymentSchema, requestWebsitesApi, websitePath, websiteSchema } from "./api.ts";

// Workers static asset limits, mirrored by the service's manifest validation.
const maxAssetBytes = 25 * 1024 * 1024;
const maxAssetFiles = 20_000;
// The service caps the publish request body at about 16 MiB.
const maxPublishBodyBytes = 16 * 1024 * 1024;

interface Asset {
    file: string;
    hash: string;
    path: string;
    size: number;
}

const createDeploymentResponseSchema = z.object({
    deployment: deploymentSchema,
    upload: z.object({
        url: z.string(),
        jwt: z.string(),
        buckets: z.array(z.array(z.string())),
        expires_at: z.number(),
    }),
});
const publishResponseSchema = z.object({ website: websiteSchema, deployment: deploymentSchema });
type PublishResult = z.infer<typeof publishResponseSchema>;

const uploadResponseSchema = z.object({
    result: z.object({ jwt: z.string().nullish() }).nullish(),
});
const uploadErrorSchema = z.object({
    errors: z.array(z.object({ message: z.string() })).min(1),
});

// Text output of a successful deploy. stdout stays the website URL alone so a
// script can capture it; the visit report is a note on stderr, next to the
// build log, and is left out while the website has no report yet.
export function deployText(result: PublishResult, translator: Translator): { stdout: string; stderr: string } {
    const report = result.website.analytics?.report_url;

    return {
        stdout: `${result.website.url}\n`,
        stderr: report === undefined ? "" : `${translator.t("websiteManaged.text.analytics")}: ${report}\n`,
    };
}

// Publishes a finished build in the Workers for Platforms two-step flow:
// the service registers the asset manifest and answers with the buckets
// Cloudflare is missing, the files go straight to Cloudflare, and the
// resulting completion token binds them to the Worker in the publish call.
export async function publishWebsiteBuild(
    target: WebsitesApiTarget,
    websiteId: string,
    build: WebsiteBuild,
    context: WebsiteRequestContext,
): Promise<PublishResult> {
    const assets = await collectAssets(build.assetsDir);
    const manifest = Object.fromEntries(assets.map(asset => [asset.path, { hash: asset.hash, size: asset.size }]));
    const { deployment, upload } = await requestWebsitesApi(target, context, {
        body: { manifest },
        path: websitePath(websiteId, "/deployments"),
        schema: createDeploymentResponseSchema,
    });
    const completionToken = await uploadBuckets(upload, assets, context);
    const body = { completion_token: completionToken, ...build.worker };

    if (Buffer.byteLength(JSON.stringify(body)) > maxPublishBodyBytes) {
        throw new CliUserError("errors.websiteManaged.workerTooLarge", 1, { max: "16 MiB" });
    }

    return await requestWebsitesApi(target, context, {
        body,
        path: websitePath(websiteId, `/deployments/${encodeURIComponent(deployment.id)}/publish`),
        schema: publishResponseSchema,
    });
}

async function collectAssets(root: string): Promise<Asset[]> {
    // Wrangler never uploads `.assetsignore` itself and skips what it lists;
    // the Astro adapter uses it to keep server artifacts out of the assets.
    const ignored = ignore().add(".assetsignore");
    const ignoreFile = await readFile(join(root, ".assetsignore"), "utf8").catch(() => "");
    ignored.add(ignoreFile);

    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    const assets: Asset[] = [];

    for (const entry of entries) {
        const file = join(entry.parentPath, entry.name);
        const name = relative(root, file).split(sep).join("/");

        if (entry.isSymbolicLink()) {
            throw new CliUserError("errors.websiteManaged.assetSymlink", 1, { path: name });
        }

        if (!entry.isFile() || ignored.ignores(name)) {
            continue;
        }

        const content = await readFile(file);

        if (content.byteLength > maxAssetBytes) {
            throw new CliUserError("errors.websiteManaged.assetTooLarge", 1, { path: name, max: "25 MiB" });
        }

        assets.push({
            file,
            hash: createHash("sha256").update(content).digest("hex").slice(0, 32),
            path: `/${name}`,
            size: content.byteLength,
        });
    }

    if (assets.length === 0 || assets.length > maxAssetFiles) {
        throw new CliUserError("errors.websiteManaged.assetCount", 1, { max: maxAssetFiles });
    }

    return assets.sort((a, b) => a.path.localeCompare(b.path));
}

// Sends one multipart request per bucket, each field named by its hash and
// carrying the base64 content. Cloudflare answers the last bucket with the
// completion token; with nothing to upload the session token completes itself.
async function uploadBuckets(
    upload: z.infer<typeof createDeploymentResponseSchema>["upload"],
    assets: readonly Asset[],
    context: WebsiteRequestContext,
): Promise<string> {
    if (upload.buckets.length === 0) {
        return upload.jwt;
    }

    const assetsByHash = new Map(assets.map(asset => [asset.hash, asset]));
    const uploadContext = {
        fetcher: createRetryingFetcher({ fetcher: context.fetcher, logger: context.logger }),
        logger: context.logger,
        translator: context.translator,
    };
    let completionToken: string | undefined;

    for (const bucket of upload.buckets) {
        const form = new FormData();

        for (const hash of bucket) {
            const asset = assetsByHash.get(hash);

            if (asset === undefined) {
                throw new CliUserError("errors.websiteManaged.invalidResponse", 1);
            }

            const content = (await readFile(asset.file)).toString("base64");
            form.append(hash, new Blob([content], { type: Bun.file(asset.file).type }), hash);
        }

        const response = await requestOoResponse({
            authorization: `Bearer ${upload.jwt}`,
            body: form,
            context: uploadContext,
            errors: { scope: "websiteManaged" },
            host: { baseUrl: upload.url },
            label: "Website asset upload",
            method: "POST",
            statusErrors: mapUploadError,
        });
        const parsed = uploadResponseSchema.safeParse(await response.json().catch(() => undefined));

        if (parsed.success && typeof parsed.data.result?.jwt === "string") {
            completionToken = parsed.data.result.jwt;
        }
    }

    if (completionToken === undefined) {
        throw new CliUserError("errors.websiteManaged.invalidResponse", 1);
    }

    return completionToken;
}

function mapUploadError(failure: OoRequestFailure): CliUserError | undefined {
    try {
        const parsed = uploadErrorSchema.safeParse(JSON.parse(failure.bodyText ?? ""));

        return parsed.success
            ? new CliUserError("errors.websiteManaged.uploadFailed", 1, {
                    message: parsed.data.errors[0]!.message,
                    status: failure.status,
                }, { details: { httpStatus: failure.status } })
            : undefined;
    }
    catch {
        return undefined;
    }
}
