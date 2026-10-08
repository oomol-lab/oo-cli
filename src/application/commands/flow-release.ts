export interface OpenFlowCommandRelease {
    readonly archive: {
        readonly digest: string;
        readonly length: number;
        readonly url: string;
    };
    readonly bunVersion: string;
    readonly format: "open-flow-command-release";
    readonly openFlowVersion: string;
    readonly version: 1;
}

export const openFlowCommandRelease = {
    archive: {
        digest: "38d8f175cd791cb6a17b2f9e71f227691d6037752ca241fc3805b9bb17136dfd",
        length: 177_519,
        url: "https://static.oomol.com/release/apps/open-flow/command/open-flow-0.1.0-beta.55-38d8f175cd791cb6a17b2f9e71f227691d6037752ca241fc3805b9bb17136dfd.tar.gz",
    },
    bunVersion: "1.4.2",
    format: "open-flow-command-release",
    openFlowVersion: "0.1.0-beta.55",
    version: 1,
} as const satisfies OpenFlowCommandRelease;
