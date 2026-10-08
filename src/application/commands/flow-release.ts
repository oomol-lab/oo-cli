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
        digest: "82fd62a57bc475b00853bed9d0bbda467566106a7798ee56dab4f0a59d9d0dce",
        length: 177_534,
        url: "https://static.oomol.com/release/apps/open-flow/command/open-flow-0.1.0-beta.54-82fd62a57bc475b00853bed9d0bbda467566106a7798ee56dab4f0a59d9d0dce.tar.gz",
    },
    bunVersion: "1.4.2",
    format: "open-flow-command-release",
    openFlowVersion: "0.1.0-beta.54",
    version: 1,
} as const satisfies OpenFlowCommandRelease;
