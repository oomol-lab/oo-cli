import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    writeConnectorFile,
} from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";

describe("connector logout CLI", () => {
    test("removes the self-hosted connector configuration and prints the URL", async () => {
        const sandbox = await createCliSandbox();

        try {
            const filePath = await writeConnectorFile(sandbox, {
                token: "oct_test",
                url: "http://localhost:3000",
            });

            const result = await sandbox.run(["connector", "logout"]);
            const fileContent = await readFile(filePath, "utf8");

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain(
                "Disconnected the self-hosted connector at http://localhost:3000",
            );
            expect(fileContent).toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("keeps hand-edited URL secrets out of the logout output", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeConnectorFile(sandbox, {
                token: "oct_test",
                url: "http://localhost:3000/?token=hand-edited-secret",
            });

            const result = await sandbox.run(["connector", "logout"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).not.toContain("hand-edited-secret");
            expect(result.stdout).toContain("token=REDACTED");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("clears a corrupt connector file instead of failing", async () => {
        const sandbox = await createCliSandbox();

        try {
            const filePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "connector.toml",
            );

            await Bun.write(filePath, "url = \"http://localhost:3000\"\nnot valid [ toml");

            const result = await sandbox.run(["connector", "logout"]);
            const fileContent = await readFile(filePath, "utf8");

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain(
                "Removed the self-hosted connector configuration.",
            );
            expect(fileContent).toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("propagates a read failure instead of clearing the file", async () => {
        const sandbox = await createCliSandbox();

        try {
            const filePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "connector.toml",
            );

            // A directory at the config path makes the store read fail with an
            // I/O error rather than a parse error, exercising the readFailed
            // path that must not wipe the configuration.
            await mkdir(filePath, { recursive: true });

            const result = await sandbox.run(["connector", "logout"]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain("Failed to read the connector file");
            // The path must be left untouched instead of being cleared.
            expect((await stat(filePath)).isDirectory()).toBe(true);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prints the not-configured notice when nothing is configured", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["connector", "logout"]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("No self-hosted connector is configured.");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
