import { describe, expect, test } from "bun:test";

import { createCliSandbox, createCliSnapshot } from "../../../../../__tests__/helpers.ts";

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

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reads the effective oo-find-skills config value for a key", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run([
                "skills",
                "config",
                "get",
                "oo-find-skills",
                "allow-implicit-invocation",
            ]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
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

            expect(createCliSnapshot(result)).toMatchSnapshot();
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
                "oo-find-skills",
                "missing",
            ]);

            expect({
                invalidKey: createCliSnapshot(invalidKey),
                invalidSkill: createCliSnapshot(invalidSkill),
            }).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
