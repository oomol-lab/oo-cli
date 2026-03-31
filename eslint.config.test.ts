import { describe, expect, test } from "bun:test";
import { ESLint } from "eslint";

describe("eslint config", () => {
    test("ignores markdown files", async () => {
        const eslint = new ESLint({ cwd: import.meta.dir });

        await expect(eslint.isPathIgnored("README.md")).resolves.toBe(true);
        await expect(eslint.isPathIgnored("docs/commands.md")).resolves.toBe(true);
        await expect(eslint.isPathIgnored("src/index.ts")).resolves.toBe(false);
    });
});
