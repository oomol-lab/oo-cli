import type { MessageKey } from "../../../i18n/catalog.ts";
import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { requestOo } from "../shared/oo-request.ts";
import { resolveAccountTeamIdentity, teamIdentityHeaders, teamIdentityInputShape, teamOption } from "../team/identity.ts";
import { buildWebsite } from "./build.ts";
import { websiteTemplate } from "./template.ts";

const siteSchema = z.object({
    id: z.string(),
    teamId: z.string(),
    name: z.string(),
    status: z.enum(["draft", "publishing", "live"]),
    publicUrl: z.url(),
    consoleUrl: z.url(),
    basePath: z.string(),
    analyticsStatus: z.enum(["pending", "ready"]),
}).passthrough();
const analyticsSchema = z.discriminatedUnion("status", [
    z.object({ status: z.literal("pending"), siteId: z.string() }),
    z.object({ status: z.literal("ready"), siteId: z.string(), days: z.number(), from: z.number(), to: z.number(), visitors: z.number(), pageviews: z.number(), inquiries: z.number(), daily: z.array(z.object({ date: z.string(), pageviews: z.number(), inquiries: z.number() })) }),
]);
const deploymentSchema = z.object({
    id: z.string(),
    siteId: z.string(),
    status: z.enum(["publishing", "succeeded", "failed"]),
    error: z.string().nullable(),
    createdAt: z.number(),
    attempts: z.number().optional(),
    prunedAt: z.number().optional(),
    pruning: z.boolean().optional(),
}).passthrough();
const acceptedSchema = z.object({ deployment: deploymentSchema });

const optionsSchema = z.object({ ...teamIdentityInputShape, apiUrl: z.url().optional() });
type Options = z.infer<typeof optionsSchema>;

async function client(input: Options, context: CliExecutionContext) {
    const { account } = await requireIdentity(context);
    const identity = await resolveAccountTeamIdentity(input, account, context);
    const baseUrl = input.apiUrl ?? `https://websites.${account.endpoint}`;
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
        throw new CliUserError("errors.websiteManaged.failure", 2, { message: "Use HTTPS or a loopback HTTP address." });
    }
    return { account, headers: teamIdentityHeaders(identity), baseUrl };
}

async function call<T>(input: Options, context: CliExecutionContext, path: string, schema: z.ZodType<T>, body?: unknown, key?: string, extraHeaders: Record<string, string> = {}) {
    const { account, headers, baseUrl } = await client(input, context);
    return requestOo({
        context,
        authorization: account.apiKey,
        host: { baseUrl },
        headers: { ...headers, ...extraHeaders, ...(key ? { "Idempotency-Key": key } : {}) },
        method: body === undefined ? "GET" : "POST",
        path,
        jsonBody: body,
        schema,
        errors: { scope: "websiteManaged" },
        label: "Managed website",
    });
}

const commonOptions = [
    teamOption("options.variablesTeam"),
    { name: "apiUrl", longFlag: "--api-url", valueName: "url", descriptionKey: "options.websiteManaged.apiUrl" as MessageKey },
];

