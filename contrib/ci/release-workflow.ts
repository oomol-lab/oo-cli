import { createHmac } from "node:crypto";
import process from "node:process";

import {
    assembleReleaseArtifacts,
    parseBuildTargetIds,
} from "./npm-packages.ts";
import {
    buildCreateReleaseCommand,
    buildFeishuReleaseNotification,
    preparePackageManifest,
} from "./release-steps.ts";

async function runPrepareManifest(): Promise<void> {
    const releaseVersion = readRequiredEnv("RELEASE_VERSION");
    const packageJsonPath = process.env.PACKAGE_JSON_PATH ?? "package.json";
    const packageManifest = await Bun.file(packageJsonPath).text();
    const nextManifest = preparePackageManifest(packageManifest, releaseVersion);
    await Bun.write(packageJsonPath, nextManifest);
}

async function runCreateGitHubRelease(assets: readonly string[]): Promise<void> {
    const command = buildCreateReleaseCommand({
        releaseTag: readRequiredEnv("RELEASE_TAG"),
        previousTag: process.env.PREVIOUS_TAG ?? "",
        target: readRequiredEnv("GITHUB_SHA"),
        assets,
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

async function runNotifyFeishuRelease(): Promise<void> {
    const webhookUrl = readRequiredEnv("FEISHU_RELEASE_WEBHOOK");
    const feishuSignature = createFeishuSignature(process.env.FEISHU_RELEASE_SECRET ?? "");
    const payload = buildFeishuReleaseNotification({
        releaseVersion: readRequiredEnv("RELEASE_VERSION"),
        releaseTag: readRequiredEnv("RELEASE_TAG"),
        repository: readRequiredEnv("GITHUB_REPOSITORY"),
        serverUrl: readRequiredEnv("GITHUB_SERVER_URL"),
        runId: readRequiredEnv("GITHUB_RUN_ID"),
        timestamp: feishuSignature?.timestamp,
        sign: feishuSignature?.sign,
    });

    const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: payload,
    });
    const responseText = await response.text();

    if (!response.ok) {
        throw new Error(`Failed to notify Feishu release group: ${response.status} ${response.statusText}`);
    }

    const responseBody = JSON.parse(responseText) as Record<string, unknown>;
    const errorCode = responseBody.code ?? responseBody.StatusCode;
    if (errorCode !== 0) {
        throw new Error(`Failed to notify Feishu release group: ${responseText}`);
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
