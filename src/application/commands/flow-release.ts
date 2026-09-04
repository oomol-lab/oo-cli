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
        digest: "ae93f759f075be4f4177c2da59ca03c09878f68fb3fc5242d05d9262b44c33b0",
        length: 105_407,
        url: "https://static.oomol.com/release/apps/open-flow/command/open-flow-0.1.0-beta.10-ae93f759f075be4f4177c2da59ca03c09878f68fb3fc5242d05d9262b44c33b0.tar.gz",
    },
    bunVersion: "1.4.0",
    format: "open-flow-command-release",
    openFlowVersion: "0.1.0-beta.10",
    version: 1,
} as const satisfies OpenFlowCommandRelease;
