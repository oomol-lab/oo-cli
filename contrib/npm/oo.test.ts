import { createRequire } from "node:module";

import { describe, expect, test } from "bun:test";

const require = createRequire(import.meta.url);
const wrapperModule = require("./oo.cjs") as {
    detectPackageManagerFromOoPath: (paths: unknown[]) => string | undefined;
    resolveChildEnvironment: (
        env?: Record<string, string | undefined>,
        options?: {
            installContextFilePath?: string;
            ooPathCandidates?: unknown[];
        },
    ) => Record<string, string | undefined>;
};

describe("oo wrapper", () => {
    test("detects bun from the installed oo path", () => {
        expect(wrapperModule.detectPackageManagerFromOoPath([
            "/Users/demo/.bun/install/global/node_modules/@oomol-lab/oo-cli/bin/oo.cjs",
        ])).toBe("bun");
    });

    test("detects pnpm from the installed oo path", () => {
        expect(wrapperModule.detectPackageManagerFromOoPath([
            "/Users/demo/Library/pnpm/global/5/node_modules/@oomol-lab/oo-cli/bin/oo.cjs",
        ])).toBe("pnpm");
    });

    test("detects npm from the installed oo path under fnm_multishells", () => {
        expect(wrapperModule.detectPackageManagerFromOoPath([
            "/Users/demo/.local/state/fnm_multishells/12345/bin/oo",
        ])).toBe("npm");
    });

    test("does not match unrelated path segments by substring", () => {
        expect(wrapperModule.detectPackageManagerFromOoPath([
            "/Users/demo/aabunxx/install/global/node_modules/@oomol-lab/oo-cli/bin/oo.cjs",
            "/Users/demo/projects/pnpm-tools/bin/oo",
            "/Users/demo/cache/fnm_multishells_backup/bin/oo",
        ])).toBeUndefined();
    });

    test("falls back to npm when install context and path hints are missing", () => {
        expect(wrapperModule.resolveChildEnvironment(
            {},
            {
                installContextFilePath: "/tmp/oo-missing-install-context.json",
                ooPathCandidates: ["/Users/demo/bin/oo"],
            },
        )).toMatchObject({
            OO_INSTALL_PACKAGE_MANAGER: "npm",
        });
    });
});
