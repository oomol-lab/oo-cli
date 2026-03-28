import { describe, expect, test } from "bun:test";

import { createCliSandbox, createCliSnapshot } from "../../../__tests__/helpers.ts";

describe("completionCommand CLI", () => {
    test("renders supported shells in completion help", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["completion", "--help"]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders localized choices metadata in Chinese completion help", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["--lang", "zh", "completion", "--help"]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
