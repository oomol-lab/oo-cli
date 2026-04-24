import type {
    CliRunOptions,
    CliRunResult,
    CliSnapshotContext,
} from "../../../__tests__/helpers.ts";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import {
    createCliSandbox,
    createCliSnapshot,
    toRequest,
} from "../../../__tests__/helpers.ts";
import {
    resolveSelfUpdatePaths,
    resolveSelfUpdateVersionFilePath,
} from "../self-update/paths.ts";
import { detectSelfUpdateReleasePlatform } from "../self-update/platform.ts";

describe("self-update commands", () => {
    test("install prints the development-version guard and exits successfully", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["install"], {
                version: "0.0.0-development",
            });

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("install resolves latest.json when no explicit version is provided", async () => {
        const sandbox = await createCliSandbox();
        const releasePlatform = await detectSelfUpdateReleasePlatform({
            arch: process.arch,
            platform: process.platform,
        });
        let latestRequestCount = 0;
        const selfUpdateRuntime = createCapturedSelfUpdateRuntime();

        try {
            const result = await sandbox.run(["install"], {
                fetcher: async (input, init) => {
                    const url = toRequest(input, init).url;

                    if (url.endsWith("/latest.json")) {
                        latestRequestCount += 1;
                        return new Response(JSON.stringify({
                            version: "1.2.3",
                        }));
                    }

                    if (url.endsWith(`/${releasePlatform}/${process.platform === "win32" ? "oo.exe" : "oo"}`)) {
                        return new Response("binary");
                    }

                    throw new Error(`Unexpected request: ${url}`);
                },
                selfUpdateRuntime: selfUpdateRuntime.runtime,
                version: "1.0.0",
            });

            expect(createSelfUpdateInstallSnapshot(result, sandbox)).toMatchSnapshot();
            expect(latestRequestCount).toBe(1);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("install with an explicit version skips latest.json", async () => {
        const sandbox = await createCliSandbox();
        const releasePlatform = await detectSelfUpdateReleasePlatform({
            arch: process.arch,
            platform: process.platform,
        });
        let latestRequestCount = 0;
        const selfUpdateRuntime = createCapturedSelfUpdateRuntime();

        try {
            const result = await sandbox.run(["install", "2.0.0"], {
                fetcher: async (input, init) => {
                    const url = toRequest(input, init).url;

                    if (url.endsWith("/latest.json")) {
                        latestRequestCount += 1;
                        throw new Error("latest.json should not be requested");
                    }

                    if (url.endsWith(`/${releasePlatform}/${process.platform === "win32" ? "oo.exe" : "oo"}`)) {
                        return new Response("binary");
                    }

                    throw new Error(`Unexpected request: ${url}`);
                },
                selfUpdateRuntime: selfUpdateRuntime.runtime,
                version: "1.0.0",
            });

            expect(createSelfUpdateInstallSnapshot(result, sandbox)).toMatchSnapshot();
            expect(latestRequestCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("install does not touch PATH when OO_NO_MODIFY_PATH is set", async () => {
        const sandbox = await createCliSandbox();
        const releasePlatform = await detectSelfUpdateReleasePlatform({
            arch: process.arch,
            platform: process.platform,
        });
        const selfUpdateRuntime = createCapturedSelfUpdateRuntime();

        sandbox.env.OO_NO_MODIFY_PATH = "1";

        try {
            const result = await sandbox.run(["install", "2.0.0"], {
                fetcher: async (input, init) => {
                    const url = toRequest(input, init).url;

                    if (url.endsWith("/latest.json")) {
                        throw new Error("latest.json should not be requested");
                    }

                    if (url.endsWith(`/${releasePlatform}/${process.platform === "win32" ? "oo.exe" : "oo"}`)) {
                        return new Response("binary");
                    }

                    throw new Error(`Unexpected request: ${url}`);
                },
                selfUpdateRuntime: selfUpdateRuntime.runtime,
                version: "1.0.0",
            });

            expect(createSelfUpdateInstallSnapshot(result, sandbox)).toEqual({
                exitCode: 0,
                stderr: "",
                stdout: `Installed oo 2.0.0.\nExecutable: <EXECUTABLE_PATH>\nAdd <HOME>/.local/bin to PATH to run oo in new shells.\n`,
            });
            expect(selfUpdateRuntime.configurePathCallCount()).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("install does not touch PATH when --no-modify-path is passed", async () => {
        const sandbox = await createCliSandbox();
        const releasePlatform = await detectSelfUpdateReleasePlatform({
            arch: process.arch,
            platform: process.platform,
        });
        const selfUpdateRuntime = createCapturedSelfUpdateRuntime();

        try {
            const result = await sandbox.run(["install", "2.0.0", "--no-modify-path"], {
                fetcher: async (input, init) => {
                    const url = toRequest(input, init).url;

                    if (url.endsWith("/latest.json")) {
                        throw new Error("latest.json should not be requested");
                    }

                    if (url.endsWith(`/${releasePlatform}/${process.platform === "win32" ? "oo.exe" : "oo"}`)) {
                        return new Response("binary");
                    }

                    throw new Error(`Unexpected request: ${url}`);
                },
                selfUpdateRuntime: selfUpdateRuntime.runtime,
                version: "1.0.0",
            });

            expect(createSelfUpdateInstallSnapshot(result, sandbox)).toEqual({
                exitCode: 0,
                stderr: "",
                stdout: `Installed oo 2.0.0.\nExecutable: <EXECUTABLE_PATH>\nAdd <HOME>/.local/bin to PATH to run oo in new shells.\n`,
            });
            expect(selfUpdateRuntime.configurePathCallCount()).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("install prints a setup note when automatic PATH configuration fails", async () => {
        const sandbox = await createCliSandbox();
        const releasePlatform = await detectSelfUpdateReleasePlatform({
            arch: process.arch,
            platform: process.platform,
        });
        const selfUpdateRuntime = createCapturedSelfUpdateRuntime(undefined, {
            pathConfigured: false,
        });

        try {
            const result = await sandbox.run(["install", "2.0.0"], {
                fetcher: async (input, init) => {
                    const url = toRequest(input, init).url;

                    if (url.endsWith("/latest.json")) {
                        throw new Error("latest.json should not be requested");
                    }

                    if (url.endsWith(`/${releasePlatform}/${process.platform === "win32" ? "oo.exe" : "oo"}`)) {
                        return new Response("binary");
                    }

                    throw new Error(`Unexpected request: ${url}`);
                },
                selfUpdateRuntime: selfUpdateRuntime.runtime,
                version: "1.0.0",
            });

            expect(createSelfUpdateInstallSnapshot(result, sandbox)).toEqual({
                exitCode: 0,
                stderr: "",
                stdout: `Installed oo 2.0.0.\nExecutable: <EXECUTABLE_PATH>\nAdd <HOME>/.local/bin to PATH to run oo in new shells.\n`,
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("install silently refreshes bundled skills with the target version executable", async () => {
        const sandbox = await createCliSandbox();
        const releasePlatform = await detectSelfUpdateReleasePlatform({
            arch: process.arch,
            platform: process.platform,
        });
        const paths = resolveSelfUpdatePaths({
            env: sandbox.env,
            platform: process.platform,
        });
        const targetVersionPath = resolveSelfUpdateVersionFilePath(
            paths,
            "2.0.0",
        );
        const selfUpdateRuntime = createCapturedSelfUpdateRuntime({
            exitCode: 1,
            signalCode: null,
            stderr: "bundled skill stderr",
            stdout: "bundled skill stdout",
        });

        try {
            const result = await sandbox.run(["install", "2.0.0"], {
                execPath: paths.executablePath,
                fetcher: async (input, init) => {
                    const url = toRequest(input, init).url;

                    if (url.endsWith("/latest.json")) {
                        throw new Error("latest.json should not be requested");
                    }

                    if (url.endsWith(`/${releasePlatform}/${process.platform === "win32" ? "oo.exe" : "oo"}`)) {
                        return new Response("binary");
                    }

                    throw new Error(`Unexpected request: ${url}`);
                },
                selfUpdateRuntime: selfUpdateRuntime.runtime,
                version: "1.0.0",
            });

            expect(createSelfUpdateInstallSnapshot(result, sandbox)).toEqual({
                exitCode: 0,
                stderr: "",
                stdout: `Installed oo 2.0.0.\nExecutable: <EXECUTABLE_PATH>\nAdded <HOME>/.local/bin to PATH. Restart your shell to reload PATH and use oo.\n`,
            });
            expect(selfUpdateRuntime.commands).toEqual([
                {
                    commandArguments: ["skills", "add"],
                    commandPath: targetVersionPath,
                    timeoutMs: 10_000,
                },
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("install renders interactive progress to stderr when stderr is a tty", async () => {
        const sandbox = await createCliSandbox();
        const releasePlatform = await detectSelfUpdateReleasePlatform({
            arch: process.arch,
            platform: process.platform,
        });
        const selfUpdateRuntime = createCapturedSelfUpdateRuntime();

        try {
            const result = await sandbox.run(["install"], {
                fetcher: async (input, init) => {
                    const url = toRequest(input, init).url;

                    if (url.endsWith("/latest.json")) {
                        return new Response(JSON.stringify({
                            version: "1.2.3",
                        }));
                    }

                    if (url.endsWith(`/${releasePlatform}/${process.platform === "win32" ? "oo.exe" : "oo"}`)) {
                        return new Response("binary");
                    }

                    throw new Error(`Unexpected request: ${url}`);
                },
                stderr: {
                    hasColors: true,
                    isTTY: true,
                },
                selfUpdateRuntime: selfUpdateRuntime.runtime,
                version: "1.0.0",
            });
            const snapshot = createCliSnapshot(result, {
                sandbox,
                stripAnsi: true,
            });

            expect(snapshot.stdout).toContain("Installed oo 1.2.3.");
            expect(snapshot.stderr).toContain("Installing oo");
            expect(snapshot.stderr).toContain("Resolving latest release...");
            expect(snapshot.stderr).toContain("Resolved latest release 1.2.3.");
            expect(snapshot.stderr).toContain("Prepared managed install.");
            expect(snapshot.stderr).toContain("Downloaded oo 1.2.3.");
            expect(snapshot.stderr).toContain("Activated executable.");
            expect(snapshot.stderr).toContain("Verified installation.");
            expect(snapshot.stderr).toContain("Cleaned up old artifacts.");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("install rejects an invalid explicit version before touching self-update paths", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["install", "../not-a-version"], {
                version: "1.0.0",
            });

            expect(createCliSnapshot(result)).toEqual({
                exitCode: 2,
                stderr: "Invalid target CLI version: ../not-a-version. Use a semver version.\n",
                stdout: "",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("update prints the development-version guard and exits successfully", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["update"], {
                version: "0.0.0-development",
            });

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("update silently refreshes bundled skills with the target version executable", async () => {
        const sandbox = await createCliSandbox();
        const releasePlatform = await detectSelfUpdateReleasePlatform({
            arch: process.arch,
            platform: process.platform,
        });
        const paths = resolveSelfUpdatePaths({
            env: sandbox.env,
            platform: process.platform,
        });
        const targetVersionPath = resolveSelfUpdateVersionFilePath(
            paths,
            "2.0.0",
        );
        const selfUpdateRuntime = createCapturedSelfUpdateRuntime({
            exitCode: 0,
            signalCode: null,
            stderr: "bundled skill stderr",
            stdout: "bundled skill stdout",
        });

        try {
            const result = await sandbox.run(["update"], {
                execPath: paths.executablePath,
                fetcher: async (input, init) => {
                    const url = toRequest(input, init).url;

                    if (url.endsWith("/latest.json")) {
                        return new Response(JSON.stringify({
                            version: "2.0.0",
                        }));
                    }

                    if (url.endsWith(`/${releasePlatform}/${process.platform === "win32" ? "oo.exe" : "oo"}`)) {
                        return new Response("binary");
                    }

                    throw new Error(`Unexpected request: ${url}`);
                },
                selfUpdateRuntime: selfUpdateRuntime.runtime,
                version: "1.0.0",
            });

            expect(createCliSnapshot(result, { sandbox })).toEqual({
                exitCode: 0,
                stderr: "",
                stdout: "Updated oo from 1.0.0 to 2.0.0.\nAdded <HOME>/.local/bin to PATH. Restart your shell to reload PATH and use oo.\n",
            });
            expect(selfUpdateRuntime.commands).toEqual([
                {
                    commandArguments: ["skills", "add"],
                    commandPath: targetVersionPath,
                    timeoutMs: 10_000,
                },
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("update does not touch PATH when OO_NO_MODIFY_PATH is set", async () => {
        const sandbox = await createCliSandbox();
        const releasePlatform = await detectSelfUpdateReleasePlatform({
            arch: process.arch,
            platform: process.platform,
        });
        const selfUpdateRuntime = createCapturedSelfUpdateRuntime();

        sandbox.env.OO_NO_MODIFY_PATH = "yes";

        try {
            const result = await sandbox.run(["update"], {
                fetcher: async (input, init) => {
                    const url = toRequest(input, init).url;

                    if (url.endsWith("/latest.json")) {
                        return new Response(JSON.stringify({
                            version: "2.0.0",
                        }));
                    }

                    if (url.endsWith(`/${releasePlatform}/${process.platform === "win32" ? "oo.exe" : "oo"}`)) {
                        return new Response("binary");
                    }

                    throw new Error(`Unexpected request: ${url}`);
                },
                selfUpdateRuntime: selfUpdateRuntime.runtime,
                version: "1.0.0",
            });

            expect(createCliSnapshot(result, { sandbox })).toEqual({
                exitCode: 0,
                stderr: "",
                stdout: "Updated oo from 1.0.0 to 2.0.0.\nAdd <HOME>/.local/bin to PATH to run oo in new shells.\n",
            });
            expect(selfUpdateRuntime.configurePathCallCount()).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("update does not touch PATH when --no-modify-path is passed", async () => {
        const sandbox = await createCliSandbox();
        const releasePlatform = await detectSelfUpdateReleasePlatform({
            arch: process.arch,
            platform: process.platform,
        });
        const selfUpdateRuntime = createCapturedSelfUpdateRuntime();

        try {
            const result = await sandbox.run(["update", "--no-modify-path"], {
                fetcher: async (input, init) => {
                    const url = toRequest(input, init).url;

                    if (url.endsWith("/latest.json")) {
                        return new Response(JSON.stringify({
                            version: "2.0.0",
                        }));
                    }

                    if (url.endsWith(`/${releasePlatform}/${process.platform === "win32" ? "oo.exe" : "oo"}`)) {
                        return new Response("binary");
                    }

                    throw new Error(`Unexpected request: ${url}`);
                },
                selfUpdateRuntime: selfUpdateRuntime.runtime,
                version: "1.0.0",
            });

            expect(createCliSnapshot(result, { sandbox })).toEqual({
                exitCode: 0,
                stderr: "",
                stdout: "Updated oo from 1.0.0 to 2.0.0.\nAdd <HOME>/.local/bin to PATH to run oo in new shells.\n",
            });
            expect(selfUpdateRuntime.configurePathCallCount()).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("update prints a setup note when automatic PATH configuration fails", async () => {
        const sandbox = await createCliSandbox();
        const releasePlatform = await detectSelfUpdateReleasePlatform({
            arch: process.arch,
            platform: process.platform,
        });
        const selfUpdateRuntime = createCapturedSelfUpdateRuntime(undefined, {
            pathConfigured: false,
        });

        try {
            const result = await sandbox.run(["update"], {
                fetcher: async (input, init) => {
                    const url = toRequest(input, init).url;

                    if (url.endsWith("/latest.json")) {
                        return new Response(JSON.stringify({
                            version: "2.0.0",
                        }));
                    }

                    if (url.endsWith(`/${releasePlatform}/${process.platform === "win32" ? "oo.exe" : "oo"}`)) {
                        return new Response("binary");
                    }

                    throw new Error(`Unexpected request: ${url}`);
                },
                selfUpdateRuntime: selfUpdateRuntime.runtime,
                version: "1.0.0",
            });

            expect(createCliSnapshot(result, { sandbox })).toEqual({
                exitCode: 0,
                stderr: "",
                stdout: "Updated oo from 1.0.0 to 2.0.0.\nAdd <HOME>/.local/bin to PATH to run oo in new shells.\n",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("update refreshes bundled skills for a same-version native install without downloading a binary", async () => {
        const sandbox = await createCliSandbox();
        const releasePlatform = await detectSelfUpdateReleasePlatform({
            arch: process.arch,
            platform: process.platform,
        });
        const paths = resolveSelfUpdatePaths({
            env: sandbox.env,
            platform: process.platform,
        });
        const currentVersionPath = resolveSelfUpdateVersionFilePath(
            paths,
            "1.2.3",
        );
        let latestRequestCount = 0;
        let binaryRequestCount = 0;
        const selfUpdateRuntime = createCapturedSelfUpdateRuntime();

        try {
            await mkdir(paths.versionsDirectory, { recursive: true });
            await Bun.write(currentVersionPath, "existing-binary");

            const result = await sandbox.run(["update"], {
                fetcher: async (input, init) => {
                    const url = toRequest(input, init).url;

                    if (url.endsWith("/latest.json")) {
                        latestRequestCount += 1;
                        return new Response(JSON.stringify({
                            version: "1.2.3",
                        }));
                    }

                    if (url.endsWith(`/${releasePlatform}/${process.platform === "win32" ? "oo.exe" : "oo"}`)) {
                        binaryRequestCount += 1;
                        throw new Error("binary download should not be requested");
                    }

                    throw new Error(`Unexpected request: ${url}`);
                },
                execPath: paths.executablePath,
                selfUpdateRuntime: selfUpdateRuntime.runtime,
                version: "1.2.3",
            });

            expect(createCliSnapshot(result, { sandbox })).toEqual({
                exitCode: 0,
                stderr: "",
                stdout: "Already up to date at 1.2.3.\nAdded <HOME>/.local/bin to PATH. Restart your shell to reload PATH and use oo.\n",
            });
            expect(latestRequestCount).toBe(1);
            expect(binaryRequestCount).toBe(0);
            expect(selfUpdateRuntime.commands).toEqual([
                {
                    commandArguments: ["skills", "add"],
                    commandPath: currentVersionPath,
                    timeoutMs: 10_000,
                },
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("update repairs a same-version install when the installation method is unknown", async () => {
        const sandbox = await createCliSandbox();
        const releasePlatform = await detectSelfUpdateReleasePlatform({
            arch: process.arch,
            platform: process.platform,
        });
        let binaryRequestCount = 0;
        const selfUpdateRuntime = createCapturedSelfUpdateRuntime();

        try {
            const result = await sandbox.run(["update"], {
                execPath: join(
                    sandbox.cwd,
                    "bin",
                    process.platform === "win32" ? "oo.exe" : "oo",
                ),
                fetcher: async (input, init) => {
                    const url = toRequest(input, init).url;

                    if (url.endsWith("/latest.json")) {
                        return new Response(JSON.stringify({
                            version: "1.2.3",
                        }));
                    }

                    if (url.endsWith(`/${releasePlatform}/${process.platform === "win32" ? "oo.exe" : "oo"}`)) {
                        binaryRequestCount += 1;
                        return new Response("binary");
                    }

                    throw new Error(`Unexpected request: ${url}`);
                },
                selfUpdateRuntime: selfUpdateRuntime.runtime,
                version: "1.2.3",
            });

            expect(createCliSnapshot(result, { sandbox })).toEqual({
                exitCode: 0,
                stderr: "",
                stdout: "Already up to date at 1.2.3.\nAdded <HOME>/.local/bin to PATH. Restart your shell to reload PATH and use oo.\n",
            });
            expect(binaryRequestCount).toBe(1);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("upgrade uses the same update path and repairs a same-version package-manager install", async () => {
        const sandbox = await createCliSandbox();
        const legacyCleanup = createCapturedSelfUpdateRuntime();
        const releasePlatform = await detectSelfUpdateReleasePlatform({
            arch: process.arch,
            platform: process.platform,
        });
        const paths = resolveSelfUpdatePaths({
            env: sandbox.env,
            platform: process.platform,
        });
        const currentVersionPath = resolveSelfUpdateVersionFilePath(
            paths,
            "1.2.3",
        );
        let binaryRequestCount = 0;

        try {
            await mkdir(paths.versionsDirectory, { recursive: true });
            await Bun.write(currentVersionPath, "existing-binary");

            const result = await sandbox.run(["upgrade"], {
                execPath: "/usr/local/lib/node_modules/@oomol-lab/oo-cli/bin/oo",
                fetcher: async (input, init) => {
                    const url = toRequest(input, init).url;

                    if (url.endsWith("/latest.json")) {
                        return new Response(JSON.stringify({
                            version: "1.2.3",
                        }));
                    }

                    if (url.endsWith(`/${releasePlatform}/${process.platform === "win32" ? "oo.exe" : "oo"}`)) {
                        binaryRequestCount += 1;
                        return new Response("binary");
                    }

                    throw new Error(`Unexpected request: ${url}`);
                },
                selfUpdateRuntime: legacyCleanup.runtime,
                version: "1.2.3",
            });

            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
            expect(binaryRequestCount).toBe(1);
            expect(legacyCleanup.commands).toEqual([
                {
                    commandArguments: ["skills", "add"],
                    commandPath: currentVersionPath,
                    timeoutMs: 10_000,
                },
                {
                    commandArguments: ["uninstall", "-g", "@oomol-lab/oo-cli"],
                    commandPath: "/mock/bin/npm",
                    timeoutMs: 10_000,
                },
            ]);
            await expect(Bun.file(paths.executablePath).exists()).resolves.toBeTrue();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("update renders interactive progress to stderr when stderr is a tty", async () => {
        const sandbox = await createCliSandbox();
        const releasePlatform = await detectSelfUpdateReleasePlatform({
            arch: process.arch,
            platform: process.platform,
        });
        const selfUpdateRuntime = createCapturedSelfUpdateRuntime();

        try {
            const result = await sandbox.run(["update"], {
                fetcher: async (input, init) => {
                    const url = toRequest(input, init).url;

                    if (url.endsWith("/latest.json")) {
                        return new Response(JSON.stringify({
                            version: "2.0.0",
                        }));
                    }

                    if (url.endsWith(`/${releasePlatform}/${process.platform === "win32" ? "oo.exe" : "oo"}`)) {
                        return new Response("binary");
                    }

                    throw new Error(`Unexpected request: ${url}`);
                },
                stderr: {
                    hasColors: true,
                    isTTY: true,
                },
                selfUpdateRuntime: selfUpdateRuntime.runtime,
                version: "1.0.0",
            });
            const snapshot = createCliSnapshot(result, {
                stripAnsi: true,
            });

            expect(snapshot.stdout).toContain("Updated oo from 1.0.0 to 2.0.0.");
            expect(snapshot.stderr).toContain("Updating oo");
            expect(snapshot.stderr).toContain("Resolving latest release...");
            expect(snapshot.stderr).toContain("Resolved latest release 2.0.0.");
            expect(snapshot.stderr).toContain("Prepared managed install.");
            expect(snapshot.stderr).toContain("Downloaded oo 2.0.0.");
            expect(snapshot.stderr).toContain("Activated executable.");
            expect(snapshot.stderr).toContain("Verified installation.");
            expect(snapshot.stderr).toContain("Cleaned up old artifacts.");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

function createSelfUpdateInstallSnapshot(
    result: CliRunResult,
    sandbox: CliSnapshotContext,
): CliRunResult {
    const executablePath = resolveSelfUpdatePaths({
        env: sandbox.env,
        platform: process.platform,
    }).executablePath;

    return createCliSnapshot(result, {
        replacements: [
            {
                placeholder: "<EXECUTABLE_PATH>",
                value: executablePath,
            },
        ],
        sandbox,
    });
}

interface CapturedSelfUpdateCommand {
    commandArguments: readonly string[];
    commandPath: string;
    timeoutMs: number;
}

function createCapturedSelfUpdateRuntime(commandResult?: {
    exitCode?: number;
    signalCode?: NodeJS.Signals | null;
    stderr?: string;
    stdout?: string;
}, options: {
    pathConfigurationTarget?: readonly string[];
    pathConfigured?: boolean;
} = {}): {
    commands: CapturedSelfUpdateCommand[];
    configurePathCallCount: () => number;
    runtime: NonNullable<CliRunOptions["selfUpdateRuntime"]>;
} {
    const commands: CapturedSelfUpdateCommand[] = [];
    const result = {
        exitCode: 0,
        signalCode: null,
        stderr: "",
        stdout: "",
        ...commandResult,
    };
    let configurePathCalls = 0;

    return {
        commands,
        configurePathCallCount: () => configurePathCalls,
        runtime: {
            configurePath: async () => {
                configurePathCalls += 1;
                return options.pathConfigured === false
                    ? { status: "failed" }
                    : {
                            status: "configured",
                            target: options.pathConfigurationTarget ?? ["shell profile"],
                        };
            },
            resolveCommandPath: commandName => `/mock/bin/${commandName}`,
            runCommand: async (options) => {
                commands.push({
                    commandArguments: options.commandArguments,
                    commandPath: options.commandPath,
                    timeoutMs: options.timeoutMs,
                });

                return result;
            },
        },
    };
}
