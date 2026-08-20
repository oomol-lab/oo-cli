import process from "node:process";
import { describe, expect, test } from "bun:test";
import { detectTelemetryAgentClient } from "./agent-client.ts";

describe("detectTelemetryAgentClient", () => {
    test("reports unknown when no agent marker is present", async () => {
        await withScrubbedAgentEnvironment(async () => {
            expect(await detectTelemetryAgentClient()).toBe("unknown");
        });
    });

    test("maps library agent names onto the telemetry enum", async () => {
        await withScrubbedAgentEnvironment(async () => {
            process.env.CLAUDECODE = "1";
            expect(await detectTelemetryAgentClient()).toBe("claude");

            process.env.CLAUDE_CODE_IS_COWORK = "1";
            expect(await detectTelemetryAgentClient()).toBe("cowork");
        });

        await withScrubbedAgentEnvironment(async () => {
            process.env.CURSOR_TRACE_ID = "trace-1";
            expect(await detectTelemetryAgentClient()).toBe("cursor");
        });

        await withScrubbedAgentEnvironment(async () => {
            process.env.CURSOR_AGENT = "1";
            expect(await detectTelemetryAgentClient()).toBe("cursor-cli");
        });

        await withScrubbedAgentEnvironment(async () => {
            process.env.CODEX_THREAD_ID = "thread-1";
            expect(await detectTelemetryAgentClient()).toBe("codex");
        });

        await withScrubbedAgentEnvironment(async () => {
            process.env.AUGMENT_AGENT = "1";
            expect(await detectTelemetryAgentClient()).toBe("augment-cli");
        });

        await withScrubbedAgentEnvironment(async () => {
            process.env.COPILOT_MODEL = "gpt";
            expect(await detectTelemetryAgentClient()).toBe("github-copilot");
        });
    });

    test("honors the AI_AGENT override for known agent names", async () => {
        await withScrubbedAgentEnvironment(async () => {
            process.env.AI_AGENT = "v0";
            expect(await detectTelemetryAgentClient()).toBe("v0");
        });
    });

    test("maps free-form AI_AGENT values to other instead of passing them through", async () => {
        await withScrubbedAgentEnvironment(async () => {
            process.env.AI_AGENT = "my-homegrown-agent";
            expect(await detectTelemetryAgentClient()).toBe("other");
        });
    });
});

// Every marker @vercel/detect-agent inspects; scrubbing them keeps the tests
// deterministic even when the suite itself runs inside one of these agents.
const agentEnvironmentKeys = [
    "AI_AGENT",
    "ANTIGRAVITY_AGENT",
    "AUGMENT_AGENT",
    "CLAUDECODE",
    "CLAUDE_CODE",
    "CLAUDE_CODE_IS_COWORK",
    "CODEX_CI",
    "CODEX_SANDBOX",
    "CODEX_THREAD_ID",
    "COPILOT_ALLOW_ALL",
    "COPILOT_GITHUB_TOKEN",
    "COPILOT_MODEL",
    "CURSOR_AGENT",
    "CURSOR_EXTENSION_HOST_ROLE",
    "CURSOR_TRACE_ID",
    "GEMINI_CLI",
    "OPENCODE_CLIENT",
    "REPL_ID",
] as const;

async function withScrubbedAgentEnvironment(
    run: () => Promise<void>,
): Promise<void> {
    const savedValues = new Map<string, string | undefined>();

    for (const key of agentEnvironmentKeys) {
        savedValues.set(key, process.env[key]);
        delete process.env[key];
    }

    try {
        await run();
    }
    finally {
        for (const [key, value] of savedValues) {
            if (value === undefined) {
                delete process.env[key];
            }
            else {
                process.env[key] = value;
            }
        }
    }
}
