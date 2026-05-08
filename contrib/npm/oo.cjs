#!/usr/bin/env node

const { spawn } = require("node:child_process");
const process = require("node:process");

const { resolveExecutablePath } = require("./platform-runtime.cjs");

if (require.main === module) {
    run();
}

function run(options = {}) {
    const runtime = options.runtime ?? process;
    const spawnProcess = options.spawn ?? spawn;
    const resolvePath = options.resolveExecutablePath ?? resolveExecutablePath;
    const writeError = options.writeError ?? (message => console.error(message));
    let executablePath;

    try {
        executablePath = resolvePath();
    }
    catch (error) {
        writeError(formatErrorMessage(error));
        runtime.exit(1);
        return;
    }

    const child = spawnProcess(executablePath, runtime.argv.slice(2), {
        stdio: "inherit",
    });

    child.on("error", (error) => {
        writeError(formatErrorMessage(error));
        runtime.exit(1);
    });

    child.on("exit", (code, signal) => {
        if (signal) {
            runtime.kill(runtime.pid, signal);
            return;
        }

        runtime.exit(code ?? 1);
    });
}

function formatErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

module.exports = {
    run,
};
