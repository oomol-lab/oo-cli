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
        digest: "2f908a010f53bfc56fee0e9d794ac077631eebd49721e5f149d2229b781b5da0",
        length: 100_769,
        url: "https://static.oomol.com/release/apps/open-flow/command/open-flow-0.1.0-alpha.11-2f908a010f53bfc56fee0e9d794ac077631eebd49721e5f149d2229b781b5da0.tar.gz",
    },
    bunVersion: "1.4.0",
    format: "open-flow-command-release",
    openFlowVersion: "0.1.0-alpha.11",
    version: 1,
} as const satisfies OpenFlowCommandRelease;
