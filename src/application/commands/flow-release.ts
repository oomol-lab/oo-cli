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
        digest: "75ce924019c532831fa1d6a07bbda1bdebf38f09f46e9091f1ea74635180e74f",
        length: 104_947,
        url: "https://static.oomol.com/release/apps/open-flow/command/open-flow-0.1.0-beta.6-75ce924019c532831fa1d6a07bbda1bdebf38f09f46e9091f1ea74635180e74f.tar.gz",
    },
    bunVersion: "1.4.0",
    format: "open-flow-command-release",
    openFlowVersion: "0.1.0-beta.6",
    version: 1,
} as const satisfies OpenFlowCommandRelease;
