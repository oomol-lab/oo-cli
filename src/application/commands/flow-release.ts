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
        digest: "ef1ffb89b4f1ef18d5284773f1e7587e797db64bd1d25f93b0472a107bd85457",
        length: 146_300,
        url: "https://static.oomol.com/release/apps/open-flow/command/open-flow-0.1.0-beta.28-ef1ffb89b4f1ef18d5284773f1e7587e797db64bd1d25f93b0472a107bd85457.tar.gz",
    },
    bunVersion: "1.4.2",
    format: "open-flow-command-release",
    openFlowVersion: "0.1.0-beta.28",
    version: 1,
} as const satisfies OpenFlowCommandRelease;
