import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { Translator } from "../../contracts/translator.ts";
import type { WebsitesApiTarget } from "./api.ts";

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { domainToASCII } from "node:url";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { resolveAccountTeamIdentity, teamIdentityHeaders, teamIdentityInputShape, teamOption } from "../team/identity.ts";
import { websiteAnalyticsQuery, websiteAnalyticsSchema, websiteAnalyticsText } from "./analytics.ts";
import { customDomainSchema, deploymentSchema, requestWebsitesApi, sendWebsitesApi, websitePath, websiteSchema } from "./api.ts";
import { buildWebsite } from "./build.ts";
import { deployText, publishWebsiteBuild } from "./publish.ts";
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
// `create`. It names the website for `deploy` and, in the current directory,
// for the commands that are not given `--site`.
const projectLinkFile = "sitelive-website.json";
// Projects created before the file was renamed keep the association under
// this name. It is still read, and never written.
const legacyProjectLinkFile = "leina-website.json";
const projectLinkSchema = z.object({ website_id: z.string(), team_id: z.string() });
type ProjectLink = z.infer<typeof projectLinkSchema>;

const createJournalFile = ".sitelive-create.json";
// The journal name used before the rename: still read, so retrying a create
// in an older project replays the same website instead of adding another.
const legacyCreateJournalFile = ".leina-create.json";
const createJournalFiles = [createJournalFile, legacyCreateJournalFile];
const createJournalSchema = z.object({ key: z.string().min(1), name: z.string(), scope: z.string() });

// Parses a local JSON state file, treating unreadable content as absent.
function parseJsonFile<Value>(text: string, schema: z.ZodType<Value>): Value | undefined {
    try {
        return schema.safeParse(JSON.parse(text)).data;
    }
    catch {
        return undefined;
    }
}

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

// The current link file wins; the legacy name is the fallback.
async function readProjectLinkText(dir: string): Promise<string | null> {
    return await readOptionalFile(join(dir, projectLinkFile))
        ?? await readOptionalFile(join(dir, legacyProjectLinkFile));
}

async function readProjectLink(dir: string): Promise<ProjectLink | undefined> {
    const text = await readProjectLinkText(dir);
    return text === null ? undefined : parseJsonFile(text, projectLinkSchema);
}

const commonOptions = [teamOption("options.variablesTeam")];

type CreateJournal = z.infer<typeof createJournalSchema>;

async function readCreateState(dir: string): Promise<{ entries: string[]; pending: CreateJournal | undefined }> {
    await mkdir(dir, { recursive: true });
    const entries = await readdir(dir);
    const file = createJournalFiles.find(name => entries.includes(name));
    const text = file === undefined ? null : await readOptionalFile(join(dir, file));
    return { entries, pending: text === null ? undefined : parseJsonFile(text, createJournalSchema) };
}

