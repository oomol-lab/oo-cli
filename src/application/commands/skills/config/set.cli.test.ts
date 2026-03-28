import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../../__tests__/helpers.ts";

describe("skills config set CLI", () => {
    test("supports skills config set for the oo skill implicit invocation policy", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run([
                "skills",
                "config",
                "set",
                "oo",
                "allow-implicit-invocation",
                "false",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                "Set Codex skill oo allow-implicit-invocation to false.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("validates skills config set input", async () => {
        const sandbox = await createCliSandbox();

        try {
            const invalidSkill = await sandbox.run([
                "skills",
                "config",
                "set",
                "missing",
                "allow-implicit-invocation",
                "false",
            ]);
            const invalidKey = await sandbox.run([
                "skills",
                "config",
                "set",
                "oo",
                "missing",
                "false",
            ]);
            const invalidValue = await sandbox.run([
                "skills",
                "config",
                "set",
                "oo",
                "allow-implicit-invocation",
                "disabled",
            ]);

            expect(invalidSkill.exitCode).toBe(2);
            expect(invalidSkill.stderr).toContain("Unsupported skill");

            expect(invalidKey.exitCode).toBe(2);
            expect(invalidKey.stderr).toContain("Invalid config key for skill oo");

            expect(invalidValue.exitCode).toBe(2);
            expect(invalidValue.stderr).toContain(
                "Invalid allow-implicit-invocation value for skill oo",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