const createSchema = optionsSchema.extend({ name: z.string().trim().min(1).max(100), dir: z.string() });
const create: CliCommandDefinition<z.infer<typeof createSchema>> = {
    name: "create",
    summaryKey: "commands.website.create.summary",
    descriptionKey: "commands.website.create.summary",
    output: "standard",
    arguments: [{ name: "name", descriptionKey: "arguments.websiteManaged.name", required: true }],
    options: [...commonOptions, { name: "dir", longFlag: "--dir", valueName: "directory", descriptionKey: "options.websiteManaged.dir" }],
    inputSchema: createSchema,
    handler: async (input, context) => {
        const target = await client(input, context);
        const scope = JSON.stringify({ baseUrl: target.baseUrl, headers: target.headers });
        const dir = resolve(context.cwd, input.dir);
        await mkdir(dir, { recursive: true });
        const entries = await readdir(dir);
        const journal = join(dir, ".leina-create.json");
        let key: string;
        if (entries.length === 0) {
            key = randomUUIDv7();
            await writeFile(journal, JSON.stringify({ key, name: input.name, scope }), { flag: "wx" });
        }
        else {
            const pending = JSON.parse(await readFile(journal, "utf8").catch(() => "null")) as { key?: string; name?: string; scope?: string } | null;
            if (!pending?.key || pending.name !== input.name || pending.scope !== scope) {
                throw new CliUserError("errors.websiteManaged.failure", 2, { message: "Choose an empty directory for a new site." });
            }
            key = pending.key;
        }
        const site = await call(input, context, "/v1/websites", siteSchema, { name: input.name }, key);
        const linkPath = join(dir, "leina-website.json");
        const linked = await readFile(linkPath, "utf8").catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT")
                return null;
            throw error;
        });
        const expectedLink = { siteId: site.id, teamId: site.teamId, basePath: site.basePath };
        if (linked !== null) {
            const previous = JSON.parse(linked) as typeof expectedLink;
            if (previous.siteId !== site.id || previous.teamId !== site.teamId) {
                throw new CliUserError("errors.websiteManaged.failure", 2, { message: "This directory is linked to a different website." });
            }
        }
        else {
            for (const [name, contents] of Object.entries(websiteTemplate(site.name, site.basePath))) {
                const path = join(dir, name);
                await mkdir(dirname(path), { recursive: true });
                try {
                    await writeFile(path, contents, { flag: "wx" });
                }
                catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== "EEXIST")
                        throw error;
                    if (await readFile(path, "utf8") !== contents) {
                        throw new CliUserError("errors.websiteManaged.failure", 2, { message: "A project file has changed. Keep your edits and resume from the existing website ID." });
                    }
                }
            }
            await writeFile(linkPath, JSON.stringify(expectedLink, null, 2), { flag: "wx" });
        }
        context.output.emit(site, () => context.stdout.write(`${site.id}\n${site.consoleUrl}\n`));
    },
};

