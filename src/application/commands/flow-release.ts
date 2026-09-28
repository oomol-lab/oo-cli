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
        digest: "b035d3ff1a5ef4ed1d45ffab50f625e081b6b7e6de3da48cbc0a8378bc6736d5",
        length: 168_543,
        url: "https://static.oomol.com/release/apps/open-flow/command/open-flow-0.1.0-beta.48-b035d3ff1a5ef4ed1d45ffab50f625e081b6b7e6de3da48cbc0a8378bc6736d5.tar.gz",
    },
    bunVersion: "1.4.2",
    format: "open-flow-command-release",
    openFlowVersion: "0.1.0-beta.48",
    version: 1,
} as const satisfies OpenFlowCommandRelease;
