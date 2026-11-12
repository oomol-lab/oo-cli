import type { CliCommandContext, CliCommandDefinition } from "../../contracts/cli.ts";
import type { Space } from "./api.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { formatTextTable } from "../shared/text-table.ts";
import {
    createSpace,
    createSpacesClient,
    deleteSpace,
    getSpace,
    listSpaces,
    resumeSpaces,
    spaceStatuses,
    spaceVisibilities,
} from "./api.ts";
import { formatTime, orDash, spaceArgument, spaceInput, teamInput, teamOptions, writeFields, yesOption } from "./shared.ts";

export function assertVisibility(value: string): void {
    if (!(spaceVisibilities as readonly string[]).includes(value)) {
        throw new CliUserError("errors.spaces.invalidVisibility", 2, { value });
    }
}

function writeSpace(space: Space, context: CliCommandContext): void {
    const t = context.translator.t.bind(context.translator);

    writeFields(context.stdout, space.slug, [
        [t("spaces.text.id"), space.id],
        [t("spaces.text.name"), space.name],
        [t("labels.status"), space.building ? t("spaces.text.statusBuilding", { status: space.status }) : space.status],
        [t("spaces.text.visibility"), space.visibility],
        [t("spaces.text.url"), space.url],
        [t("spaces.text.convexDeployment"), orDash(space.convexDeploymentName)],
        [t("spaces.text.convexDeploymentUrl"), orDash(space.convexDeploymentUrl)],
        [t("spaces.text.nextCharge"), formatTime(space.nextChargeAt)],
        [t("spaces.text.suspendedAt"), formatTime(space.suspendedAt)],
        [t("spaces.text.graceUntil"), formatTime(space.graceUntil)],
        [t("spaces.text.lastError"), orDash(space.lastError)],
        [t("spaces.text.createdBy"), orDash(space.createdBy)],
        [t("spaces.text.createdAt"), formatTime(space.createdAt)],
        [t("spaces.text.updatedAt"), formatTime(space.updatedAt)],
    ]);
}

const listInput = teamInput.extend({ status: z.string().optional() });
const list: CliCommandDefinition<z.infer<typeof listInput>> = {
    name: "list",
    summaryKey: "commands.spaces.list.summary",
    output: "standard",
    inputSchema: listInput,
    options: [...teamOptions, { name: "status", longFlag: "--status", valueName: "status", descriptionKey: "options.spaces.status" }],
    handler: async (input, context) => {
        if (input.status !== undefined && !(spaceStatuses as readonly string[]).includes(input.status)) {
            throw new CliUserError("errors.spaces.invalidStatus", 2, { value: input.status });
        }

        const spaces = await listSpaces(await createSpacesClient(input, context), input.status);

        context.output.emit(spaces, () => {
            const t = context.translator.t.bind(context.translator);

            if (spaces.length === 0) {
                context.stdout.write(`${t("spaces.text.noSpaces")}\n`);
                return;
            }

            context.stdout.write(`${formatTextTable<Space>([
                { header: t("spaces.text.slug"), render: space => space.slug },
                { header: t("labels.status"), render: space => (space.building ? `${space.status}*` : space.status) },
                { header: t("spaces.text.visibility"), render: space => space.visibility },
                { header: t("spaces.text.url"), render: space => space.url },
                { header: t("spaces.text.updatedAt"), render: space => formatTime(space.updatedAt) },
                { header: t("spaces.text.id"), render: space => space.id },
            ], spaces, createWriterColors(context.stdout))}\n`);
        });
    },
};

