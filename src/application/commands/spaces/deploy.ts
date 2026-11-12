import type { CliCommandContext, CliCommandDefinition } from "../../contracts/cli.ts";
import type { SpaceArtifact, SpaceJob, SpacesClient } from "./api.ts";

import { resolve } from "node:path";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { formatFileSize } from "../shared/file-size.ts";
import { formatTextTable } from "../shared/text-table.ts";
import { createSpacesClient, getJob, getSpace, listArtifacts, listJobs, rollbackSpace, uploadSite } from "./api.ts";
import { formatDuration, isDigits, parseDuration } from "./duration.ts";
import { packDirectory, readZipFile } from "./pack.ts";
import { deployProjectLocally, inspectProject } from "./project.ts";
import { formatTime, orDash, spaceArgument, spaceInput, teamOptions, writeFields } from "./shared.ts";
import { defaultWaitTimeoutMs, waitForJob } from "./wait.ts";

// `deploy` has two inputs. By default it takes a project directory: it
// installs the dependencies, pushes the Convex backend, builds the front end
// and uploads the built site. With `--dir` or `--zip` it only uploads a site
// that is already built and leaves the backend alone.

const waitInputShape = { timeout: z.string().optional(), wait: z.boolean().optional() };
const waitOptions = [
    { name: "wait", longFlag: "--wait", descriptionKey: "options.spaces.wait" },
    { name: "timeout", longFlag: "--timeout", valueName: "duration", descriptionKey: "options.spaces.timeout" },
];

function resolveWaitTimeout(timeout: string | undefined): number {
    if (timeout === undefined) {
        return defaultWaitTimeoutMs;
    }

    const milliseconds = parseDuration(timeout);

    if (milliseconds === undefined) {
        throw new CliUserError("errors.spaces.invalidDuration", 2, { value: timeout });
    }

    return milliseconds;
}

// The command's own progress lines. JSON mode leaves them out, so stderr
// carries nothing but a possible error report and the output of the tools a
// project deploy runs.
function createProgressWriter(context: CliCommandContext): (message: string) => void {
    return context.output.format === "json"
        ? () => {}
        : message => context.stderr.write(`${message}\n`);
}

const jobText = {
    deploy: { queued: "spaces.text.deployQueued", succeeded: "spaces.text.deploySucceeded" },
    rollback: { queued: "spaces.text.rollbackQueued", succeeded: "spaces.text.rollbackSucceeded" },
} as const;

// What follows a queued job. Without `--wait` the job is the result. With it
// the job is polled to its end: a success adds the site URL, and any other
// terminal status is a failure of the command.
async function finishJob(
    request: {
        client: SpacesClient;
        extra?: Record<string, unknown>;
        job: SpaceJob;
        kind: keyof typeof jobText;
        note: (message: string) => void;
        space: string;
        timeoutMs: number;
        wait: boolean;
    },
    context: CliCommandContext,
): Promise<void> {
    const { client, job, note, space } = request;
    const t = context.translator.t.bind(context.translator);

    if (!request.wait) {
        context.output.emit({ job, ...request.extra }, () => context.stdout.write(`${t(jobText[request.kind].queued, {
            id: job.id,
            status: job.status,
        })}\n`));
        return;
    }

    note(t("spaces.deploy.waiting", { id: job.id, timeout: formatDuration(request.timeoutMs) }));

    const finished = await waitForJob(client, space, job, {
        onUpdate: update => note(t("spaces.deploy.jobStatus", { id: update.id, status: update.status })),
        timeoutMs: request.timeoutMs,
    });

    if (finished.status !== "succeeded") {
        throw new CliUserError("errors.spaces.jobFailed", 1, {
            id: finished.id,
            kind: finished.kind,
            message: finished.error ?? "-",
            status: finished.status,
        }, { details: { jobId: finished.id, jobKind: finished.kind, jobStatus: finished.status } });
    }

    const { url } = await getSpace(client, space);

    context.output.emit({ ...finished, url, ...request.extra }, () => context.stdout.write(`${t(jobText[request.kind].succeeded, {
        version: orDash(finished.version),
    })}\n${url}\n`));
}

const deployInput = spaceInput.extend({
    ...waitInputShape,
    build: z.string().optional(),
    dir: z.string().optional(),
    dist: z.string().optional(),
    install: z.boolean().optional(),
    project: z.string().optional(),
    urlEnv: z.string().optional(),
    zip: z.string().optional(),
});
type DeployInput = z.infer<typeof deployInput>;