// eslint-disable-next-line no-control-regex
const unsafeDirChars = /[\s\\/:*?"<>|\u0000-\u001F]+/g;
const dirNameEdges = /^[-.]+|[-.]+$/g;

// A directory name for the website: path separators, whitespace and the
// characters Windows forbids become dashes.
function projectDirName(name: string): string {
    const slug = name.toLowerCase().replace(unsafeDirChars, "-").replace(dirNameEdges, "");
    return slug === "" ? "website" : slug;
}

const createSchema = optionsSchema.extend({ name: z.string().trim().min(1).max(100), dir: z.string().optional() });
const create: CliCommandDefinition<z.infer<typeof createSchema>> = {
    name: "create",
    summaryKey: "commands.website.create.summary",
    descriptionKey: "commands.website.create.description",
    output: "standard",
    arguments: [{ name: "name", descriptionKey: "arguments.websiteManaged.name", required: true }],
    options: [...commonOptions, { name: "dir", longFlag: "--dir", valueName: "directory", descriptionKey: "options.websiteManaged.dir" }],
    inputSchema: createSchema,
    handler: async (input, context) => {
        const target = await resolveTarget(input, context);
        const scope = JSON.stringify({ endpoint: target.account.endpoint, headers: target.headers });
        // The journal keeps the create key across runs, so retrying after a
        // lost response replays the same website instead of adding another.
        const resumes = (pending: CreateJournal | undefined): pending is CreateJournal =>
            pending !== undefined && pending.name === input.name && pending.scope === scope;
        // A directory holding nothing but a stale or unreadable journal is
        // still empty: no project file was written.
        const isEmpty = (entries: string[]): boolean => entries.every(entry => createJournalFiles.includes(entry));
        let dir = resolve(context.cwd, input.dir ?? ".");
        let state = await readCreateState(dir);
        // Without --dir an empty current directory becomes the project;
        // otherwise the project goes into a subdirectory named after the
        // website, so an unrelated directory is never filled with a template.
        if (input.dir === undefined && !resumes(state.pending) && !isEmpty(state.entries)) {
            dir = join(dir, projectDirName(input.name));
            state = await readCreateState(dir);
        }
        const journal = join(dir, createJournalFile);
        let key: string;
        if (resumes(state.pending)) {
            key = state.pending.key;
        }
        else if (isEmpty(state.entries)) {
            key = randomUUIDv7();
            await writeFile(journal, JSON.stringify({ key, name: input.name, scope }));
        }
        else {
            throw new CliUserError("errors.websiteManaged.dirNotEmpty", 2);
        }
        const { website } = await requestWebsitesApi(target, context, {
            body: { name: input.name },
            idempotencyKey: key,
            path: "/v1/websites",
            schema: z.object({ website: websiteSchema }),
        });
        const linkPath = join(dir, projectLinkFile);
        const linked = await readProjectLinkText(dir);
        const expectedLink: ProjectLink = { website_id: website.id, team_id: website.team_id };
        if (linked !== null) {
            const previous = parseJsonFile(linked, projectLinkSchema);
            if (previous === undefined || previous.website_id !== website.id || previous.team_id !== website.team_id) {
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
        context.output.emit({ ...website, project_dir: dir }, () => context.stdout.write(`${website.id}\n${website.url}\n${dir}\n`));
    },
};

const siteInput = optionsSchema.extend({ site: z.string().min(1).optional() });
const siteOptions = [...commonOptions, { name: "site", longFlag: "--site", valueName: "website-id", descriptionKey: "options.websiteManaged.site" }];

async function resolveSite(input: z.infer<typeof siteInput>, context: CliExecutionContext): Promise<string> {
    if (input.site !== undefined)
        return input.site;
    const link = await readProjectLink(context.cwd);
    if (link === undefined) {
        throw new CliUserError("errors.websiteManaged.siteRequired", 2);
    }
    return link.website_id;
}
type Website = z.infer<typeof websiteSchema>;

// One line for the billing state: when the next period is charged, or, for a
// suspended website, since when and until when it can still be resumed.
function billingText(billing: NonNullable<Website["billing"]>, translator: Translator): string {
    const date = (time: number | null): string => time === null ? "-" : new Date(time).toISOString();

    return billing.status === "suspended"
        ? translator.t("websiteManaged.text.billingSuspended", { since: date(billing.suspended_at), deadline: date(billing.grace_ends_at) })
        : translator.t("websiteManaged.text.billingActive", { date: date(billing.next_charge_at) });
}

const get: CliCommandDefinition<z.infer<typeof siteInput>> = {
    name: "get",
    summaryKey: "commands.website.get.summary",
    descriptionKey: "commands.website.get.summary",
    output: "standard",
    inputSchema: siteInput,
    options: siteOptions,
    handler: async (input, context) => {
        const site = await resolveSite(input, context);
        const { website } = await requestWebsitesApi(await resolveTarget(input, context), context, {
            path: websitePath(site),
            schema: z.object({ website: websiteSchema }),
        });
        context.output.emit(website, () => {
            const t = context.translator.t.bind(context.translator);
            const fields = [
                [t("websiteManaged.text.id"), website.id],
                [t("labels.status"), website.status],
                [t("websiteManaged.text.url"), website.url],
                [t("websiteManaged.text.activeDeployment"), website.active_deployment_id ?? t("websiteManaged.text.notPublished")],
                [t("websiteManaged.text.customDomain"), website.custom_domain ? `${website.custom_domain.hostname} (${website.custom_domain.status})` : t("websiteManaged.text.none")],
                [t("websiteManaged.text.analytics"), website.analytics?.report_url ?? t("websiteManaged.text.analyticsNotReady")],
                ...(website.billing === undefined ? [] : [[t("websiteManaged.text.billing"), billingText(website.billing, context.translator)]]),
                [t("websiteManaged.text.createdAt"), new Date(website.created_at).toISOString()],
                [t("websiteManaged.text.updatedAt"), new Date(website.updated_at).toISOString()],
            ];
            context.stdout.write(`${website.name}\n${fields.map(([label, value]) => `  - ${label}: ${value}\n`).join("")}`);
        });
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
                const suspended = website.billing?.status === "suspended" ? "  suspended" : "";
                context.stdout.write(`${website.id}  ${website.name}  ${website.status}  ${website.url}${suspended}\n`);
            }
        });
    },
};

