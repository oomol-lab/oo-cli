import { describe, expect, test } from "bun:test";

import { createTerminalColors } from "../src/application/terminal-colors.ts";
import { createCliSnapshot } from "./helpers.ts";

describe("test helpers", () => {
    test("normalizes cli snapshots for paths, ansi output, and replacement precedence", () => {
        const colors = createTerminalColors(true);
        const sandbox = {
            cwd: "C:\\workspace\\oo-cli",
            env: {
                APPDATA: undefined,
                HOME: "C:\\Users\\Tester",
                LOCALAPPDATA: undefined,
                USERPROFILE: "C:\\Users\\Tester",
                XDG_CONFIG_HOME: "C:\\Users\\Tester\\.config",
                XDG_STATE_HOME: "C:\\Users\\Tester\\.local\\state",
            },
        };
        const outputFilePath = "C:\\workspace\\oo-cli\\artifacts\\result.json";

        expect(createCliSnapshot(
            {
                exitCode: 0,
                stdout: [
                    "C:/Users/Tester/.config/oo-cli/settings.toml",
                    outputFilePath,
                ].join("\r\n"),
                stderr: `${colors.green("ok")} ${outputFilePath}\r`,
            },
            {
                sandbox,
                stripAnsi: true,
                replacements: [
                    {
                        placeholder: "<OUTPUT_FILE>",
                        value: outputFilePath,
                    },
                ],
            },
        )).toEqual({
            exitCode: 0,
            stdout: [
                "<XDG_CONFIG_HOME>/oo-cli/settings.toml",
                "<OUTPUT_FILE>",
            ].join("\n"),
            stderr: "ok <OUTPUT_FILE>\n",
        });
    });
});