const siteInput = optionsSchema.extend({ site: z.string().min(1) });
const siteArgument = { name: "site", descriptionKey: "arguments.websiteManaged.site" as MessageKey, required: true };
const get: CliCommandDefinition<z.infer<typeof siteInput>> = {
    name: "get",
    summaryKey: "commands.website.get.summary",
    descriptionKey: "commands.website.get.summary",
    output: "standard",
    inputSchema: siteInput,
    arguments: [siteArgument],
    options: commonOptions,
    handler: async (input, context) => {
        const site = await call(input, context, `/v1/websites/${encodeURIComponent(input.site)}`, siteSchema);
        context.output.emit(site, () => context.stdout.write(`${site.name}  ${site.status}\n${site.publicUrl}\n${site.consoleUrl}\n`));
    },
};
const list: CliCommandDefinition<Options> = {
    name: "list",
    summaryKey: "commands.website.list.summary",
    descriptionKey: "commands.website.list.summary",
    output: "standard",
    inputSchema: optionsSchema,
    options: commonOptions,
    handler: async (input, context) => {
        const result = await call(input, context, "/v1/websites", z.object({ items: z.array(siteSchema) }));
        context.output.emit(result, () => {
            for (const site of result.items) {
                context.stdout.write(`${site.id}  ${site.name}  ${site.status}\n`);
            }
        });
    },
};
const analyticsInput = siteInput.extend({ days: z.enum(["7", "30"]).default("7") });
const analytics: CliCommandDefinition<z.infer<typeof analyticsInput>> = {
    name: "analytics",
    summaryKey: "commands.website.analytics.summary",
    descriptionKey: "commands.website.analytics.summary",
    output: "standard",
    inputSchema: analyticsInput,
    arguments: [siteArgument],
    options: [...commonOptions, { name: "days", longFlag: "--days", valueName: "days", descriptionKey: "options.websiteManaged.days" }],
    handler: async (input, context) => {
        const result = await call(input, context, `/v1/websites/${encodeURIComponent(input.site)}/analytics?days=${input.days}`, analyticsSchema);
        context.output.emit(result, () => context.stdout.write(`${JSON.stringify(result, null, 2)}\n`));
    },
};
const deployInput = siteInput.extend({ project: z.string(), wait: z.boolean().default(true) });
const deploy: CliCommandDefinition<z.infer<typeof deployInput>> = {
    name: "deploy",
    summaryKey: "commands.website.deploy.summary",
    descriptionKey: "commands.website.deploy.summary",
    output: "standard",
    inputSchema: deployInput,
    arguments: [siteArgument],
    options: [...commonOptions, { name: "project", longFlag: "--project", valueName: "directory", descriptionKey: "options.websiteManaged.project" }, { name: "wait", longFlag: "--no-wait", descriptionKey: "options.websiteManaged.noWait" }],
    handler: async (input, context) => {
        const project = resolve(context.cwd, input.project);
        const site = await call(input, context, `/v1/websites/${encodeURIComponent(input.site)}`, siteSchema);
        const link = JSON.parse(await readFile(join(project, "leina-website.json"), "utf8")) as { siteId?: string; teamId?: string };
        if (link.siteId !== site.id || link.teamId !== site.teamId) {
            throw new CliUserError("errors.websiteManaged.failure", 2, { message: "This project belongs to a different website or team." });
        }
        const built = await buildWebsite(project, context);
        const operationPath = join(project, ".leina-deploy.json");
        const previous = await readFile(operationPath, "utf8").catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT")
                return null;
            throw error;
        });
        const pending = previous ? JSON.parse(previous) as { siteId: string; hash: string; key: string; completed: boolean } : null;
        const operation = pending?.siteId === site.id && pending.hash === built.hash && !pending.completed
            ? pending
            : { siteId: site.id, hash: built.hash, key: randomUUIDv7(), completed: false };
        await writeFile(operationPath, JSON.stringify(operation));
        const { deployment } = await call(input, context, `/v1/websites/${encodeURIComponent(site.id)}/deployments`, acceptedSchema, built.bundle, operation.key, { Prefer: "respond-async" });
        await writeFile(operationPath, JSON.stringify({ ...operation, deploymentId: deployment.id, completed: deployment.status === "succeeded" }));
        if (!input.wait) {
            context.output.emit({ deployment }, () => context.stdout.write(`Deployment ${deployment.status}: ${deployment.id}\n`));
            return;
        }
        const deadline = Date.now() + 300_000;
        let current = deployment;
        while (current.status === "publishing" && Date.now() < deadline) {
            await Bun.sleep(2000);
            current = await call(input, context, `/v1/websites/${encodeURIComponent(site.id)}/deployments/${encodeURIComponent(deployment.id)}`, deploymentSchema);
        }
        if (current.status !== "succeeded") {
            const message = current.status === "failed" ? current.error ?? "Publish failed." : "Publish is still running.";
            throw new CliUserError("errors.websiteManaged.failure", 1, {
                message: `${message} Use oo website deployment ${site.id} ${deployment.id} --json to check it.`,
            });
        }
        await writeFile(operationPath, JSON.stringify({ ...operation, deploymentId: deployment.id, completed: true }));
        const deployed = await call(input, context, `/v1/websites/${encodeURIComponent(site.id)}`, siteSchema);
        context.output.emit({ ...deployed, deploymentId: deployment.id }, () => context.stdout.write(`${deployed.publicUrl}\n${deployed.consoleUrl}\n`));
    },
};