// Uploads a site that is already built; the backend is left untouched.
async function deployPrebuilt(input: DeployInput, timeoutMs: number, context: CliCommandContext): Promise<void> {
    const t = context.translator.t.bind(context.translator);
    const note = createProgressWriter(context);
    let zip: Uint8Array;

    if (input.dir === undefined) {
        zip = await readZipFile(resolve(context.cwd, input.zip ?? ""));
    }
    else {
        const packed = await packDirectory(resolve(context.cwd, input.dir));

        zip = packed.zip;
        note(t("spaces.deploy.packed", { count: packed.fileCount, size: formatFileSize(zip.byteLength) }));
    }

    const client = await createSpacesClient(input, context);

    note(t("spaces.deploy.uploading", { size: formatFileSize(zip.byteLength), space: input.space }));

    const job = await uploadSite(client, input.space, zip);

    await finishJob({ client, job, kind: "deploy", note, space: input.space, timeoutMs, wait: input.wait === true }, context);
}

async function deployProject(input: DeployInput, timeoutMs: number, context: CliCommandContext): Promise<void> {
    const t = context.translator.t.bind(context.translator);
    const note = createProgressWriter(context);
    const project = await inspectProject(resolve(context.cwd, input.project ?? "."), {
        buildCommand: input.build,
        distDir: input.dist,
    });
    const client = await createSpacesClient(input, context);
    const space = await getSpace(client, input.space);

    // The service refuses a deploy to a space that is not live; say so before
    // spending minutes on an install and a build.
    if (space.status === "suspended") {
        throw new CliUserError("errors.spaces.suspended", 1, undefined, { details: { serviceCode: "space_suspended" } });
    }

    if (space.status !== "live") {
        throw new CliUserError("errors.spaces.notReady", 1, { slug: space.slug, status: space.status });
    }

    await deployProjectLocally({ client, install: input.install !== false, note, project, space, urlEnv: input.urlEnv }, context);

    const packed = await packDirectory(project.distDir);

    note(t("spaces.deploy.packed", { count: packed.fileCount, size: formatFileSize(packed.zip.byteLength) }));
    note(t("spaces.deploy.uploading", { size: formatFileSize(packed.zip.byteLength), space: space.slug }));

    const job = await uploadSite(client, space.id, packed.zip);

    await finishJob({
        client,
        extra: { backendDeployed: project.hasBackend, convexDeploymentUrl: space.convexDeploymentUrl },
        job,
        kind: "deploy",
        note,
        space: space.id,
        timeoutMs,
        wait: input.wait === true,
    }, context);
}

const deploy: CliCommandDefinition<DeployInput> = {
    name: "deploy",
    summaryKey: "commands.spaces.deploy.summary",
    descriptionKey: "commands.spaces.deploy.description",
    output: "standard",
    inputSchema: deployInput,
    arguments: [spaceArgument],
    options: [
        ...teamOptions,
        { name: "project", longFlag: "--project", valueName: "directory", descriptionKey: "options.spaces.project" },
        { name: "build", longFlag: "--build", valueName: "command", descriptionKey: "options.spaces.build" },
        { name: "dist", longFlag: "--dist", valueName: "directory", descriptionKey: "options.spaces.dist" },
        { name: "urlEnv", longFlag: "--url-env", valueName: "name", descriptionKey: "options.spaces.urlEnv" },
        { name: "install", longFlag: "--no-install", descriptionKey: "options.spaces.noInstall" },
        { name: "zip", longFlag: "--zip", valueName: "file", descriptionKey: "options.spaces.zip" },
        { name: "dir", longFlag: "--dir", valueName: "directory", descriptionKey: "options.spaces.dir" },
        ...waitOptions,
    ],
    handler: async (input, context) => {
        const prebuilt = input.zip !== undefined || input.dir !== undefined;
        const projectOptionUsed = input.project !== undefined
            || input.build !== undefined
            || input.dist !== undefined
            || input.urlEnv !== undefined
            || input.install === false;

        if ((input.zip !== undefined && input.dir !== undefined) || (prebuilt && projectOptionUsed)) {
            throw new CliUserError("errors.spaces.deploySourceConflict", 2);
        }

        const timeoutMs = resolveWaitTimeout(input.timeout);

        await (prebuilt ? deployPrebuilt : deployProject)(input, timeoutMs, context);
    },
};

const deployments: CliCommandDefinition<z.infer<typeof spaceInput>> = {
    name: "deployments",
    summaryKey: "commands.spaces.deployments.summary",
    output: "standard",
    inputSchema: spaceInput,
    arguments: [spaceArgument],
    options: teamOptions,
    handler: async (input, context) => {
        const jobs = await listJobs(await createSpacesClient(input, context), input.space);

        context.output.emit(jobs, () => {
            const t = context.translator.t.bind(context.translator);

            if (jobs.length === 0) {
                context.stdout.write(`${t("spaces.text.noJobs")}\n`);
                return;
            }

            context.stdout.write(`${formatTextTable<SpaceJob>([
                { header: t("spaces.text.job"), render: job => job.id },
                { header: t("spaces.text.kind"), render: job => job.kind },
                { header: t("labels.status"), render: job => job.status },
                { header: t("labels.version"), render: job => orDash(job.version) },
                { header: t("spaces.text.createdAt"), render: job => formatTime(job.createdAt) },
                { header: t("spaces.text.finishedAt"), render: job => formatTime(job.finishedAt) },
                { header: t("spaces.text.error"), render: job => orDash(job.error) },
            ], jobs, createWriterColors(context.stdout))}\n`);
        });
    },
};

