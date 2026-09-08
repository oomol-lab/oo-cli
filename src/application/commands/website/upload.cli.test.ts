import { truncate } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
    expectTelemetryFreeOfTeamIdentity,
    toRequest,
    writeAuthFile,
    writeAuthFileWithDefaultTeam,
} from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";
import {
    parseTelemetryRowPayload,
    readTelemetryRowsForTest,
} from "../../telemetry/outbox.ts";
import { maxWebsiteUploadSizeBytes } from "./upload.ts";

const generateUploadUrlPath = "/v1/single-website/action/generate-upload-url";
const uploadUrl = "https://oomol-store-single-website.account.r2.cloudflarestorage.com/v1/team-1/site-1/index.html?X-Amz-Signature=upload-secret";
const publicUrl = "https://r2.inklycat.com/v1/team-1/site-1/index.html";
const htmlContent = "<!doctype html><title>hi</title>";

describe("website upload CLI", () => {
    test("uploads an HTML file and prints its public URL", async () => {
        const sandbox = await createCliSandbox();
        const localFilePath = join(sandbox.env.HOME!, "index.html");

        try {
            await writeAuthFile(sandbox);
            await Bun.write(localFilePath, htmlContent);

            const { requests, result } = await runRecordedUpload(sandbox, [
                "website",
                "upload",
                localFilePath,
            ]);
            const telemetryPayload = readUploadTelemetryPayload(sandbox);

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(requests.map(request => request.url)).toEqual([
                `https://fusion-api.oomol.com${generateUploadUrlPath}`,
                uploadUrl,
            ]);
            expect(requests[0]?.method).toBe("POST");
            expect(requests[0]?.headers.get("Authorization")).toBe("secret-1");
            await expect(requests[0]?.json()).resolves.toEqual({
                fileSize: htmlContent.length,
            });
            // The presigned upload authenticates through its signature alone.
            expect(requests[1]?.method).toBe("PUT");
            expect(requests[1]?.headers.get("Authorization")).toBeNull();
            expect(requests[1]?.headers.get("Content-Type")).toBe("text/html");
            await expect(requests[1]?.text()).resolves.toBe(htmlContent);
            expect(telemetryPayload).toMatchObject({
                properties: {
                    bytes_total_bucket: "<1KB",
                    command_full: "website.upload",
                    identity_source: "none",
                    rejected_not_html: false,
                    rejected_too_large: false,
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("url");
            expect(JSON.stringify(telemetryPayload)).not.toContain("inklycat");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports json output for both --json and --format=json", async () => {
        const sandbox = await createCliSandbox();
        const localFilePath = join(sandbox.env.HOME!, "page.htm");

        try {
            await writeAuthFile(sandbox);
            await Bun.write(localFilePath, htmlContent);

            const jsonAliasResult = await runRecordedUpload(sandbox, [
                "website",
                "upload",
                localFilePath,
                "--json",
            ]);
            const jsonFormatResult = await runRecordedUpload(sandbox, [
                "website",
                "upload",
                localFilePath,
                "--format=json",
            ]);

            expect({
                jsonAliasResult: createCliSnapshot(jsonAliasResult.result),
                jsonFormatResult: createCliSnapshot(jsonFormatResult.result),
            }).toMatchSnapshot();
            expect(JSON.parse(jsonAliasResult.result.stdout)).toEqual({
                fileName: "page.htm",
                fileSize: htmlContent.length,
                url: publicUrl,
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uses the development fusion-api host for development accounts", async () => {
        const sandbox = await createCliSandbox();
        const localFilePath = join(sandbox.env.HOME!, "index.html");

        try {
            await writeAuthFile(sandbox, {
                accounts: [
                    {
                        id: "user-1",
                        name: "Alice",
                        apiKey: "secret-1",
                        endpoint: "oomol.dev",
                    },
                ],
            });
            await Bun.write(localFilePath, htmlContent);

            const { requests, result } = await runRecordedUpload(sandbox, [
                "website",
                "upload",
                localFilePath,
            ]);

            expect(result.exitCode).toBe(0);
            expect(requests[0]?.url).toBe(
                `https://fusion-api.oomol.dev${generateUploadUrlPath}`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("requires login before uploading", async () => {
        const sandbox = await createCliSandbox();
        const localFilePath = join(sandbox.env.HOME!, "index.html");
        let called = false;

        try {
            await Bun.write(localFilePath, htmlContent);

            const result = await sandbox.run(["website", "upload", localFilePath], {
                fetcher: async () => {
                    called = true;
                    return new Response("{}");
                },
            });

            expect(createCliSnapshot(result)).toEqual({
                exitCode: 1,
                stderr: "You must log in before using this command.\n",
                stdout: "",
            });
            expect(called).toBe(false);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects files that are not HTML without sending a request", async () => {
        const sandbox = await createCliSandbox();
        const localFilePath = join(sandbox.env.HOME!, "report.pdf");
        let called = false;

        try {
            await writeAuthFile(sandbox);
            await Bun.write(localFilePath, "%PDF-1.7");

            const result = await sandbox.run(["website", "upload", localFilePath], {
                fetcher: async () => {
                    called = true;
                    return new Response("{}");
                },
            });
            const telemetryPayload = readUploadTelemetryPayload(sandbox);

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toBe(
                `The file ${localFilePath} is not an HTML file. Use a file that ends with .html or .htm.\n`,
            );
            expect(called).toBe(false);
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "website.upload",
                    error_category: "user_error",
                    rejected_not_html: true,
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("path");
            expect(JSON.stringify(telemetryPayload)).not.toContain("report.pdf");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("accepts an upper-case HTML extension", async () => {
        const sandbox = await createCliSandbox();
        const localFilePath = join(sandbox.env.HOME!, "INDEX.HTML");

        try {
            await writeAuthFile(sandbox);
            await Bun.write(localFilePath, htmlContent);

            const { result } = await runRecordedUpload(sandbox, [
                "website",
                "upload",
                localFilePath,
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(publicUrl);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("records rejected too large telemetry without file identity", async () => {
        const sandbox = await createCliSandbox();
        const localFilePath = join(sandbox.env.HOME!, "large-site.html");

        try {
            await writeAuthFile(sandbox);
            await Bun.write(localFilePath, "");
            await truncate(localFilePath, maxWebsiteUploadSizeBytes + 1);

            const result = await sandbox.run(["website", "upload", localFilePath]);
            const telemetryPayload = readUploadTelemetryPayload(sandbox);

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toBe(
                `The file at ${localFilePath} is ${maxWebsiteUploadSizeBytes + 1} bytes, which exceeds the 20 MiB limit of ${maxWebsiteUploadSizeBytes} bytes.\n`,
            );
            expect(telemetryPayload).toMatchObject({
                properties: {
                    bytes_total_bucket: "<100MB",
                    command_full: "website.upload",
                    error_category: "user_error",
                    rejected_not_html: false,
                    rejected_too_large: true,
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("file_name");
            expect(telemetryPayload?.properties).not.toHaveProperty("path");
        }
        finally {
            await Bun.file(localFilePath).delete();
            await sandbox.cleanup();
        }
    });

    test("explains a missing team context instead of the raw status", async () => {
        const sandbox = await createCliSandbox();
        const localFilePath = join(sandbox.env.HOME!, "index.html");

        try {
            await writeAuthFile(sandbox);
            await Bun.write(localFilePath, htmlContent);

            const result = await sandbox.run(["website", "upload", localFilePath], {
                fetcher: async () => new Response(JSON.stringify({
                    success: false,
                    message: "request has no team context",
                    data: null,
                    errorCode: "provider_error",
                }), { status: 400 }),
            });

            expect(createCliSnapshot(result)).toEqual({
                exitCode: 1,
                stderr: "Websites are stored per team, and this account belongs to no team. Create or join a team, then run the command again.\n",
                stdout: "",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports other service failures with their status", async () => {
        const sandbox = await createCliSandbox();
        const localFilePath = join(sandbox.env.HOME!, "index.html");

        try {
            await writeAuthFile(sandbox);
            await Bun.write(localFilePath, htmlContent);

            const result = await sandbox.run(["website", "upload", localFilePath], {
                fetcher: async () => new Response(JSON.stringify({
                    success: false,
                    message: "fileSize too large",
                }), { status: 400 }),
            });

            expect(createCliSnapshot(result)).toEqual({
                exitCode: 1,
                stderr: "The website upload request returned HTTP 400.\n",
                stdout: "",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects unsupported service response bodies", async () => {
        const sandbox = await createCliSandbox();
        const localFilePath = join(sandbox.env.HOME!, "index.html");

        try {
            await writeAuthFile(sandbox);
            await Bun.write(localFilePath, htmlContent);

            const result = await sandbox.run(["website", "upload", localFilePath], {
                fetcher: async () => new Response(JSON.stringify({
                    success: true,
                    data: { publicURL: "not a url", uploadURL: uploadUrl },
                })),
            });

            expect(createCliSnapshot(result)).toEqual({
                exitCode: 1,
                stderr: "The website upload service returned an unsupported response body.\n",
                stdout: "",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails when storage rejects the upload", async () => {
        const sandbox = await createCliSandbox();
        const localFilePath = join(sandbox.env.HOME!, "index.html");
        let storageRequestCount = 0;

        try {
            await writeAuthFile(sandbox);
            await Bun.write(localFilePath, htmlContent);

            const result = await sandbox.run(["website", "upload", localFilePath], {
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);

                    if (request.url === uploadUrl) {
                        storageRequestCount += 1;

                        return new Response("SignatureDoesNotMatch", { status: 403 });
                    }

                    return createUploadUrlResponse();
                },
            });

            expect(createCliSnapshot(result)).toEqual({
                exitCode: 1,
                stderr: "The website upload request returned HTTP 403.\n",
                stdout: "",
            });
            // A signature mismatch is final; only transient statuses retry.
            expect(storageRequestCount).toBe(1);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports website upload command help", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["website", "upload", "--help"]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

describe("website upload team identity", () => {
    test("sends the account default team headers to the website service only", async () => {
        const sandbox = await createCliSandbox();
        const localFilePath = join(sandbox.env.HOME!, "index.html");

        try {
            await writeAuthFileWithDefaultTeam(sandbox, "alice-team", {
                teamId: "team-system-1",
            });
            await Bun.write(localFilePath, htmlContent);

            const { requests, result } = await runRecordedUpload(sandbox, [
                "website",
                "upload",
                localFilePath,
            ]);
            const telemetryPayload = readUploadTelemetryPayload(sandbox);

            expect(result.exitCode).toBe(0);
            expect(readTeamHeaders(requests)).toEqual([
                ["alice-team", "team-system-1"],
                // The presigned upload goes straight to storage and must not
                // leak the team selection outside the OOMOL gateway.
                [null, null],
            ]);
            expect(telemetryPayload?.properties).toMatchObject({
                identity_source: "account",
            });
            expectTelemetryFreeOfTeamIdentity(telemetryPayload?.properties, [
                "alice-team",
                "team-system-1",
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uploads under the team given by --team instead of the account default", async () => {
        const sandbox = await createCliSandbox();
        const localFilePath = join(sandbox.env.HOME!, "index.html");

        try {
            await writeAuthFileWithDefaultTeam(sandbox, "alice-team", {
                teamId: "team-system-1",
            });
            await Bun.write(localFilePath, htmlContent);

            const { requests, result } = await runRecordedUpload(sandbox, [
                "website",
                "upload",
                localFilePath,
                "--team",
                "acme",
            ]);
            const telemetryPayload = readUploadTelemetryPayload(sandbox);

            expect(result.exitCode).toBe(0);
            expect(readTeamHeaders(requests)).toEqual([
                ["acme", null],
                [null, null],
            ]);
            expect(telemetryPayload?.properties).toMatchObject({
                identity_source: "flag",
            });
            expectTelemetryFreeOfTeamIdentity(telemetryPayload?.properties, [
                "acme",
                "alice-team",
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

function createUploadUrlResponse(): Response {
    return new Response(JSON.stringify({
        success: true,
        data: {
            contentLength: htmlContent.length,
            contentType: "text/html",
            expiresIn: 36_000,
            key: "v1/team-1/site-1/index.html",
            publicURL: publicUrl,
            uploadURL: uploadUrl,
        },
    }));
}

async function runRecordedUpload(
    sandbox: Awaited<ReturnType<typeof createCliSandbox>>,
    argv: readonly string[],
): Promise<{
    requests: Request[];
    result: Awaited<ReturnType<typeof sandbox.run>>;
}> {
    const requests: Request[] = [];
    const result = await sandbox.run([...argv], {
        fetcher: async (input, init) => {
            const request = toRequest(input, init);

            requests.push(request);

            if (request.url === uploadUrl) {
                return new Response(null, {
                    headers: { ETag: "\"etag-1\"" },
                    status: 200,
                });
            }

            return createUploadUrlResponse();
        },
    });

    return { requests, result };
}

function readTeamHeaders(
    requests: readonly Request[],
): Array<[string | null, string | null]> {
    return requests.map(request => [
        request.headers.get("x-oo-team-name"),
        request.headers.get("x-oo-team-id"),
    ]);
}

function readUploadTelemetryPayload(
    sandbox: Awaited<ReturnType<typeof createCliSandbox>>,
) {
    return parseTelemetryRowPayload(
        readTelemetryRowsForTest(
            join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
        )[0]!,
    );
}
