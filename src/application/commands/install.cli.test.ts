import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
} from "../../../__tests__/helpers.ts";

describe("install CLI", () => {
    test("renders install help in English and Chinese", async () => {
        const sandbox = await createCliSandbox();

        try {
            const englishHelp = await sandbox.run(["install", "--help"]);
            const chineseHelp = await sandbox.run([
                "--lang",
                "zh",
                "install",
                "--help",
            ]);

            expect({
                chineseHelp: createCliSnapshot(chineseHelp),
                englishHelp: createCliSnapshot(englishHelp),
            }).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