const deployments: CliCommandDefinition<z.infer<typeof siteInput>> = {
    name: "deployments",
    summaryKey: "commands.website.deployments.summary",
    descriptionKey: "commands.website.deployments.summary",
    output: "standard",
    inputSchema: siteInput,
    arguments: [siteArgument],
    options: commonOptions,
    handler: async (input, context) => {
        const result = await call(input, context, `/v1/websites/${encodeURIComponent(input.site)}/deployments`, z.object({ items: z.array(deploymentSchema) }));
        context.output.emit(result, () => context.stdout.write(`${JSON.stringify(result, null, 2)}\n`));
    },
};
const releaseInput = siteInput.extend({ deployment: z.string().min(1) });
const releaseArguments = [siteArgument, { name: "deployment", descriptionKey: "arguments.websiteManaged.deployment", required: true }];
const deploymentStatus: CliCommandDefinition<z.infer<typeof releaseInput>> = {
    name: "deployment",
    summaryKey: "commands.website.deployment.summary",
    descriptionKey: "commands.website.deployment.summary",
    output: "standard",
    inputSchema: releaseInput,
    arguments: releaseArguments,
    options: commonOptions,
    handler: async (input, context) => {
        const result = await call(input, context, `/v1/websites/${encodeURIComponent(input.site)}/deployments/${encodeURIComponent(input.deployment)}`, deploymentSchema);
        context.output.emit(result, () => context.stdout.write(`${JSON.stringify(result, null, 2)}\n`));
    },
};
const retry: CliCommandDefinition<z.infer<typeof releaseInput>> = {
    name: "retry",
    summaryKey: "commands.website.retry.summary",
    descriptionKey: "commands.website.retry.summary",
    output: "standard",
    inputSchema: releaseInput,
    arguments: releaseArguments,
    options: commonOptions,
    handler: async (input, context) => {
        const result = await call(input, context, `/v1/websites/${encodeURIComponent(input.site)}/deployments/${encodeURIComponent(input.deployment)}/retry`, acceptedSchema, {}, randomUUIDv7());
        context.output.emit(result, () => context.stdout.write(`${JSON.stringify(result, null, 2)}\n`));
    },
};
const rollback: CliCommandDefinition<z.infer<typeof releaseInput>> = {
    name: "rollback",
    summaryKey: "commands.website.rollback.summary",
    descriptionKey: "commands.website.rollback.summary",
    output: "standard",
    inputSchema: releaseInput,
    arguments: releaseArguments,
    options: commonOptions,
    handler: async (input, context) => {
        const result = await call(input, context, `/v1/websites/${encodeURIComponent(input.site)}/rollback`, siteSchema, { deploymentId: input.deployment }, randomUUIDv7());
        context.output.emit(result, () => context.stdout.write(`${result.publicUrl}\n`));
    },
};

const inquiriesInput = siteInput.extend({ cursor: z.string().optional() });
const inquiries: CliCommandDefinition<z.infer<typeof inquiriesInput>> = {
    name: "inquiries",
    summaryKey: "commands.website.inquiries.summary",
    descriptionKey: "commands.website.inquiries.summary",
    output: "standard",
    inputSchema: inquiriesInput,
    arguments: [siteArgument],
    options: [...commonOptions, { name: "cursor", longFlag: "--cursor", valueName: "cursor", descriptionKey: "options.websiteManaged.cursor" }],
    handler: async (input, context) => {
        const query = input.cursor ? `?${new URLSearchParams({ cursor: input.cursor })}` : "";
        const schema = z.object({ items: z.array(z.object({ id: z.string(), email: z.string(), message: z.string(), receivedAt: z.number(), status: z.enum(["new", "contacted", "closed"]) })), nextCursor: z.string().nullable() });
        const result = await call(input, context, `/v1/websites/${encodeURIComponent(input.site)}/inquiries${query}`, schema);
        context.output.emit(result, () => context.stdout.write(`${JSON.stringify(result, null, 2)}\n`));
    },
};

export const managedWebsiteCommands = [create, list, get, deploy, analytics, deployments, deploymentStatus, retry, rollback, inquiries];
