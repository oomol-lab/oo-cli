import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { DownloadPlan, WriteDownloadPlan } from "./download/types.ts";

import { stat } from "node:fs/promises";
import { z } from "zod";

import { CliUserError } from "../../contracts/cli.ts";
import {
    defaultFileDownloadOutDir,
    getConfiguredFileDownloadOutDir,
} from "../../schemas/settings.ts";
import {
    finalizeDownloadedFile,
    openTemporaryDownloadFile,
    writeDownloadToTemporaryFile,
} from "./download/file-system.ts";
import {
    ensureOutputDirectory,
    parseFileDownloadExtensionOption,
    parseFileDownloadNameOption,
    parseFileDownloadUrl,
} from "./download/input.ts";
import { resolveDownloadPlan } from "./download/plan.ts";
import { createDownloadProgressReporter } from "./download/progress.ts";
import { createDownloadSessionKey } from "./download/session.ts";

interface FileDownloadInput {
    ext?: string;
    name?: string;
    outDir?: string;
    url: string;
}

const staleDownloadSessionTtlMs = 14 * 24 * 60 * 60 * 1000;

export const fileDownloadCommand: CliCommandDefinition<FileDownloadInput> = {
    name: "download",
    summaryKey: "commands.file.download.summary",
    descriptionKey: "commands.file.download.description",
    missingArgumentBehavior: "showHelp",
    arguments: [
        {
            name: "url",
            descriptionKey: "arguments.url",
            required: true,
        },
        {
            name: "outDir",
            descriptionKey: "arguments.outDir",
            required: false,
        },
    ],
    options: [
        {
            name: "name",
            longFlag: "--name",
            valueName: "name",
            descriptionKey: "options.fileDownloadName",
        },
        {
            name: "ext",
            longFlag: "--ext",
            valueName: "ext",
            descriptionKey: "options.fileDownloadExt",
        },
    ],
    inputSchema: z.object({
        ext: z.string().optional(),
        name: z.string().optional(),
        outDir: z.string().optional(),
        url: z.string(),
    }),
    handler: async (input, context) => {
        const requestUrl = parseFileDownloadUrl(input.url);
        const requestedName = parseFileDownloadNameOption(input.name);
        const requestedExtension = parseFileDownloadExtensionOption(input.ext);

        context.fileDownloadSessionStore.deleteDownloadSessionsUpdatedBefore(
            Date.now() - staleDownloadSessionTtlMs,
        );

        const outputDirectoryInput
            = input.outDir
                ?? getConfiguredFileDownloadOutDir(await context.settingsStore.read())
                ?? defaultFileDownloadOutDir;
        const outputDirectoryPath = await ensureOutputDirectory(
            outputDirectoryInput,
            context.cwd,
            context.env,
        );
        const sessionKey = createDownloadSessionKey({
            outDirPath: outputDirectoryPath,
            requestUrl: requestUrl.toString(),
            requestedExtension,
            requestedName,
        });
        const downloadPlan = await resolveDownloadPlan(
            requestUrl,
            sessionKey,
            context,
        );

        await executeDownloadPlan(downloadPlan, outputDirectoryPath, context);
    },
};

async function executeDownloadPlan(
    downloadPlan: DownloadPlan,
    outputDirectoryPath: string,
    context: Pick<
        CliExecutionContext,
        "fileDownloadSessionStore" | "logger" | "stderr" | "stdout" | "translator"
    >,
): Promise<void> {
    if (downloadPlan.kind === "write-response") {
        await writePlannedDownload(downloadPlan, context.stderr);
    }

    const finalFilePath = await finalizeDownloadedFile(
        downloadPlan.tempFilePath,
        outputDirectoryPath,
        downloadPlan.resolvedFileName.baseName,
        downloadPlan.resolvedFileName.extension,
    );

    context.fileDownloadSessionStore.deleteDownloadSession(downloadPlan.session.id);
    context.logger.info(
        {
            finalFilePath,
            temporaryFilePath: downloadPlan.tempFilePath,
        },
        "File download completed.",
    );
    context.stdout.write(
        `${context.translator.t("file.download.savedTo", {
            path: finalFilePath,
        })}\n`,
    );
}

async function writePlannedDownload(
    downloadPlan: WriteDownloadPlan,
    stderr: CliExecutionContext["stderr"],
): Promise<void> {
    const progressReporter = createDownloadProgressReporter(
        stderr,
        downloadPlan.totalBytes,
    );
    const temporaryFileHandle = await openTemporaryDownloadFile(
        downloadPlan.tempFilePath,
        downloadPlan.mode,
        downloadPlan.initialBytes,
    );

    await writeDownloadToTemporaryFile(
        downloadPlan.response,
        temporaryFileHandle,
        downloadPlan.tempFilePath,
        progressReporter,
        downloadPlan.initialBytes,
    );

    const temporaryFileMetadata = await stat(downloadPlan.tempFilePath);

    if (
        downloadPlan.totalBytes !== undefined
        && temporaryFileMetadata.size !== downloadPlan.totalBytes
    ) {
        throw new CliUserError("errors.fileDownload.downloadFailed", 1, {
            message: `Expected ${downloadPlan.totalBytes} bytes but found ${temporaryFileMetadata.size}.`,
            path: downloadPlan.tempFilePath,
        });
    }
}
