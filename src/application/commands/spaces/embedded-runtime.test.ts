import { lstat, mkdtemp, readFile, readlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import { createTemporaryDirectory, createTextBuffer, useTemporaryDirectoryCleanup } from "../../../../__tests__/helpers.ts";
import { createEmbeddedRuntime, createRuntimeEnv, describeExit, runProcess } from "./embedded-runtime.ts";

const temporaryDirectories = useTemporaryDirectoryCleanup();

describe("spaces embedded runtime", () => {
    test.skipIf(process.platform === "win32")("links bun and node to the executable and removes the links on dispose", async () => {
        const execPath = join("/opt", "fake", "oo");
        const runtime = await createEmbeddedRuntime(execPath);

        temporaryDirectories.track(runtime.shimDir);

        for (const name of ["bun", "node"]) {
            const link = join(runtime.shimDir, name);

            expect((await lstat(link)).isSymbolicLink()).toBeTrue();
            expect(await readlink(link)).toBe(execPath);
        }

        await runtime.dispose();
        await expect(lstat(runtime.shimDir)).rejects.toMatchObject({ code: "ENOENT" });
    });

    test("copies the executable to bun.exe and node.exe on Windows and removes them on dispose", async () => {
        const dir = await createTemporaryDirectory("oo-spaces-exec");
        const execPath = join(dir, "oo.exe");

        temporaryDirectories.track(dir);
        await writeFile(execPath, "executable bytes");

        const runtime = await createEmbeddedRuntime(execPath, "win32");

        temporaryDirectories.track(runtime.shimDir);

        for (const name of ["bun.exe", "node.exe"]) {
            const shim = join(runtime.shimDir, name);

            expect((await lstat(shim)).isFile()).toBeTrue();
            expect(await readFile(shim, "utf8")).toBe("executable bytes");
        }

        await runtime.dispose();
        await expect(lstat(runtime.shimDir)).rejects.toMatchObject({ code: "ENOENT" });
        expect(await readFile(execPath, "utf8")).toBe("executable bytes");
    });

    test("fails when the executable cannot be copied", async () => {
        const dir = await createTemporaryDirectory("oo-spaces-exec");

        temporaryDirectories.track(dir);

        await expect(createEmbeddedRuntime(join(dir, "missing.exe"), "win32")).rejects.toMatchObject({ code: "ENOENT" });
    });

    test("removes runtime directories a killed deploy left behind, and only those", async () => {
        const stale = await mkdtemp(join(tmpdir(), "oo-spaces-runtime-"));
        const recent = await mkdtemp(join(tmpdir(), "oo-spaces-runtime-"));
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

        temporaryDirectories.track(stale);
        temporaryDirectories.track(recent);
        await writeFile(join(stale, "bun.exe"), "left behind");
        await utimes(stale, twoDaysAgo, twoDaysAgo);

        const runtime = await createEmbeddedRuntime(process.execPath);

        temporaryDirectories.track(runtime.shimDir);

        await expect(lstat(stale)).rejects.toMatchObject({ code: "ENOENT" });
        expect((await lstat(recent)).isDirectory()).toBeTrue();
        expect((await lstat(runtime.shimDir)).isDirectory()).toBeTrue();

        await runtime.dispose();
    });

    test("runs node from the runtime directory as the executable in Node mode", async () => {
        const dir = await createTemporaryDirectory("oo-spaces-run");
        const runtime = await createEmbeddedRuntime(process.execPath);
        const output = createTextBuffer();

        temporaryDirectories.track(dir);
        temporaryDirectories.track(runtime.shimDir);
        // `node run` executes run.js only in Node mode: as `bun` the same
        // arguments mean the `run` subcommand, and a node installed on the
        // host reports no Bun version.
        await writeFile(join(dir, "run.js"), "console.log('node-mode:' + typeof process.versions.bun);\n");

        const result = await runProcess("node", ["run"], {
            cwd: dir,
            env: createRuntimeEnv({ base: process.env, projectRoot: dir, shimDir: runtime.shimDir }),
            output: output.writer,
        });

        await runtime.dispose();

        expect(output.read()).toContain("node-mode:string");
        expect(result.exitCode).toBe(0);
        await expect(lstat(runtime.shimDir)).rejects.toMatchObject({ code: "ENOENT" });
    });

    test("forwards the child's stdout and stderr and reports its exit code", async () => {
        const dir = await createTemporaryDirectory("oo-spaces-run");
        const output = createTextBuffer();

        temporaryDirectories.track(dir);

        const result = await runProcess(
            process.execPath,
            ["-e", "console.log('out'); console.error('err'); process.exit(3)"],
            {
                cwd: dir,
                env: createRuntimeEnv({ base: process.env, projectRoot: dir, shimDir: dir }),
                output: output.writer,
            },
        );

        expect(result.exitCode).toBe(3);
        expect(output.read()).toContain("out");
        expect(output.read()).toContain("err");
        expect(describeExit(result)).toBe("exit code 3");
        expect(describeExit({ exitCode: 1, signal: "SIGKILL" })).toBe("killed by SIGKILL");
    });

    test("runs a shell command line", async () => {
        const dir = await createTemporaryDirectory("oo-spaces-run");
        const output = createTextBuffer();

        temporaryDirectories.track(dir);

        const result = await runProcess("echo shell-ok", [], {
            cwd: dir,
            env: createRuntimeEnv({ base: process.env, projectRoot: dir, shimDir: dir }),
            output: output.writer,
            shell: true,
        });

        expect(result.exitCode).toBe(0);
        expect(output.read()).toContain("shell-ok");
    });

    test("reports a command that cannot be started", async () => {
        const dir = await createTemporaryDirectory("oo-spaces-run");

        temporaryDirectories.track(dir);

        await expect(runProcess(join(dir, "missing-command"), [], {
            cwd: dir,
            env: {},
            output: createTextBuffer().writer,
        })).rejects.toMatchObject({ key: "errors.spaces.spawnFailed" });
    });
});

describe("spaces runtime environment", () => {
    test("puts the runtime and the project's binaries first on PATH and keeps credentials out", () => {
        const env = createRuntimeEnv({
            base: {
                CONVEX_DEPLOY_KEY: "prod:other|key",
                CONVEX_DEPLOYMENT: "dev:other",
                EMPTY: undefined,
                HOME: "/home/x",
                OO_API_KEY: "secret",
                OO_TEAM_ID: "team-1",
                PATH: "/usr/bin",
                Path: "kept: names are case-sensitive here",
            },
            platform: "linux",
            projectRoot: "/proj",
            shimDir: "/tmp/shim",
        });

        expect(env).toEqual({
            BUN_BE_BUN: "1",
            HOME: "/home/x",
            PATH: ["/tmp/shim", join("/proj", "node_modules", ".bin"), "/usr/bin"].join(posix.delimiter),
            Path: "kept: names are case-sensitive here",
        });
    });

    test("builds PATH from the runtime alone when none is inherited", () => {
        expect(createRuntimeEnv({ base: {}, platform: "darwin", projectRoot: "/p", shimDir: "/s" }).PATH)
            .toBe(["/s", join("/p", "node_modules", ".bin")].join(posix.delimiter));
    });

    test("matches variable names case-insensitively on Windows and writes the search path as PATH", () => {
        const env = createRuntimeEnv({
            base: {
                Convex_Deploy_Key: "prod:other|key",
                Convex_Deployment: "dev:other",
                Oo_Api_Key: "secret",
                Path: "C:\\Windows\\System32",
                SystemRoot: "C:\\Windows",
            },
            platform: "win32",
            projectRoot: "C:\\proj",
            shimDir: "C:\\shim",
        });

        expect(env).toEqual({
            BUN_BE_BUN: "1",
            PATH: ["C:\\shim", join("C:\\proj", "node_modules", ".bin"), "C:\\Windows\\System32"].join(win32.delimiter),
            SystemRoot: "C:\\Windows",
        });
    });
});
