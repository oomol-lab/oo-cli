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
        digest: "5afea090ea06b1b8a8b6a47bd63515736c3c1b2c10a10203869f95824a5332dc",
        length: 147_695,
        url: "https://static.oomol.com/release/apps/open-flow/command/open-flow-0.1.0-beta.33-5afea090ea06b1b8a8b6a47bd63515736c3c1b2c10a10203869f95824a5332dc.tar.gz",
    },
    bunVersion: "1.4.2",
    format: "open-flow-command-release",
    openFlowVersion: "0.1.0-beta.33",
    version: 1,
} as const satisfies OpenFlowCommandRelease;
