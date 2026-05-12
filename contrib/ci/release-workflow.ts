import { createHmac } from "node:crypto";
import process from "node:process";

import {
    assembleReleaseArtifacts,
    parseBuildTargetIds,
} from "./npm-packages.ts";
import { publishNpmPackagesFromOrderFile } from "./npm-publish.ts";
import {
    buildCreateReleaseCommand,
    buildFeishuReleaseFollowupNotification,
    buildFeishuReleaseNotification,
    buildUploadReleaseAssetsCommand,
    preparePackageManifest,
} from "./release-steps.ts";

const defaultGitHubApiUrl = "https://api.github.com";
const githubApiVersion = "2022-11-28";

async function runPrepareManifest(): Promise<void> {
    const releaseVersion = readRequiredEnv("RELEASE_VERSION");
    const packageJsonPath = process.env.PACKAGE_JSON_PATH ?? "package.json";
    const packageManifest = await Bun.file(packageJsonPath).text();
    const nextManifest = preparePackageManifest(packageManifest, releaseVersion);
    await Bun.write(packageJsonPath, nextManifest);
}

async function runCreateGitHubRelease(assets: readonly string[]): Promise<void> {
    const releaseTag = readRequiredEnv("RELEASE_TAG");
    const releaseExists = await doesGitHubReleaseExist(releaseTag);
    const command = releaseExists
        ? buildUploadReleaseAssetsCommand({
                assets,
                releaseTag,
            })
        : buildCreateReleaseCommand({
                assets,
                previousTag: process.env.PREVIOUS_TAG ?? "",
                releaseTag,
                target: readRequiredEnv("GITHUB_SHA"),
            });

    const processResult = Bun.spawn(command, {
        cwd: process.cwd(),
        stderr: "inherit",
        stdout: "inherit",
        stdin: "ignore",
    });

    const exitCode = await processResult.exited;
    if (exitCode !== 0) {
        process.exit(exitCode);
    }
}

async function doesGitHubReleaseExist(releaseTag: string): Promise<boolean> {
    const githubRepository = readRequiredEnv("GITHUB_REPOSITORY");
    const apiUrl = process.env.GITHUB_API_URL ?? defaultGitHubApiUrl;
    const token = readGitHubToken();
    const response = await fetch(
        `${trimTrailingSlash(apiUrl)}/repos/${githubRepository}/releases/tags/${encodeURIComponent(releaseTag)}`,
        {
            headers: {
                "accept": "application/vnd.github+json",
                "authorization": `Bearer ${token}`,
                "x-github-api-version": githubApiVersion,
            },
            signal: AbortSignal.timeout(15_000),
        },
    );

    if (response.status === 404) {
        return false;
    }

    if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}\n${responseText}`);
    }

    return true;
}

function readGitHubToken(): string {
    const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
    if (token === undefined || token === "") {
        throw new Error("GH_TOKEN or GITHUB_TOKEN is required.");
    }

    return token;
}

function trimTrailingSlash(value: string): string {
    return value.endsWith("/") ? value.slice(0, -1) : value;
}

async function runNotifyFeishuRelease(): Promise<void> {
    const releaseVersion = readRequiredEnv("RELEASE_VERSION");
    const releaseTag = readRequiredEnv("RELEASE_TAG");
    const webhookUrl = readRequiredEnv("FEISHU_RELEASE_WEBHOOK");
    const feishuSignature = createFeishuSignature(process.env.FEISHU_RELEASE_SECRET ?? "");
    const payload = buildFeishuReleaseNotification({
        releaseVersion,
        releaseTag,
        repository: readRequiredEnv("GITHUB_REPOSITORY"),
        serverUrl: readRequiredEnv("GITHUB_SERVER_URL"),
        runId: readRequiredEnv("GITHUB_RUN_ID"),
        timestamp: feishuSignature?.timestamp,
        sign: feishuSignature?.sign,
    });

    await sendFeishuCustomBotMessage(webhookUrl, payload, "Feishu release group");

    const atUserId = process.env.FEISHU_RELEASE_FOLLOWUP_AT_USER_ID;
    if (atUserId === undefined || atUserId === "") {
        return;
    }

    const followupSignature = createFeishuSignature(process.env.FEISHU_RELEASE_SECRET ?? "");
    const followupPayload = buildFeishuReleaseFollowupNotification({
        atUserId,
        timestamp: followupSignature?.timestamp,
        sign: followupSignature?.sign,
    });

    await sendFeishuCustomBotMessage(webhookUrl, followupPayload, "Feishu release follow-up bot");
}

async function sendFeishuCustomBotMessage(webhookUrl: string, payload: string, targetName: string): Promise<void> {
    const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: payload,
        signal: AbortSignal.timeout(15_000),
    });
    const responseText = await response.text();

    if (!response.ok) {
        throw new Error(`Failed to notify ${targetName}: ${response.status} ${response.statusText}\n${responseText}`);
    }

    const responseBody = JSON.parse(responseText) as Record<string, unknown>;
    const errorCode = responseBody.code ?? responseBody.StatusCode;
    if (errorCode !== 0) {
        throw new Error(`Failed to notify ${targetName}: ${responseText}`);
    }
}

function createFeishuSignature(secret: string): { timestamp: string; sign: string } | undefined {
    if (secret === "") {
        return undefined;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sign = createHmac("sha256", `${timestamp}\n${secret}`).digest("base64");
    return { timestamp, sign };
}

async function runAssembleReleaseArtifacts(): Promise<void> {
    const releaseVersion = readRequiredEnv("RELEASE_VERSION");
    const outDir = process.env.RELEASE_DIST_DIR ?? "dist";
    const targetIds = parseBuildTargetIds(process.env.BUILD_TARGETS ?? "");

    await assembleReleaseArtifacts({
        outDir,
        releaseVersion,
        targetIds,
    });
}

async function runPublishNpmPackages(): Promise<void> {
    await publishNpmPackagesFromOrderFile({
        publishOrderPath: process.env.NPM_PUBLISH_ORDER_PATH ?? "dist/npm-publish-order.txt",
    });
}

function readRequiredEnv(name: string): string {
    const value = process.env[name];
    if (value === undefined || value === "") {
        throw new Error(`${name} is required.`);
    }

    return value;
}

export async function main(args: readonly string[]): Promise<void> {
    const [command, ...commandArgs] = args;

    switch (command) {
        case "prepare-manifest":
            await runPrepareManifest();
            return;
        case "assemble-release-artifacts":
            await runAssembleReleaseArtifacts();
            return;
        case "publish-npm-packages":
            await runPublishNpmPackages();
            return;
        case "create-github-release":
            await runCreateGitHubRelease(commandArgs);
            return;
        case "notify-feishu-release":
            await runNotifyFeishuRelease();
            return;
        default:
            throw new Error(`Unsupported command: ${command ?? ""}`);
    }
}

if (import.meta.main) {
    await main(process.argv.slice(2));
}
