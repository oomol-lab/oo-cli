import { createRequire } from "node:module";

import { describe, expect, test } from "bun:test";

interface RuntimeStub {
    argv: string[];
    exit: (code: number) => void;
    kill: (pid: number, signal: string) => void;
    pid: number;
}

interface ChildProcessStub {
    on: (event: "error" | "exit", handler: (...args: unknown[]) => void) => ChildProcessStub;
}

const require = createRequire(import.meta.url);
const wrapperModule = require("./oo.cjs") as {
    run: (options?: {
        resolveExecutablePath?: () => string;
        runtime?: RuntimeStub;
        spawn?: (
            executablePath: string,
            args: string[],
            options: { stdio: "inherit" },
        ) => ChildProcessStub;
        writeError?: (message: string) => void;
    }) => void;
};

describe("oo wrapper", () => {
    test("spawns the resolved executable with forwarded arguments", () => {
        const runtime = createRuntimeStub(["node", "oo.cjs", "config", "list"]);
        const spawnCalls: Array<{
            args: string[];
            executablePath: string;
            options: { stdio: "inherit" };
        }> = [];
        const handlers = new Map<string, (...args: unknown[]) => void>();

        wrapperModule.run({
            resolveExecutablePath: () => "/mock/bin/oo",
            runtime,
            spawn: (executablePath, args, options) => {
                spawnCalls.push({ args, executablePath, options });
                const child: ChildProcessStub = {
                    on: (event, handler) => {
                        handlers.set(event, handler);
                        return child;
                    },
                };
                return child;
            },
        });

        expect(spawnCalls).toEqual([{
            args: ["config", "list"],
            executablePath: "/mock/bin/oo",
            options: { stdio: "inherit" },
        }]);

        handlers.get("exit")?.(0, null);
        expect(runtime.exits).toEqual([0]);
    });

    test("exits when executable resolution fails", () => {
        const runtime = createRuntimeStub(["node", "oo.cjs"]);
        const errors: string[] = [];

        wrapperModule.run({
            resolveExecutablePath: () => {
                throw new Error("No binary");
            },
            runtime,
            spawn: () => {
                throw new Error("spawn should not be called");
            },
            writeError: message => errors.push(message),
        });

        expect(errors).toEqual(["No binary"]);
        expect(runtime.exits).toEqual([1]);
    });
});

function createRuntimeStub(argv: string[]): RuntimeStub & { exits: number[]; signals: string[] } {
    const exits: number[] = [];
    const signals: string[] = [];

    return {
        argv,
        exit: code => exits.push(code),
        exits,
        kill: (_pid, signal) => signals.push(signal),
        pid: 123,
        signals,
    };
}
