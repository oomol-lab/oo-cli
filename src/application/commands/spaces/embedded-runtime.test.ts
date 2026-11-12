import { lstat, readlink, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import { createTemporaryDirectory, createTextBuffer, useTemporaryDirectoryCleanup } from "../../../../__tests__/helpers.ts";
import { createEmbeddedRuntime, createRuntimeEnv, describeExit, runProcess } from "./embedded-runtime.ts";

const temporaryDirectories = useTemporaryDirectoryCleanup();

describe.skipIf(process.platform === "win32")("spaces embedded runtime", () => {
    test("links bun and node to the executable and removes the links on dispose", async () => {
        const execPath = join("/opt", "fake", "oo");
        const runtime = await createEmbeddedRuntime(execPath);

        temporaryDirectories.track(runtime.shimDir);

        for (const name of ["bun", "node"]) {
            const link = join(runtime.shimDir, name);

            expect((await lstat(link)).isSymbolicLink()).toBeTrue();
            expect(await readlink(link)).toBe(execPath);
        }

        await runtime.dispose();
        expect(lstat(runtime.shimDir)).rejects.toMatchObject({ code: "ENOENT" });
    });

    test("forwards the child's stdout and stderr and reports its exit code", async () => {
        const dir = await createTemporaryDirectory("oo-spaces-run");
        const script = join(dir, "run.sh");
        const output = createTextBuffer();

        temporaryDirectories.track(dir);
        await writeFile(script, "echo out; echo err 1>&2; exit 3\n");

        const result = await runProcess("sh", [script], {
            cwd: dir,
            env: { PATH: process.env.PATH ?? "" },
            output: output.writer,
        });

        expect(result.exitCode).toBe(3);
        expect(output.read()).toContain("out");
        expect(output.read()).toContain("err");
        expect(describeExit(result)).toBe("exit code 3");
        expect(describeExit({ exitCode: 1, signal: "SIGKILL" })).toBe("killed by SIGKILL");
    });

    test("reports a command that cannot be started", async () => {
        const dir = await createTemporaryDirectory("oo-spaces-run");

        temporaryDirectories.track(dir);

        expect(runProcess(join(dir, "missing-command"), [], {
            cwd: dir,
            env: {},
            output: createTextBuffer().writer,
        })).rejects.toMatchObject({ key: "errors.spaces.spawnFailed" });
    });
});

describe("spaces runtime environment", () => {
    test("puts the links and the project's binaries first on PATH and keeps credentials out", () => {
        const env = createRuntimeEnv({
            base: {
                CONVEX_DEPLOYMENT: "dev:other",
                EMPTY: undefined,
                HOME: "/home/x",
                OO_API_KEY: "secret",
                OO_TEAM_ID: "team-1",
                PATH: "/usr/bin",
            },
            projectRoot: "/proj",
            shimDir: "/tmp/shim",
        });

        expect(env).toEqual({
            BUN_BE_BUN: "1",
            HOME: "/home/x",
            PATH: ["/tmp/shim", join("/proj", "node_modules", ".bin"), "/usr/bin"].join(delimiter),
        });
    });

    test("builds PATH from the links alone when none is inherited", () => {
        expect(createRuntimeEnv({ base: {}, projectRoot: "/p", shimDir: "/s" }).PATH)
            .toBe(["/s", join("/p", "node_modules", ".bin")].join(delimiter));
    });
});
