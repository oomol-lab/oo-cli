import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../../__tests__/helpers.ts";

describe("skills recommend mute CLI", () => {
    test("--json dismisses the given packages, sorted and de-duplicated", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["skills", "recommend", "mute", "oo-notion", "oo-gmail", "oo-notion", "--json"],
            );

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({
                muted: false,
                dismissed: ["oo-gmail", "oo-notion"],
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json accumulates dismissals across runs", async () => {
        const sandbox = await createCliSandbox();

        try {
            await sandbox.run(["skills", "recommend", "mute", "oo-gmail", "--json"]);
            const result = await sandbox.run(
                ["skills", "recommend", "mute", "oo-notion", "--json"],
            );

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({
                muted: false,
                dismissed: ["oo-gmail", "oo-notion"],
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--all sets the global mute flag", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["skills", "recommend", "mute", "--all", "--json"],
            );

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({
                muted: true,
                dismissed: [],
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("combining --all with package names exits 2", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["skills", "recommend", "mute", "oo-gmail", "--all"],
            );

            expect(result.exitCode).toBe(2);
            expect(result.stderr).not.toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("passing neither packages nor --all exits 2", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["skills", "recommend", "mute"]);

            expect(result.exitCode).toBe(2);
            expect(result.stderr).not.toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
