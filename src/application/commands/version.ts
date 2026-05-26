import type { CliCommandDefinition } from "../contracts/cli.ts";

import { z } from "zod";
import {
    formatBuildTimestampIso,
    resolveCliBuildInfo,
    shortenCommitHash,
} from "../config/build-info.ts";
import { jsonOutputOptions, writeJsonOutput } from "./json-output.ts";
import { createFormatInputError } from "./shared/input-parsing.ts";

const versionFormatValues = ["json"] as const;

interface VersionInput {
    format?: (typeof versionFormatValues)[number];
    showSchemaVersion?: boolean;
}

export const versionCommand: CliCommandDefinition<VersionInput> = {
    name: "version",
    summaryKey: "commands.version.summary",
    descriptionKey: "commands.version.description",
    options: [...jsonOutputOptions],
    inputSchema: z.object({
        format: z.enum(versionFormatValues).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: (input, context) => {
        if (input.format === "json") {
            const buildInfo = resolveCliBuildInfo(context.version);

            writeJsonOutput(
                context.stdout,
                {
                    version: buildInfo.version,
                    buildTime: formatBuildTimestampIso(buildInfo.buildTimestamp) ?? null,
                    commit: shortenCommitHash(buildInfo.commitHash) ?? null,
                },
                { showSchemaVersion: input.showSchemaVersion },
            );
            return;
        }

        context.stdout.write(`${context.versionText ?? context.version}\n`);
    },
};
