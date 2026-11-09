import type { MessageKey } from "../../../i18n/catalog.ts";
import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { WebsitesApiTarget } from "./api.ts";

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { resolveAccountTeamIdentity, teamIdentityHeaders, teamIdentityInputShape, teamOption } from "../team/identity.ts";
import { deploymentSchema, requestWebsitesApi, websitePath, websiteSchema } from "./api.ts";
import { buildWebsite } from "./build.ts";
import { publishWebsiteBuild } from "./publish.ts";
import { websiteTemplate } from "./template.ts";

const inquirySchema = z.object({
    id: z.string(),
    website_id: z.string(),
    path: z.string(),
    email: z.string(),
    message: z.string(),
    status: z.enum(["new", "contacted", "closed"]),
    received_at: z.number(),
    updated_at: z.number(),
});

// The local association between an Astro project and its website, written by
// `create` and checked by `deploy` before any build step runs.
const projectLinkFile = "leina-website.json";
const projectLinkSchema = z.object({ website_id: z.string(), team_id: z.string() });
type ProjectLink = z.infer<typeof projectLinkSchema>;

const optionsSchema = z.object({ ...teamIdentityInputShape });
type Options = z.infer<typeof optionsSchema>;

async function resolveTarget(input: Options, context: CliExecutionContext): Promise<WebsitesApiTarget> {
    const { account } = await requireIdentity(context);
    const identity = await resolveAccountTeamIdentity(input, account, context);
    return { account, headers: teamIdentityHeaders(identity) };
}

async function readOptionalFile(path: string): Promise<string | null> {
    return await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT")
            return null;
        throw error;
    });
}

const commonOptions = [teamOption("options.variablesTeam")];

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
        const target = await resolveTarget(input, context);
        const scope = JSON.stringify({ endpoint: target.account.endpoint, headers: target.headers });
        const dir = resolve(context.cwd, input.dir);
        await mkdir(dir, { recursive: true });
        const entries = await readdir(dir);
        // The journal keeps the create key across runs, so retrying after a
        // lost response replays the same website instead of adding another.
        const journal = join(dir, ".leina-create.json");
        let key: string;
        if (entries.length === 0) {
            key = randomUUIDv7();
            await writeFile(journal, JSON.stringify({ key, name: input.name, scope }), { flag: "wx" });
        }
        else {
            const pending = JSON.parse(await readFile(journal, "utf8").catch(() => "null")) as { key?: string; name?: string; scope?: string } | null;
            if (!pending?.key || pending.name !== input.name || pending.scope !== scope) {
                throw new CliUserError("errors.websiteManaged.dirNotEmpty", 2);
            }
            key = pending.key;
        }
        const { website } = await requestWebsitesApi(target, context, {
            body: { name: input.name },
            idempotencyKey: key,
            path: "/v1/websites",
            schema: z.object({ website: websiteSchema }),
        });
        const linkPath = join(dir, projectLinkFile);
        const linked = await readOptionalFile(linkPath);
        const expectedLink: ProjectLink = { website_id: website.id, team_id: website.team_id };
        if (linked !== null) {
            const previous = projectLinkSchema.safeParse(JSON.parse(linked));
            if (!previous.success || previous.data.website_id !== website.id || previous.data.team_id !== website.team_id) {
                throw new CliUserError("errors.websiteManaged.dirLinkedElsewhere", 2);
            }
        }
        else {
            for (const [name, contents] of Object.entries(websiteTemplate(website.name))) {
                const path = join(dir, name);
                await mkdir(dirname(path), { recursive: true });
                try {
                    await writeFile(path, contents, { flag: "wx" });
                }
                catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== "EEXIST")
                        throw error;
                    if (await readFile(path, "utf8") !== contents) {
                        throw new CliUserError("errors.websiteManaged.templateChanged", 2, { id: website.id });
                    }
                }
            }
            await writeFile(linkPath, JSON.stringify(expectedLink, null, 2), { flag: "wx" });
        }
        context.output.emit(website, () => context.stdout.write(`${website.id}\n${website.url}\n`));
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
        const { website } = await requestWebsitesApi(await resolveTarget(input, context), context, {
            path: websitePath(input.site),
            schema: z.object({ website: websiteSchema }),
        });
        context.output.emit(website, () => context.stdout.write(`${website.name}  ${website.status}\n${website.url}\n`));
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
        const result = await requestWebsitesApi(await resolveTarget(input, context), context, {
            path: "/v1/websites",
            schema: z.object({ items: z.array(websiteSchema) }),
        });
        context.output.emit(result, () => {
            for (const website of result.items) {
                context.stdout.write(`${website.id}  ${website.name}  ${website.status}  ${website.url}\n`);
            }
        });
    },
};