// `deploy` takes no website ID: the project link written by `create` names it.
const deployInput = optionsSchema.extend({ project: z.string().optional() });
const deploy: CliCommandDefinition<z.infer<typeof deployInput>> = {
    name: "deploy",
    summaryKey: "commands.website.deploy.summary",
    descriptionKey: "commands.website.deploy.summary",
    output: "standard",
    inputSchema: deployInput,
    options: [...commonOptions, { name: "project", longFlag: "--project", valueName: "directory", descriptionKey: "options.websiteManaged.project" }],
    handler: async (input, context) => {
        const project = resolve(context.cwd, input.project ?? ".");
        const link = await readProjectLink(project);
        if (link === undefined) {
            throw new CliUserError("errors.websiteManaged.projectNotLinked", 2);
        }
        const target = await resolveTarget(input, context);
        const { website } = await requestWebsitesApi(target, context, {
            path: websitePath(link.website_id),
            schema: z.object({ website: websiteSchema }),
        });
        if (link.website_id !== website.id || link.team_id !== website.team_id) {
            throw new CliUserError("errors.websiteManaged.projectMismatch", 2);
        }
        // The service refuses to publish a suspended website; say so before
        // spending minutes on a build.
        if (website.billing?.status === "suspended") {
            throw new CliUserError("errors.websiteManaged.suspended", 1, undefined, { details: { serviceCode: "website_suspended" } });
        }
        const build = await buildWebsite(project, context).catch((error: unknown) => {
            throw new CliUserError("errors.websiteManaged.buildFailed", 1, {
                message: error instanceof Error ? error.message : String(error),
            });
        });
        const result = await publishWebsiteBuild(target, website.id, build, context);
        context.output.emit(result, () => {
            const text = deployText(result, context.translator);
            context.stdout.write(text.stdout);
            context.stderr.write(text.stderr);
        });
    },
};

