import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import { resolvePackageManager } from "./build.ts";

describe("website build package manager", () => {
    test("uses npm when it is on PATH and the CLI's own Bun runtime when it is not", async () => {
        const dir = await mkdtemp(join(tmpdir(), "oo-website-build-"));
        try {
            const execPath = join(dir, "oo");

            // An empty PATH directory: the host has no npm.
            expect(resolvePackageManager({ PATH: dir }, execPath)).toEqual({
                command: execPath,
                env: { BUN_BE_BUN: "1" },
                installArgs: ["install", "--ignore-scripts"],
            });
            expect(resolvePackageManager({}, execPath).command).toBe(execPath);

            const npm = process.platform === "win32" ? "npm.cmd" : "npm";
            await writeFile(join(dir, npm), "");
            await chmod(join(dir, npm), 0o755);
            // Windows names the variable `Path`.
            expect(resolvePackageManager({ Path: dir }, execPath).command).toBe(npm);
            expect(resolvePackageManager({ PATH: dir }, execPath)).toEqual({
                command: npm,
                env: {},
                installArgs: ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
            });
        }
        finally { await rm(dir, { recursive: true, force: true }); }
    });
});
