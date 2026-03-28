import { describe, expect, test } from "bun:test";

import { createCliSandbox, createCliSnapshot } from "../../../../../__tests__/helpers.ts";

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

            expect(createCliSnapshot(result)).toMatchSnapshot();
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

            expect({
                invalidKey: createCliSnapshot(invalidKey),
                invalidSkill: createCliSnapshot(invalidSkill),
                invalidValue: createCliSnapshot(invalidValue),
            }).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
