import type {
    CliRunResult,
    CliSnapshotContext,
} from "../../../__tests__/helpers.ts";
import { mkdir } from "node:fs/promises";
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
                version: "1.0.0",
            });

            expect(createSelfUpdateInstallSnapshot(result, sandbox)).toMatchSnapshot();
            expect(latestRequestCount).toBe(0);
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

    test("upgrade uses the same update path and repairs a same-version install", async () => {
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

        try {
            await mkdir(paths.versionsDirectory, { recursive: true });
            await Bun.write(currentVersionPath, "existing-binary");

            const result = await sandbox.run(["upgrade"], {
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
                version: "1.2.3",
            });

            expect(createCliSnapshot(result)).toMatchSnapshot();
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
