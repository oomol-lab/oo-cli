import { describe, expect, test } from "bun:test";
import { resolveSelfUpdateReleasePlatform } from "./platform.ts";

describe("resolveSelfUpdateReleasePlatform", () => {
    test("resolves darwin x64, arm64, and Rosetta targets", () => {
        expect(resolveSelfUpdateReleasePlatform({
            arch: "x64",
            platform: "darwin",
            rosettaTranslated: false,
        })).toBe("darwin-x64");
        expect(resolveSelfUpdateReleasePlatform({
            arch: "x64",
            platform: "darwin",
            rosettaTranslated: true,
        })).toBe("darwin-arm64");
        expect(resolveSelfUpdateReleasePlatform({
            arch: "arm64",
            platform: "darwin",
        })).toBe("darwin-arm64");
    });

    test("resolves linux glibc and musl targets", () => {
        expect(resolveSelfUpdateReleasePlatform({
            arch: "x64",
            linuxLibc: "glibc",
            platform: "linux",
        })).toBe("linux-x64");
        expect(resolveSelfUpdateReleasePlatform({
            arch: "arm64",
            linuxLibc: "glibc",
            platform: "linux",
        })).toBe("linux-arm64");
        expect(resolveSelfUpdateReleasePlatform({
            arch: "x64",
            linuxLibc: "musl",
            platform: "linux",
        })).toBe("linux-x64-musl");
        expect(resolveSelfUpdateReleasePlatform({
            arch: "arm64",
            linuxLibc: "musl",
            platform: "linux",
        })).toBe("linux-arm64-musl");
    });

    test("resolves win32 x64 and arm64 targets", () => {
        expect(resolveSelfUpdateReleasePlatform({
            arch: "x64",
            platform: "win32",
        })).toBe("win32-x64");
        expect(resolveSelfUpdateReleasePlatform({
            arch: "arm64",
            platform: "win32",
        })).toBe("win32-arm64");
    });
});
