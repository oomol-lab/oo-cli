import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../../__tests__/helpers.ts";

describe("skills config get CLI", () => {
    test("reads the effective oo skill config value for a key", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run([
                "skills",
                "config",
                "get",
                "oo",
                "allow-implicit-invocation",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe("true\n");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("lists all known effective values when the key is omitted", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run([
                "skills",
                "config",
                "get",
                "oo",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe("allow-implicit-invocation=true\n");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("validates skills config get input", async () => {
        const sandbox = await createCliSandbox();

        try {
            const invalidSkill = await sandbox.run([
                "skills",
                "config",
                "get",
                "missing",
            ]);
            const invalidKey = await sandbox.run([
                "skills",
                "config",
                "get",
                "oo",
                "missing",
            ]);

            expect(invalidSkill.exitCode).toBe(2);
            expect(invalidSkill.stderr).toContain("Unsupported skill");

            expect(invalidKey.exitCode).toBe(2);
            expect(invalidKey.stderr).toContain("Invalid config key for skill oo");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