const deployments: CliCommandDefinition<z.infer<typeof siteInput>> = {
    name: "deployments",
    summaryKey: "commands.website.deployments.summary",
    descriptionKey: "commands.website.deployments.summary",
    output: "standard",
    inputSchema: siteInput,
    options: siteOptions,
    handler: async (input, context) => {
        const site = await resolveSite(input, context);
        const result = await requestWebsitesApi(await resolveTarget(input, context), context, {
            path: websitePath(site, "/deployments"),
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
const releaseArguments = [{ name: "deployment", descriptionKey: "arguments.websiteManaged.deployment", required: true }];
const deploymentStatus: CliCommandDefinition<z.infer<typeof releaseInput>> = {
    name: "deployment",
    summaryKey: "commands.website.deployment.summary",
    descriptionKey: "commands.website.deployment.summary",
    output: "standard",
    inputSchema: releaseInput,
    arguments: releaseArguments,
    options: siteOptions,
    handler: async (input, context) => {
        const site = await resolveSite(input, context);
        const { deployment } = await requestWebsitesApi(await resolveTarget(input, context), context, {
            path: websitePath(site, `/deployments/${encodeURIComponent(input.deployment)}`),
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
    options: siteOptions,
    handler: async (input, context) => {
        const site = await resolveSite(input, context);
        const { website } = await requestWebsitesApi(await resolveTarget(input, context), context, {
            body: { deployment_id: input.deployment },
            path: websitePath(site, "/rollback"),
            schema: z.object({ website: websiteSchema }),
        });
        context.output.emit(website, () => context.stdout.write(`${website.url}\n`));
    },
};

// Charges a new period and puts a suspended website back online at once,
// instead of waiting for the service's hourly balance check.
const resume: CliCommandDefinition<z.infer<typeof siteInput>> = {
    name: "resume",
    summaryKey: "commands.website.resume.summary",
    descriptionKey: "commands.website.resume.description",
    output: "standard",
    inputSchema: siteInput,
    options: siteOptions,
    handler: async (input, context) => {
        const site = await resolveSite(input, context);
        const { website } = await requestWebsitesApi(await resolveTarget(input, context), context, {
            method: "POST",
            path: websitePath(site, "/resume"),
            schema: z.object({ website: websiteSchema }),
        });
        context.output.emit(website, () => context.stdout.write(`${website.url}\n`));
    },
};

const removeInput = siteInput.extend({ yes: z.boolean().optional() });
const remove: CliCommandDefinition<z.infer<typeof removeInput>> = {
    name: "delete",
    summaryKey: "commands.website.delete.summary",
    descriptionKey: "commands.website.delete.description",
    output: "standard",
    inputSchema: removeInput,
    options: [...siteOptions, { name: "yes", longFlag: "--yes", shortFlag: "-y", descriptionKey: "options.websiteManaged.deleteYes" }],
    handler: async (input, context) => {
        const site = await resolveSite(input, context);
        // Nothing of a deleted website can be restored, so the command never
        // deletes on the strength of a project link alone.
        if (input.yes !== true) {
            throw new CliUserError("errors.websiteManaged.deleteNotConfirmed", 2, { id: site });
        }
        await sendWebsitesApi(await resolveTarget(input, context), context, { method: "DELETE", path: websitePath(site) });
        context.output.emit({ id: site, deleted: true }, () => context.stdout.write(`${context.translator.t("websiteManaged.text.deleted", { id: site })}\n`));
    },
};

const inquiriesInput = siteInput.extend({ cursor: z.string().optional() });
const inquiries: CliCommandDefinition<z.infer<typeof inquiriesInput>> = {
    name: "inquiries",
    summaryKey: "commands.website.inquiries.summary",
    descriptionKey: "commands.website.inquiries.summary",
    output: "standard",
    inputSchema: inquiriesInput,
    options: [...siteOptions, { name: "cursor", longFlag: "--cursor", valueName: "cursor", descriptionKey: "options.websiteManaged.cursor" }],
    handler: async (input, context) => {
        const site = await resolveSite(input, context);
        const result = await requestWebsitesApi(await resolveTarget(input, context), context, {
            path: websitePath(site, "/inquiries"),
            query: input.cursor === undefined ? undefined : { cursor: input.cursor },
            schema: z.object({ items: z.array(inquirySchema), next_cursor: z.string().nullable() }),
        });
        context.output.emit(result, () => context.stdout.write(`${JSON.stringify(result, null, 2)}\n`));
    },
};

// The numbers behind the analytics report: totals, the previous period, a
// series and the top pages and sources. The report URL travels with them for
// what the numbers cannot answer.
const analyticsInput = siteInput.extend({
    days: z.string().optional(),
    from: z.string().optional(),
    limit: z.string().optional(),
    timezone: z.string().optional(),
    to: z.string().optional(),
});
const analytics: CliCommandDefinition<z.infer<typeof analyticsInput>> = {
    name: "analytics",
    summaryKey: "commands.website.analytics.summary",
    descriptionKey: "commands.website.analytics.description",
    output: "standard",
    inputSchema: analyticsInput,
    options: [
        ...siteOptions,
        { name: "days", longFlag: "--days", valueName: "days", descriptionKey: "options.websiteManaged.analyticsDays" },
        { name: "from", longFlag: "--from", valueName: "date", descriptionKey: "options.websiteManaged.analyticsFrom" },
        { name: "to", longFlag: "--to", valueName: "date", descriptionKey: "options.websiteManaged.analyticsTo" },
        { name: "timezone", longFlag: "--timezone", valueName: "timezone", descriptionKey: "options.websiteManaged.analyticsTimezone" },
        { name: "limit", longFlag: "--limit", valueName: "limit", descriptionKey: "options.websiteManaged.analyticsLimit" },
    ],
    handler: async (input, context) => {
        const query = websiteAnalyticsQuery(input);
        const site = await resolveSite(input, context);
        const result = await requestWebsitesApi(await resolveTarget(input, context), context, {
            path: websitePath(site, "/analytics"),
            query,
            // One read runs a dozen aggregate queries. When analytics is
            // unavailable the service says so (502): the CLI-wide retries are
            // enough, and this client's own on top would only add load.
            retry: false,
            schema: z.object({ analytics: websiteAnalyticsSchema }),
        });
        context.output.emit(result.analytics, () => context.stdout.write(websiteAnalyticsText(result.analytics, context.translator)));
    },
};

type CustomDomain = z.infer<typeof customDomainSchema>;
const domainResponseSchema = z.object({ custom_domain: customDomainSchema.nullable() });

// The service's own rule, checked here so a typo is reported before any
// request: a full domain name, with internationalized names sent as punycode.
const hostnameShape = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const hostnameForbidden = /[\s/:@?#*]/;
const trailingDot = /\.$/;

function normalizeHostname(input: string): string | undefined {
    const trimmed = input.trim().toLowerCase().replace(trailingDot, "");
    if (trimmed === "" || hostnameForbidden.test(trimmed))
        return undefined;
    const ascii = domainToASCII(trimmed);
    return hostnameShape.test(ascii) ? ascii : undefined;
}

function writeCustomDomain(domain: CustomDomain | null, context: CliExecutionContext): void {
    const t = context.translator.t.bind(context.translator);
    if (domain === null) {
        context.stdout.write(`${t("websiteManaged.text.noCustomDomain")}\n`);
        return;
    }
    // Ownership comes first: until the TXT record is found the service does not
    // issue a certificate, so that record is listed ahead of the CNAME.
    const unverified = domain.verification !== undefined && domain.verified_at === null;
    const fields = [
        [t("labels.status"), domain.status],
        [t("websiteManaged.text.url"), domain.url],
    ];
    if (unverified && domain.verification !== undefined)
        fields.push([t("websiteManaged.text.ownershipRecord"), `${domain.verification.type} ${domain.verification.name} -> ${domain.verification.value}`]);
    fields.push([t("websiteManaged.text.dnsRecord"), `${domain.dns.type} ${domain.dns.name} -> ${domain.dns.value}`]);
    if (domain.message !== null)
        fields.push([t("websiteManaged.text.message"), domain.message]);
    const hintKey = unverified ? "websiteManaged.text.verifyHint" : "websiteManaged.text.dnsHint";
    const hint = domain.status === "active" ? "" : `${t(hintKey)}\n`;
    context.stdout.write(`${domain.hostname}\n${fields.map(([label, value]) => `  - ${label}: ${value}\n`).join("")}${hint}`);
}

const domainSetInput = siteInput.extend({ hostname: z.string().min(1) });
const domainSet: CliCommandDefinition<z.infer<typeof domainSetInput>> = {
    name: "set",
    summaryKey: "commands.website.domain.set.summary",
    descriptionKey: "commands.website.domain.set.summary",
    output: "standard",
    inputSchema: domainSetInput,
    arguments: [{ name: "hostname", descriptionKey: "arguments.websiteManaged.hostname", required: true }],
    options: siteOptions,
    handler: async (input, context) => {
        const hostname = normalizeHostname(input.hostname);
        if (hostname === undefined) {
            throw new CliUserError("errors.websiteManaged.invalidHostname", 2, { hostname: input.hostname });
        }
        const site = await resolveSite(input, context);
        const result = await requestWebsitesApi(await resolveTarget(input, context), context, {
            body: { hostname },
            path: websitePath(site, "/custom-domain"),
            schema: domainResponseSchema,
        });
        context.output.emit(result, () => writeCustomDomain(result.custom_domain, context));
    },
};
const domainRemove: CliCommandDefinition<z.infer<typeof siteInput>> = {
    name: "remove",
    summaryKey: "commands.website.domain.remove.summary",
    descriptionKey: "commands.website.domain.remove.summary",
    output: "standard",
    inputSchema: siteInput,
    options: siteOptions,
    handler: async (input, context) => {
        const site = await resolveSite(input, context);
        const result = await requestWebsitesApi(await resolveTarget(input, context), context, {
            method: "DELETE",
            path: websitePath(site, "/custom-domain"),
            schema: domainResponseSchema,
        });
        context.output.emit(result, () => writeCustomDomain(result.custom_domain, context));
    },
};
// `domain` alone shows the binding; the service checks it against the ownership
// record, the certificate and the DNS state on each read, so rerunning it
// follows an unverified or pending one.
const domain: CliCommandDefinition<z.infer<typeof siteInput>> = {
    name: "domain",
    summaryKey: "commands.website.domain.summary",
    descriptionKey: "commands.website.domain.summary",
    output: "standard",
    inputSchema: siteInput,
    options: siteOptions,
    children: [domainSet, domainRemove],
    handler: async (input, context) => {
        const site = await resolveSite(input, context);
        const result = await requestWebsitesApi(await resolveTarget(input, context), context, {
            path: websitePath(site, "/custom-domain"),
            schema: domainResponseSchema,
        });
        context.output.emit(result, () => writeCustomDomain(result.custom_domain, context));
    },
};

export const managedWebsiteCommands = [create, list, get, deploy, deployments, deploymentStatus, rollback, resume, remove, domain, inquiries, analytics];
