import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../__tests__/helpers.ts";

describe("versionCommand CLI", () => {
    test("text output mirrors `oo --version`", async () => {
        const sandbox = await createCliSandbox();

        try {
            const subcommandResult = await sandbox.run(["version"], { version: "1.2.3" });
            const flagResult = await sandbox.run(["--version"], { version: "1.2.3" });

            expect(subcommandResult.exitCode).toBe(0);
            expect(subcommandResult.stderr).toBe("");
            expect(flagResult.exitCode).toBe(0);
            expect(flagResult.stderr).toBe("");
            expect(subcommandResult.stdout).toBe(flagResult.stdout);
            expect(subcommandResult.stdout).toContain("1.2.3");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json emits version with mirrored buildTime and commit fields", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["version", "--json"], { version: "1.2.3" });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload).toMatchObject({ version: "1.2.3" });
            expect(payload).toHaveProperty("buildTime");
            expect(payload).toHaveProperty("commit");
            expect(["string", "null"]).toContain(payload.buildTime === null ? "null" : typeof payload.buildTime);
            expect(["string", "null"]).toContain(payload.commit === null ? "null" : typeof payload.commit);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json --show-schema-version prepends schemaVersion", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["version", "--json", "--show-schema-version"],
                { version: "1.2.3" },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.schemaVersion).toBe("1.0.0");
            expect(payload.version).toBe("1.2.3");
            expect(payload).toHaveProperty("buildTime");
            expect(payload).toHaveProperty("commit");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--format json is equivalent to --json", async () => {
        const sandbox = await createCliSandbox();

        try {
            const formatResult = await sandbox.run(
                ["version", "--format", "json"],
                { version: "1.2.3" },
            );
            const jsonResult = await sandbox.run(["version", "--json"], { version: "1.2.3" });

            expect(formatResult.exitCode).toBe(0);
            expect(jsonResult.exitCode).toBe(0);
            expect(formatResult.stdout).toBe(jsonResult.stdout);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--format xml exits 2 with a format error", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["version", "--format", "xml"],
                { version: "1.2.3" },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stderr).not.toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
