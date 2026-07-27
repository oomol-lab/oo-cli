import type { CliExecutionContext, Fetcher } from "../../contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    toRequest,
} from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import {
    createRegistryPackageDownloadCountPath,
    createRegistryPackageInfoPath,
    createRegistryPackageShareDownloadMetaPath,
    createRegistryPackageTarballPath,
    downloadRegistryPackageTarball,
    loadRegistryPackageSkillInfo,
    tryReportRegistryPackageDownload,
} from "./registry-skill-source.ts";

describe("registry skill source", () => {
    test("creates the package info path for scoped packages", () => {
        expect(createRegistryPackageInfoPath("@foo/bar")).toBe(
            "/-/oomol/package-info/%40foo%2Fbar/latest",
        );
    });

    test("creates the package tarball path for scoped packages", () => {
        expect(createRegistryPackageTarballPath("@foo/bar", "1.2.3")).toBe(
            "/@foo/bar/-/meta/bar-1.2.3.tgz",
        );
    });

    test("creates the package tarball path for unscoped packages", () => {
        expect(createRegistryPackageTarballPath("openai", "1.2.3")).toBe(
            "/openai/-/meta/openai-1.2.3.tgz",
        );
    });

    test("creates the package share download meta path", () => {
        expect(createRegistryPackageShareDownloadMetaPath("share/id")).toBe(
            "/-/oomol/package-shares/download-meta/share%2Fid",
        );
    });

    test("creates the package download count path for scoped packages", () => {
        expect(createRegistryPackageDownloadCountPath("@foo/bar", "1.2.3")).toBe(
            "/-/oomol/packages/@foo/bar/1.2.3/download-count",
        );
    });

    test("loads package skills info and ignores the when field", async () => {
        const requests: Request[] = [];
        const context = createRegistrySkillSourceContext({
            fetcher: async (input, init) => {
                requests.push(toRequest(input, init));

                return new Response(JSON.stringify({
                    packageName: "openai",
                    version: "0.0.3",
                    skills: [
                        {
                            description: "Chat with a model",
                            name: "chatgpt",
                            title: "ChatGPT",
                            when: "ignored",
                        },
                    ],
                }));
            },
        });

        await expect(
            loadRegistryPackageSkillInfo(
                "openai",
                {
                    apiKey: "secret-1",
                    endpoint: "oomol.com",
                },
                context,
            ),
        ).resolves.toEqual({
            packageName: "openai",
            packageVersion: "0.0.3",
            skills: [
                {
                    description: "Chat with a model",
                    name: "chatgpt",
                    title: "ChatGPT",
                },
            ],
        });
        expect(requests).toHaveLength(1);
        expect(requests[0]!.headers.get("Authorization")).toBe("secret-1");
    });

    test("downloads a package tarball with authorization", async () => {
        const requests: Request[] = [];
        const context = createRegistrySkillSourceContext({
            fetcher: async (input, init) => {
                requests.push(toRequest(input, init));

                return new Response(new Uint8Array([1, 2, 3]));
            },
        });

        await expect(
            downloadRegistryPackageTarball(
                "openai",
                "0.0.3",
                {
                    apiKey: "secret-1",
                    endpoint: "oomol.com",
                },
                context,
            ),
        ).resolves.toEqual(new Uint8Array([1, 2, 3]));
        expect(requests).toHaveLength(1);
        expect(requests[0]!.headers.get("Authorization")).toBe("secret-1");
        expect(requests[0]!.method).toBe("GET");
        expect(requests[0]!.url).toBe(
            "https://registry.oomol.com/openai/-/meta/openai-0.0.3.tgz",
        );
    });

    test("downloads a shared package tarball with authorization", async () => {
        const requests: Request[] = [];
        const context = createRegistrySkillSourceContext({
            fetcher: async (input, init) => {
                requests.push(toRequest(input, init));

                return new Response(new Uint8Array([4, 5, 6]));
            },
        });

        await expect(
            downloadRegistryPackageTarball(
                "openai",
                "0.0.3",
                {
                    apiKey: "secret-1",
                    endpoint: "oomol.com",
                },
                context,
                "share-1",
            ),
        ).resolves.toEqual(new Uint8Array([4, 5, 6]));
        expect(requests).toHaveLength(1);
        expect(requests[0]!.headers.get("Authorization")).toBe("secret-1");
        expect(requests[0]!.method).toBe("GET");
        expect(requests[0]!.url).toBe(
            "https://registry.oomol.com/-/oomol/package-shares/download-meta/share-1",
        );
    });

    test("reports package download count with authorization", async () => {
        const requests: Request[] = [];
        const context = createRegistrySkillSourceContext({
            fetcher: async (input, init) => {
                requests.push(toRequest(input, init));

                return new Response(null, { status: 204 });
            },
        });

        await tryReportRegistryPackageDownload(
            "openai",
            "0.0.3",
            {
                apiKey: "secret-1",
                endpoint: "oomol.com",
            },
            context,
        );
        expect(requests).toHaveLength(1);
        expect(requests[0]!.method).toBe("POST");
        expect(requests[0]!.url).toBe(
            "https://registry.oomol.com/-/oomol/packages/openai/0.0.3/download-count",
        );
        expect(requests[0]!.headers.get("Authorization")).toBe("secret-1");
        expect(requests[0]!.headers.get("Content-Type")).toBe("application/json");
    });

    test("download count reporting failure does not throw", async () => {
        const requests: Request[] = [];
        const context = createRegistrySkillSourceContext({
            fetcher: async (input, init) => {
                requests.push(toRequest(input, init));

                return new Response("failed", { status: 500 });
            },
        });

        await expect(
            tryReportRegistryPackageDownload(
                "openai",
                "0.0.3",
                {
                    apiKey: "secret-1",
                    endpoint: "oomol.com",
                },
                context,
            ),
        ).resolves.toBeUndefined();
        expect(requests).toHaveLength(1);
        expect(requests[0]!.url).toBe(
            "https://registry.oomol.com/-/oomol/packages/openai/0.0.3/download-count",
        );
    });
});

function createRegistrySkillSourceContext(options: {
    fetcher: Fetcher;
}): Pick<CliExecutionContext, "fetcher" | "logger" | "translator"> {
    return {
        fetcher: options.fetcher,
        logger: pino({
            enabled: false,
        }),
        translator: createTranslator("en"),
    };
}
