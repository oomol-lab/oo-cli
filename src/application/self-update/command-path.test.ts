import { describe, expect, test } from "bun:test";
import { resolveCommandPathCandidates } from "./command-path.ts";

describe("resolveCommandPathCandidates", () => {
    test("treats an empty POSIX PATH value as the current-directory entry", async () => {
        const candidates = await resolveCommandPathCandidates({
            env: {
                PATH: "",
            },
            executableNames: ["oo"],
            pathExists: async path => path === "oo",
            platform: "linux",
        });

        expect(candidates).toEqual([
            {
                directoryPath: ".",
                path: "oo",
            },
        ]);
    });

    test("preserves POSIX empty PATH segments as current-directory entries", async () => {
        const candidates = await resolveCommandPathCandidates({
            env: {
                PATH: ":/managed/bin",
            },
            executableNames: ["oo"],
            pathExists: async path => path === "oo" || path === "/managed/bin/oo",
            platform: "linux",
        });

        expect(candidates).toEqual([
            {
                directoryPath: ".",
                path: "oo",
            },
            {
                directoryPath: "/managed/bin",
                path: "/managed/bin/oo",
            },
        ]);
    });

    test("preserves Windows empty PATH segments without rewriting them", async () => {
        const candidates = await resolveCommandPathCandidates({
            env: {
                Path: ";C:\\managed\\bin",
            },
            executableNames: ["oo.exe"],
            pathExists: async path => (
                path === "oo.exe" || path === "C:\\managed\\bin\\oo.exe"
            ),
            platform: "win32",
        });

        expect(candidates).toEqual([
            {
                directoryPath: "",
                path: "oo.exe",
            },
            {
                directoryPath: "C:\\managed\\bin",
                path: "C:\\managed\\bin\\oo.exe",
            },
        ]);
    });
});