const deploymentInput = spaceInput.extend({ job: z.string().min(1) });
const deployment: CliCommandDefinition<z.infer<typeof deploymentInput>> = {
    name: "deployment",
    summaryKey: "commands.spaces.deployment.summary",
    output: "standard",
    inputSchema: deploymentInput,
    arguments: [spaceArgument, { name: "job", descriptionKey: "arguments.spaces.job", required: true }],
    options: teamOptions,
    handler: async (input, context) => {
        const job = await getJob(await createSpacesClient(input, context), input.space, input.job);

        context.output.emit(job, () => {
            const t = context.translator.t.bind(context.translator);

            writeFields(context.stdout, job.id, [
                [t("spaces.text.kind"), job.kind],
                [t("labels.status"), job.status],
                [t("labels.version"), orDash(job.version)],
                [t("spaces.text.attempt"), String(job.attempt)],
                [t("spaces.text.error"), orDash(job.error)],
                [t("spaces.text.createdAt"), formatTime(job.createdAt)],
                [t("spaces.text.startedAt"), formatTime(job.startedAt)],
                [t("spaces.text.finishedAt"), formatTime(job.finishedAt)],
            ]);
        });
    },
};

const rollbackInput = spaceInput.extend({ ...waitInputShape, version: z.string() });
const rollback: CliCommandDefinition<z.infer<typeof rollbackInput>> = {
    name: "rollback",
    summaryKey: "commands.spaces.rollback.summary",
    descriptionKey: "commands.spaces.rollback.description",
    output: "standard",
    inputSchema: rollbackInput,
    arguments: [spaceArgument, { name: "version", descriptionKey: "arguments.spaces.version", required: true }],
    options: [...teamOptions, ...waitOptions],
    handler: async (input, context) => {
        // `v3`, as the artifacts table prints it, is accepted next to `3`.
        const digits = input.version.startsWith("v") ? input.version.slice(1) : input.version;

        if (!isDigits(digits) || Number(digits) < 1) {
            throw new CliUserError("errors.spaces.invalidVersion", 2, { value: input.version });
        }

        const timeoutMs = resolveWaitTimeout(input.timeout);
        const client = await createSpacesClient(input, context);
        const job = await rollbackSpace(client, input.space, Number(digits));

        await finishJob({
            client,
            job,
            kind: "rollback",
            note: createProgressWriter(context),
            space: input.space,
            timeoutMs,
            wait: input.wait === true,
        }, context);
    },
};

const artifacts: CliCommandDefinition<z.infer<typeof spaceInput>> = {
    name: "artifacts",
    summaryKey: "commands.spaces.artifacts.summary",
    descriptionKey: "commands.spaces.artifacts.description",
    output: "standard",
    inputSchema: spaceInput,
    arguments: [spaceArgument],
    options: teamOptions,
    handler: async (input, context) => {
        const items = await listArtifacts(await createSpacesClient(input, context), input.space);

        context.output.emit(items, () => {
            const t = context.translator.t.bind(context.translator);
            const yesNo = (value: boolean): string => t(value ? "spaces.text.yes" : "spaces.text.no");

            if (items.length === 0) {
                context.stdout.write(`${t("spaces.text.noArtifacts")}\n`);
                return;
            }

            context.stdout.write(`${formatTextTable<SpaceArtifact>([
                { header: t("labels.version"), render: artifact => `v${artifact.version}` },
                { header: t("labels.status"), render: artifact => artifact.status },
                { header: t("spaces.text.active"), render: artifact => yesNo(artifact.active) },
                { header: t("spaces.text.rollbackable"), render: artifact => yesNo(artifact.rollbackable) },
                { header: t("spaces.text.size"), render: artifact => formatFileSize(artifact.sizeBytes) },
                { header: t("spaces.text.files"), render: artifact => String(artifact.fileCount) },
                { header: t("spaces.text.createdAt"), render: artifact => formatTime(artifact.createdAt) },
                { header: t("spaces.text.sha256"), render: artifact => artifact.sha256.slice(0, 12) },
            ], items, createWriterColors(context.stdout))}\n`);
        });
    },
};

export const deploySpaceCommands = [deploy, deployments, deployment, rollback, artifacts];
