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
        digest: "f560a6e84696b30104c52ea14e2437f30658a7844b09259e893eda15b7fffd40",
        length: 101_032,
        url: "https://static.oomol.com/release/apps/open-flow/command/open-flow-0.1.0-alpha.4-f560a6e84696b30104c52ea14e2437f30658a7844b09259e893eda15b7fffd40.tar.gz",
    },
    bunVersion: "1.4.0",
    format: "open-flow-command-release",
    openFlowVersion: "0.1.0-alpha.4",
    version: 1,
} as const satisfies OpenFlowCommandRelease;
