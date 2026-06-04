import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../../__tests__/helpers.ts";

describe("skills recommend unmute CLI", () => {
    test("--json removes a package from the dismissal list", async () => {
        const sandbox = await createCliSandbox();

        try {
            await sandbox.run(
                ["skills", "recommend", "mute", "oo-gmail", "oo-notion", "--json"],
            );
            const result = await sandbox.run(
                ["skills", "recommend", "unmute", "oo-gmail", "--json"],
            );

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({
                muted: false,
                dismissed: ["oo-notion"],
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json clears the dismissal list when the last package is removed", async () => {
        const sandbox = await createCliSandbox();

        try {
            await sandbox.run(["skills", "recommend", "mute", "oo-gmail", "--json"]);
            const result = await sandbox.run(
                ["skills", "recommend", "unmute", "oo-gmail", "--json"],
            );

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({
                muted: false,
                dismissed: [],
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--all clears the global mute flag", async () => {
        const sandbox = await createCliSandbox();

        try {
            await sandbox.run(["skills", "recommend", "mute", "--all", "--json"]);
            const result = await sandbox.run(
                ["skills", "recommend", "unmute", "--all", "--json"],
            );

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({
                muted: false,
                dismissed: [],
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("passing neither packages nor --all exits 2", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["skills", "recommend", "unmute"]);

            expect(result.exitCode).toBe(2);
            expect(result.stderr).not.toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
