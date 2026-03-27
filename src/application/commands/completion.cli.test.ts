import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../__tests__/helpers.ts";

describe("completionCommand CLI", () => {
    test("renders supported shells in completion help", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["completion", "--help"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Target shell");
            expect(result.stdout).toContain("\"bash\"");
            expect(result.stdout).toContain("\"zsh\"");
            expect(result.stdout).toContain("\"fish\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders localized choices metadata in Chinese completion help", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["--lang", "zh", "completion", "--help"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("目标 shell");
            expect(result.stdout).toContain("(可选值: \"bash\", \"zsh\", \"fish\")");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
