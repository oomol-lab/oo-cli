export function preparePackageManifest(packageManifestContent: string, releaseVersion: string): string {
    if (!releaseVersion || !releaseVersion.trim()) {
        throw new Error("RELEASE_VERSION is required.");
    }

    const packageManifest = JSON.parse(packageManifestContent) as Record<string, unknown>;
    packageManifest.version = releaseVersion;
    packageManifest.private = false;

    return `${JSON.stringify(packageManifest, null, 2)}\n`;
}

export function buildCreateReleaseCommand(input: {
    releaseTag: string;
    previousTag: string;
    target: string;
    assets: readonly string[];
}): string[] {
    if (input.releaseTag === "") {
        throw new Error("RELEASE_TAG is required.");
    }

    if (input.target === "") {
        throw new Error("GITHUB_SHA is required.");
    }

    if (input.assets.length === 0) {
        throw new Error("At least one release asset is required.");
    }

    const command = [
        "gh",
        "release",
        "create",
        input.releaseTag,
        ...input.assets,
        "--target",
        input.target,
        "--title",
        input.releaseTag,
        "--generate-notes",
    ];

    if (input.previousTag !== "") {
        command.push("--notes-start-tag", input.previousTag);
    }

    command.push("--latest");
    return command;
}

export function buildUploadReleaseAssetsCommand(input: {
    releaseTag: string;
    assets: readonly string[];
}): string[] {
    if (input.releaseTag === "") {
        throw new Error("RELEASE_TAG is required.");
    }

    if (input.assets.length === 0) {
        throw new Error("At least one release asset is required.");
    }

    return [
        "gh",
        "release",
        "upload",
        input.releaseTag,
        ...input.assets,
        "--clobber",
    ];
}

export function buildFeishuReleaseNotification(input: {
    releaseVersion: string;
    releaseTag: string;
    repository: string;
    serverUrl: string;
    runId: string;
    timestamp?: string;
    sign?: string;
}): string {
    const { releaseVersion, releaseTag } = normalizeReleaseInput(input);

    const releaseUrl = `${input.serverUrl}/${input.repository}/releases/tag/${releaseTag}`;
    const runUrl = `${input.serverUrl}/${input.repository}/actions/runs/${input.runId}`;
    const payload: Record<string, unknown> = {
        msg_type: "text",
        content: {
            text: [
                `oo-cli ${releaseTag} 已发布`,
                "",
                `版本：${releaseVersion}`,
                `npm：https://www.npmjs.com/package/@oomol-lab/oo-cli/v/${releaseVersion}`,
                `Release：${releaseUrl}`,
                `Workflow：${runUrl}`,
            ].join("\n"),
        },
    };

    return stringifyFeishuCustomBotPayload(payload, input);
}

export function buildFeishuReleaseFollowupNotification(input: {
    atUserId: string;
    timestamp?: string;
    sign?: string;
}): string {
    const atUserId = input.atUserId.trim();
    if (atUserId === "") {
        throw new Error("FEISHU_RELEASE_FOLLOWUP_AT_USER_ID is required.");
    }

    const payload: Record<string, unknown> = {
        msg_type: "text",
        content: {
            text: `<at user_id="${escapeFeishuTextAttribute(atUserId)}">follow-up bot</at> 更新 oo-cli`,
        },
    };

    return stringifyFeishuCustomBotPayload(payload, input);
}

function normalizeReleaseInput(input: {
    releaseVersion: string;
    releaseTag: string;
}): { releaseVersion: string; releaseTag: string } {
    const releaseVersion = input.releaseVersion.trim();
    if (releaseVersion === "") {
        throw new Error("RELEASE_VERSION is required.");
    }

    const releaseTag = input.releaseTag.trim();
    if (releaseTag === "") {
        throw new Error("RELEASE_TAG is required.");
    }

    return { releaseVersion, releaseTag };
}

function stringifyFeishuCustomBotPayload(payload: Record<string, unknown>, input: {
    timestamp?: string;
    sign?: string;
}): string {
    if (input.timestamp !== undefined && input.sign !== undefined) {
        payload.timestamp = input.timestamp;
        payload.sign = input.sign;
    }

    return JSON.stringify(payload);
}

function escapeFeishuTextAttribute(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;");
}
