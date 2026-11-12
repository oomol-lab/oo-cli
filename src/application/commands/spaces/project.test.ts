import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import { createTemporaryDirectory, expectCliUserError, useTemporaryDirectoryCleanup } from "../../../../__tests__/helpers.ts";
import { convexUrlEnv, inspectProject } from "./project.ts";

const temporaryDirectories = useTemporaryDirectoryCleanup();

describe("spaces project inspection", () => {
    test("detects the convex backend and defaults the build command and output directory", async () => {
        const root = await createProject({
            "convex/schema.ts": "",
            "package.json": JSON.stringify({ scripts: { build: "vite build" } }),
        });

        expect(await inspectProject(root, {})).toEqual({
            buildCommand: "bun run build",
            distDir: join(root, "dist"),
            hasBackend: true,
            root,
        });
    });

    test("needs a built site when there is no build to run", async () => {
        const root = await createProject({ "out/index.html": "<html></html>", "package.json": "{}" });
        const error = await expectCliUserError(inspectProject(root, {}));

        expect(error.key).toBe("errors.spaces.buildRequired");
        expect(error.exitCode).toBe(2);
        expect(await inspectProject(root, { distDir: "out" })).toMatchObject({
            buildCommand: null,
            distDir: join(root, "out"),
            hasBackend: false,
        });
    });

    test("takes an explicit build command and treats a blank one as no build", async () => {
        const root = await createProject({
            "out/index.html": "<html></html>",
            "package.json": JSON.stringify({ scripts: { build: "vite build" } }),
        });

        expect((await inspectProject(root, { buildCommand: "make site" })).buildCommand).toBe("make site");
        expect((await inspectProject(root, { buildCommand: "  ", distDir: "out" })).buildCommand).toBeNull();
    });

    test("rejects a missing directory, a missing package.json and invalid JSON as usage errors", async () => {
        const empty = await createProject({});
        const broken = await createProject({ "package.json": "{" });
        const cases = [
            { key: "errors.spaces.projectNotFound", root: join(empty, "nope") },
            { key: "errors.spaces.packageJsonMissing", root: empty },
            { key: "errors.spaces.packageJsonInvalid", root: broken },
        ];

        for (const item of cases) {
            const error = await expectCliUserError(inspectProject(item.root, {}));

            expect(error.key).toBe(item.key);
            expect(error.exitCode).toBe(2);
        }
    });

    test("sets the deployment URL under the common framework names plus an explicit one", () => {
        const url = "https://x.convex.cloud";

        expect(convexUrlEnv(url, "APP_CONVEX_URL")).toEqual({
            APP_CONVEX_URL: url,
            CONVEX_URL: url,
            NEXT_PUBLIC_CONVEX_URL: url,
            PUBLIC_CONVEX_URL: url,
            VITE_CONVEX_URL: url,
        });
        expect(Object.keys(convexUrlEnv(url, undefined))).toHaveLength(4);
    });
});

async function createProject(files: Record<string, string>): Promise<string> {
    const root = await createTemporaryDirectory("oo-spaces-project");

    temporaryDirectories.track(root);

    for (const [path, content] of Object.entries(files)) {
        const target = join(root, path);

        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
    }

    return root;
}
