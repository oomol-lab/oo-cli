#!/usr/bin/env node

const { spawn } = require("node:child_process");
const process = require("node:process");

const { resolveExecutablePath } = require("./platform-runtime.cjs");

let executablePath;

try {
    executablePath = resolveExecutablePath();
}
catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
}

const child = spawn(executablePath, process.argv.slice(2), {
    env: process.env,
    stdio: "inherit",
});

child.on("error", (error) => {
    console.error(error.message);
    process.exit(1);
});

child.on("exit", (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }

    process.exit(code ?? 1);
});
