import type { Fetcher } from "../../contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import { createTranslator } from "../../../i18n/translator.ts";
import { loadPackageInfo, parsePackageSpecifier } from "./package-info.ts";

const packageInfoAccount = {
    apiKey: "secret-1",
    endpoint: "oomol.com",
    id: "user-1",
} as const;
const packageInfoRequestLanguage = "en" as const;

describe("loadPackageInfo", () => {
    test("returns package identity, access, and blocks from the registry response", async () => {
        const context = createPackageInfoContext(
            (async () => new Response(JSON.stringify(
                createRawPackageInfoResponse(),
            ))) satisfies Fetcher,
        );

        const response = await loadPackageInfo(
            parsePackageSpecifier("qrcode@1.0.4"),
            packageInfoAccount,
            packageInfoRequestLanguage,
            context,
        );

        expect(response.packageName).toBe("qrcode");
        expect(response.packageVersion).toBe("1.0.4");
        expect(response.blocks).toHaveLength(1);
        expect(response).not.toHaveProperty("isPrivate");
    });

    test("converts raw isPrivate visibility into normalized access", async () => {
        for (const { access, isPrivate } of [
            { access: "private", isPrivate: true },
            { access: "public", isPrivate: false },
        ] as const) {
            const context = createPackageInfoContext(
                (async () => new Response(JSON.stringify({
                    ...createRawPackageInfoResponse(),
                    isPrivate,
                }))) satisfies Fetcher,
            );

            const response = await loadPackageInfo(
                parsePackageSpecifier(`qrcode-${access}`),
                packageInfoAccount,
                packageInfoRequestLanguage,
                context,
            );

            expect(response.access).toBe(access);
            expect(response).not.toHaveProperty("isPrivate");
        }
    });

    test("throws an invalid-response error when the payload is malformed", async () => {
        const context = createPackageInfoContext(
            (async () => new Response("not json")) satisfies Fetcher,
        );

        await expect(loadPackageInfo(
            parsePackageSpecifier("qrcode@1.0.4"),
            packageInfoAccount,
            packageInfoRequestLanguage,
            context,
        )).rejects.toThrow("errors.packageInfo.invalidResponse");
    });
});

describe("parsePackageSpecifier", () => {
    test("accepts semver prerelease and build metadata when semver is required", () => {
        expect(parsePackageSpecifier("pkg@1.2.3-beta.1+build.01", {
            requireSemver: true,
        })).toEqual({
            packageName: "pkg",
            packageVersion: "1.2.3-beta.1+build.01",
        });
    });

    test("rejects invalid semver when semver is required", () => {
        expect(() => parsePackageSpecifier("pkg@1.2.3-01", {
            requireSemver: true,
            requireVersion: true,
        })).toThrow("errors.packageInfo.invalidPackageSpecifier");
    });

    test("keeps invalid semver suffixes as latest when version is optional", () => {
        expect(parsePackageSpecifier("pkg@1.2.3-01", {
            requireSemver: true,
        })).toEqual({
            packageName: "pkg@1.2.3-01",
            packageVersion: "latest",
        });
    });
});

function createRawPackageInfoResponse() {
    return {
        packageName: "qrcode",
        packageVersion: "1.0.4",
        title: "QR Code",
        description: "The QR Code Toolkit.",
        blocks: [
            {
                blockName: "Exist",
                title: "Exist QR Code",
                description: "Checks whether an image contains a QR code.",
            },
        ],
    };
}

function createPackageInfoContext(fetcher: Fetcher) {
    return {
        fetcher,
        logger: pino({
            enabled: false,
        }),
        translator: createTranslator("en"),
    };
}
