import type { CliCommandDefinition } from "../contracts/cli.ts";

import { z } from "zod";
import {
    formatBuildTimestampIso,
    resolveCliBuildInfo,
    shortenCommitHash,
} from "../config/build-info.ts";

export const versionCommand: CliCommandDefinition = {
    name: "version",
    summaryKey: "commands.version.summary",
    descriptionKey: "commands.version.description",
    output: "standard",
    inputSchema: z.object({}),
    handler: (_input, context) => {
        if (context.output.format === "json") {
            const buildInfo = resolveCliBuildInfo(context.version);

            context.output.emitJson({
                version: buildInfo.version,
                buildTime: formatBuildTimestampIso(buildInfo.buildTimestamp) ?? null,
                commit: shortenCommitHash(buildInfo.commitHash) ?? null,
            });
            return;
        }

        context.stdout.write(`${context.versionText ?? context.version}\n`);
    },
};
