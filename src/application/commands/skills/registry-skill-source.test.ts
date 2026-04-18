import type { CliExecutionContext, Fetcher } from "../../contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    toRequest,
} from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import {
    createRegistryPackageInfoRequestUrl,
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

    test("downloads the package tarball with authorization", async () => {
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
