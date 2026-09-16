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
        digest: "9b7f0ef7550b7025e04af5d82e676796bd98b7884cbfc820f9b20466a7a4914a",
        length: 143_420,
        url: "https://static.oomol.com/release/apps/open-flow/command/open-flow-0.1.0-beta.27-9b7f0ef7550b7025e04af5d82e676796bd98b7884cbfc820f9b20466a7a4914a.tar.gz",
    },
    bunVersion: "1.4.2",
    format: "open-flow-command-release",
    openFlowVersion: "0.1.0-beta.27",
    version: 1,
} as const satisfies OpenFlowCommandRelease;
