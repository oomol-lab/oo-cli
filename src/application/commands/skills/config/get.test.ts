import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../../__tests__/helpers.ts";

describe("skills config get command", () => {
    test("reads the configured value after skills config set", async () => {
        const sandbox = await createCliSandbox();

        try {
            const setResult = await sandbox.run([
                "skills",
                "config",
                "set",
                "oo",
                "allow-implicit-invocation",
                "false",
            ]);
            const getResult = await sandbox.run([
                "skills",
                "config",
                "get",
                "oo",
                "allow-implicit-invocation",
            ]);

            expect(setResult.exitCode).toBe(0);
            expect(getResult.exitCode).toBe(0);
            expect(getResult.stdout).toBe("false\n");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("lists all known values with configured overrides when the key is omitted", async () => {
        const sandbox = await createCliSandbox();

        try {
            const setResult = await sandbox.run([
                "skills",
                "config",
                "set",
                "oo",
                "allow-implicit-invocation",
                "false",
            ]);
            const getResult = await sandbox.run([
                "skills",
                "config",
                "get",
                "oo",
            ]);

            expect(setResult.exitCode).toBe(0);
            expect(getResult.exitCode).toBe(0);
            expect(getResult.stdout).toBe("allow-implicit-invocation=false\n");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