const deployInput = siteInput.extend({ project: z.string() });
const deploy: CliCommandDefinition<z.infer<typeof deployInput>> = {
    name: "deploy",
    summaryKey: "commands.website.deploy.summary",
    descriptionKey: "commands.website.deploy.summary",
    output: "standard",
    inputSchema: deployInput,
    arguments: [siteArgument],
    options: [...commonOptions, { name: "project", longFlag: "--project", valueName: "directory", descriptionKey: "options.websiteManaged.project" }],
    handler: async (input, context) => {
        const project = resolve(context.cwd, input.project);
        const linked = await readOptionalFile(join(project, projectLinkFile));
        const link = linked === null ? undefined : projectLinkSchema.safeParse(JSON.parse(linked)).data;
        if (link === undefined) {
            throw new CliUserError("errors.websiteManaged.projectNotLinked", 2);
        }
        const target = await resolveTarget(input, context);
        const { website } = await requestWebsitesApi(target, context, {
            path: websitePath(input.site),
            schema: z.object({ website: websiteSchema }),
        });
        if (link.website_id !== website.id || link.team_id !== website.team_id) {
            throw new CliUserError("errors.websiteManaged.projectMismatch", 2);
        }
        const build = await buildWebsite(project, context).catch((error: unknown) => {
            throw new CliUserError("errors.websiteManaged.buildFailed", 1, {
                message: error instanceof Error ? error.message : String(error),
            });
        });
        const result = await publishWebsiteBuild(target, website.id, build, context);
        context.output.emit(result, () => context.stdout.write(`${result.website.url}\n`));
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
        const result = await requestWebsitesApi(await resolveTarget(input, context), context, {
            path: websitePath(input.site, "/deployments"),
            schema: z.object({ items: z.array(deploymentSchema) }),
        });
        context.output.emit(result, () => {
            for (const deployment of result.items) {
                const marker = deployment.active ? "  active" : "";
                context.stdout.write(`${deployment.id}  ${deployment.status}  ${new Date(deployment.created_at).toISOString()}${marker}\n`);
            }
        });
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
        const { deployment } = await requestWebsitesApi(await resolveTarget(input, context), context, {
            path: websitePath(input.site, `/deployments/${encodeURIComponent(input.deployment)}`),
            schema: z.object({ deployment: deploymentSchema }),
        });
        context.output.emit(deployment, () => context.stdout.write(`${JSON.stringify(deployment, null, 2)}\n`));
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
        const { website } = await requestWebsitesApi(await resolveTarget(input, context), context, {
            body: { deployment_id: input.deployment },
            path: websitePath(input.site, "/rollback"),
            schema: z.object({ website: websiteSchema }),
        });
        context.output.emit(website, () => context.stdout.write(`${website.url}\n`));
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
        const result = await requestWebsitesApi(await resolveTarget(input, context), context, {
            path: websitePath(input.site, "/inquiries"),
            query: input.cursor === undefined ? undefined : { cursor: input.cursor },
            schema: z.object({ items: z.array(inquirySchema), next_cursor: z.string().nullable() }),
        });
        context.output.emit(result, () => context.stdout.write(`${JSON.stringify(result, null, 2)}\n`));
    },
};

export const managedWebsiteCommands = [create, list, get, deploy, deployments, deploymentStatus, rollback, inquiries];
