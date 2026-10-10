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
        digest: "cab2ca0199adc759ef48afc68e125908ea7df24ef6ee28c85de889a332ee4646",
        length: 81_840,
        url: "https://static.oomol.com/release/apps/open-flow/command/open-flow-0.1.0-beta.58-cab2ca0199adc759ef48afc68e125908ea7df24ef6ee28c85de889a332ee4646.tar.gz",
    },
    bunVersion: "1.4.2",
    format: "open-flow-command-release",
    openFlowVersion: "0.1.0-beta.58",
    version: 1,
} as const satisfies OpenFlowCommandRelease;
