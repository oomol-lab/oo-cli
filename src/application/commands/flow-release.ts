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
        digest: "47ac61af311a42d9a5657afed1972ccb419336f7983cf6bec9cd75216f111a92",
        length: 100_054,
        url: "https://static.oomol.com/release/apps/open-flow/command/open-flow-0.1.0-alpha.5-47ac61af311a42d9a5657afed1972ccb419336f7983cf6bec9cd75216f111a92.tar.gz",
    },
    bunVersion: "1.4.0",
    format: "open-flow-command-release",
    openFlowVersion: "0.1.0-alpha.5",
    version: 1,
} as const satisfies OpenFlowCommandRelease;