const createInput = teamInput.extend({
    name: z.string().optional(),
    slug: z.string().min(1),
    visibility: z.string().optional(),
});
const create: CliCommandDefinition<z.infer<typeof createInput>> = {
    name: "create",
    summaryKey: "commands.spaces.create.summary",
    descriptionKey: "commands.spaces.create.description",
    output: "standard",
    inputSchema: createInput,
    arguments: [{ name: "slug", descriptionKey: "arguments.spaces.slug", required: true }],
    options: [
        ...teamOptions,
        { name: "name", longFlag: "--name", valueName: "name", descriptionKey: "options.spaces.name" },
        { name: "visibility", longFlag: "--visibility", valueName: "visibility", descriptionKey: "options.spaces.createVisibility" },
    ],
    handler: async (input, context) => {
        if (input.visibility !== undefined) {
            assertVisibility(input.visibility);
        }

        const space = await createSpace(await createSpacesClient(input, context), {
            name: input.name,
            slug: input.slug,
            visibility: input.visibility,
        });

        context.output.emit(space, () => writeSpace(space, context));
    },
};

const get: CliCommandDefinition<z.infer<typeof spaceInput>> = {
    name: "get",
    summaryKey: "commands.spaces.get.summary",
    output: "standard",
    inputSchema: spaceInput,
    arguments: [spaceArgument],
    options: teamOptions,
    handler: async (input, context) => {
        const space = await getSpace(await createSpacesClient(input, context), input.space);

        context.output.emit(space, () => writeSpace(space, context));
    },
};

const removeInput = spaceInput.extend({ yes: z.boolean().optional() });
const remove: CliCommandDefinition<z.infer<typeof removeInput>> = {
    name: "delete",
    summaryKey: "commands.spaces.delete.summary",
    descriptionKey: "commands.spaces.delete.description",
    output: "standard",
    inputSchema: removeInput,
    arguments: [spaceArgument],
    options: [...teamOptions, yesOption],
    handler: async (input, context) => {
        // Nothing of a deleted space can be restored, so deleting always
        // takes an explicit confirmation.
        if (input.yes !== true) {
            throw new CliUserError("errors.spaces.deleteNotConfirmed", 2, { space: input.space });
        }

        const job = await deleteSpace(await createSpacesClient(input, context), input.space);

        context.output.emit({ job }, () => context.stdout.write(`${context.translator.t("spaces.text.deleteQueued", {
            id: job.id,
            space: input.space,
            status: job.status,
        })}\n`));
    },
};

// Charges a new period for each space and puts it back online at once,
// instead of waiting for the service's own balance check.
const resumeInput = teamInput.extend({ all: z.boolean().optional(), space: z.array(z.string().min(1)).optional() });
const resume: CliCommandDefinition<z.infer<typeof resumeInput>> = {
    name: "resume",
    summaryKey: "commands.spaces.resume.summary",
    descriptionKey: "commands.spaces.resume.description",
    output: "standard",
    inputSchema: resumeInput,
    arguments: [{ name: "space", descriptionKey: "arguments.spaces.resumeSpaces", required: false, variadic: true }],
    options: [...teamOptions, { name: "all", longFlag: "--all", descriptionKey: "options.spaces.resumeAll" }],
    handler: async (input, context) => {
        const targets = input.space ?? [];

        if ((input.all === true) === (targets.length > 0)) {
            throw new CliUserError("errors.spaces.resumeTargets", 2);
        }

        const client = await createSpacesClient(input, context);
        // The service resumes by id; a slug is resolved to its id first.
        const spaceIds = input.all === true
            ? undefined
            : await Promise.all(targets.map(async target => (await getSpace(client, target)).id));
        const result = await resumeSpaces(client, spaceIds);

        context.output.emit(result, () => {
            const t = context.translator.t.bind(context.translator);
            const lines = [
                t("spaces.text.resumeSummary", { resumed: result.resumed.length, skipped: result.skipped.length }),
                ...result.resumed.map(space => `  ${t("spaces.text.resumed")}  ${space.slug}  ${space.url}`),
                ...result.skipped.map(item => `  ${t("spaces.text.skipped")}  ${item.spaceId}  ${item.code}`),
            ];

            context.stdout.write(`${lines.join("\n")}\n`);
        });
    },
};

export const manageSpaceCommands = [list, create, get, remove, resume];
