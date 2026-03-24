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
