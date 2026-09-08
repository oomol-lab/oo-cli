import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { OoRequestFailure } from "../shared/oo-request.ts";
import type { UploadSourceFileErrorKeys } from "../shared/upload-source-file.ts";
import type { TeamIdentity } from "../team/identity.ts";

import { extname } from "node:path";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { createRetryingFetcher } from "../../shared/retrying-fetcher.ts";
import { bucketTelemetryBytes } from "../../telemetry/buckets.ts";
import { formatFileSize } from "../shared/file-size.ts";
import { requestOo, requestOoResponse } from "../shared/oo-request.ts";
import { readUploadSourceFile } from "../shared/upload-source-file.ts";
import {
    resolveAccountTeamIdentity,
    teamIdentityHeaders,
    teamIdentityInputShape,
    teamOption,
} from "../team/identity.ts";

interface WebsiteUploadInput {
    filePath: string;
    team?: string;
}

interface WebsiteUploadView {
    fileName: string;
    fileSize: number;
    url: string;
}

interface WebsiteUploadTarget {
    publicUrl: string;
    uploadUrl: string;
}

type WebsiteRequestContext = Pick<CliExecutionContext, "fetcher" | "logger" | "translator">;

// The single-website service stores exactly one HTML object per upload and
// signs its size and content type into the upload URL, so both are fixed here
// and must match what the storage request carries byte for byte.
export const maxWebsiteUploadSizeBytes = 20 * 1024 * 1024;
const websiteContentType = "text/html";
const htmlExtensions = new Set([".html", ".htm"]);
const websiteUploadExtraRetries = 1;

// The service stores websites per team and refuses to fall back to personal
// storage; this is its message when the gateway established no team context.
const teamContextMissingMessage = "request has no team context";

const websiteSourceFileErrorKeys: UploadSourceFileErrorKeys = {
    pathNotFile: "errors.websiteUpload.pathNotFile",
    readFailed: "errors.websiteUpload.readFailed",
    tooLarge: "errors.websiteUpload.tooLarge",
};

const generateUploadUrlResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        publicURL: z.url(),
        uploadURL: z.url(),
    }).passthrough(),
}).passthrough();

export const websiteUploadCommand: CliCommandDefinition<WebsiteUploadInput> = {
    name: "upload",
    summaryKey: "commands.website.upload.summary",
    descriptionKey: "commands.website.upload.description",
    missingArgumentBehavior: "showHelp",
    arguments: [
        {
            name: "filePath",
            descriptionKey: "arguments.filePath",
            required: true,
        },
    ],
    options: [teamOption("options.websiteUploadTeam")],
    output: "standard",
    inputSchema: z.object({
        filePath: z.string(),
        ...teamIdentityInputShape,
    }),
    handler: async (input, context) => {
        const { account } = await requireIdentity(context);
        const identity = await resolveAccountTeamIdentity(input, account, context);

        // The object is served as text/html whatever its bytes are, so only a
        // file that names itself HTML is accepted.
        if (!htmlExtensions.has(extname(input.filePath).toLowerCase())) {
            context.telemetry?.recordProperties({ rejected_not_html: true });
            throw new CliUserError("errors.websiteUpload.notHtml", 2, {
                path: input.filePath,
            });
        }

        context.telemetry?.recordProperties({ rejected_not_html: false });

        const sourceFile = await readUploadSourceFile(input.filePath, context.cwd, {
            errorKeys: websiteSourceFileErrorKeys,
            maxSizeBytes: maxWebsiteUploadSizeBytes,
            recordTelemetryProperties: context.telemetry?.recordProperties,
        });
        // The bytes that are actually sent decide the size the service signs,
        // so the request reports their length rather than the earlier stat.
        const fileBytes = new Uint8Array(await sourceFile.file.arrayBuffer());
        const fileSize = fileBytes.byteLength;

        context.telemetry?.recordProperties({
            bytes_total_bucket: bucketTelemetryBytes(fileSize),
            rejected_too_large: false,
        });

        const target = await generateWebsiteUploadUrl(account, identity, fileSize, context);

        await uploadWebsiteFile(target.uploadUrl, fileBytes, context);

        const view: WebsiteUploadView = {
            fileName: sourceFile.fileName,
            fileSize,
            url: target.publicUrl,
        };

        context.output.emit(view, () => {
            const lines = [
                context.translator.t("website.upload.success", {
                    fileName: view.fileName,
                }),
                `  - ${context.translator.t("file.text.fileSize")}: ${formatFileSize(view.fileSize)}`,
                `  - ${context.translator.t("website.text.url")}: ${view.url}`,
            ];

            context.stdout.write(`${lines.join("\n")}\n`);
        });
    },
};

// The website service call carries the team headers; the presigned upload goes
// straight to storage and never does (see uploadWebsiteFile).
async function generateWebsiteUploadUrl(
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    identity: TeamIdentity | undefined,
    fileSize: number,
    context: WebsiteRequestContext,
): Promise<WebsiteUploadTarget> {
    const response = await requestOo({
        authorization: account.apiKey,
        context,
        errors: { scope: "websiteUpload" },
        headers: teamIdentityHeaders(identity),
        host: { endpoint: account.endpoint, service: "fusion-api" },
        jsonBody: { fileSize },
        label: "Website upload",
        method: "POST",
        path: "/v1/single-website/action/generate-upload-url",
        schema: generateUploadUrlResponseSchema,
        statusErrors: mapWebsiteUploadError,
    });

    return {
        publicUrl: response.data.publicURL,
        uploadUrl: response.data.uploadURL,
    };
}

async function uploadWebsiteFile(
    uploadUrl: string,
    fileBytes: Uint8Array,
    context: WebsiteRequestContext,
): Promise<void> {
    await requestOoResponse({
        body: fileBytes,
        context: {
            fetcher: createRetryingFetcher({
                fetcher: context.fetcher,
                logger: context.logger,
                maxRetries: websiteUploadExtraRetries,
            }),
            logger: context.logger,
            translator: context.translator,
        },
        errors: { scope: "websiteUpload" },
        headers: {
            "Content-Type": websiteContentType,
        },
        host: { baseUrl: uploadUrl },
        label: "Website upload file",
        method: "PUT",
    });
}

function mapWebsiteUploadError(failure: OoRequestFailure): CliUserError | undefined {
    return failure.status === 400
        && failure.bodyText?.includes(teamContextMissingMessage) === true
        ? new CliUserError("errors.websiteUpload.teamRequired", 1)
        : undefined;
}
