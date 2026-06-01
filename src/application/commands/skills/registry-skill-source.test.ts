import type { CliExecutionContext, Fetcher } from "../../contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    toRequest,
} from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import {
    createRegistryPackageDownloadCountRequestUrl,
    createRegistryPackageInfoRequestUrl,
    createRegistryPackageShareDownloadMetaRequestUrl,
    createRegistryPackageTarballRequestUrl,
    downloadRegistryPackageTarball,
    loadRegistryPackageSkillInfo,
} from "./registry-skill-source.ts";

describe("registry skill source", () => {
    test("creates the package info URL for scoped packages", () => {
        expect(
            createRegistryPackageInfoRequestUrl(
                "oomol.com",
                "@foo/bar",
            ).toString(),
        ).toBe(
            "https://registry.oomol.com/-/oomol/package-info/%40foo%2Fbar/latest",
        );
    });

    test("creates the package tarball URL for scoped packages", () => {
        expect(
            createRegistryPackageTarballRequestUrl(
                "oomol.com",
                "@foo/bar",
                "1.2.3",
            ).toString(),
        ).toBe(
            "https://registry.oomol.com/@foo/bar/-/meta/bar-1.2.3.tgz",
        );
    });

    test("creates the package tarball URL for unscoped packages", () => {
        expect(
            createRegistryPackageTarballRequestUrl(
                "oomol.com",
                "openai",
                "1.2.3",
            ).toString(),
        ).toBe(
            "https://registry.oomol.com/openai/-/meta/openai-1.2.3.tgz",
        );
    });

    test("creates the package share download meta URL", () => {
        expect(
            createRegistryPackageShareDownloadMetaRequestUrl(
                "oomol.com",
                "share/id",
            ).toString(),
        ).toBe(
            "https://registry.oomol.com/-/oomol/package-shares/download-meta/share%2Fid",
        );
    });

    test("creates the package download count URL for scoped packages", () => {
        expect(
            createRegistryPackageDownloadCountRequestUrl(
                "oomol.com",
                "@foo/bar",
                "1.2.3",
            ).toString(),
        ).toBe(
            "https://registry.oomol.com/-/oomol/packages/@foo/bar/1.2.3/download-count",
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

    test("reports download count before downloading the package tarball", async () => {
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
        expect(requests).toHaveLength(2);
        expect(requests[0]!.method).toBe("POST");
        expect(requests[0]!.url).toBe(
            "https://registry.oomol.com/-/oomol/packages/openai/0.0.3/download-count",
        );
        expect(requests[0]!.headers.get("Authorization")).toBe("secret-1");
        expect(requests[0]!.headers.get("Content-Type")).toBe("application/json");
        expect(requests[1]!.headers.get("Authorization")).toBe("secret-1");
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
        expect(requests).toHaveLength(2);
        expect(requests[1]!.url).toBe(
            "https://registry.oomol.com/-/oomol/package-shares/download-meta/share-1",
        );
        expect(requests[1]!.headers.get("Authorization")).toBe("secret-1");
    });

    test("download count reporting failure does not block package download", async () => {
        const requests: Request[] = [];
        const context = createRegistrySkillSourceContext({
            fetcher: async (input, init) => {
                const request = toRequest(input, init);

                requests.push(request);
                if (request.url.endsWith("/download-count")) {
                    return new Response("failed", { status: 500 });
                }

                return new Response(new Uint8Array([7, 8, 9]));
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
        ).resolves.toEqual(new Uint8Array([7, 8, 9]));
        expect(requests).toHaveLength(2);
        expect(requests[0]!.url).toBe(
            "https://registry.oomol.com/-/oomol/packages/openai/0.0.3/download-count",
        );
        expect(requests[1]!.url).toBe(
            "https://registry.oomol.com/openai/-/meta/openai-0.0.3.tgz",
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
