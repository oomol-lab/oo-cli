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
        digest: "d66ab2ac95039ed5b187a176efec7937f6874085d692a07273a1c8eecfb25f07",
        length: 98_636,
        url: "https://static.oomol.com/release/apps/open-flow/command/open-flow-0.0.25-dev-d66ab2ac95039ed5b187a176efec7937f6874085d692a07273a1c8eecfb25f07.tar.gz",
    },
    bunVersion: "1.3.14",
    format: "open-flow-command-release",
    openFlowVersion: "0.0.25-dev",
    version: 1,
} as const satisfies OpenFlowCommandRelease;
