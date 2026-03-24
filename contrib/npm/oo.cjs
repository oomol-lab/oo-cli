#!/usr/bin/env node

const { spawn } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const process = require("node:process");

const { resolveExecutablePath } = require("./platform-runtime.cjs");

const installContextFilePath = join(__dirname, "install-context.json");

if (require.main === module) {
    run();
}

function run() {
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
        env: resolveChildEnvironment(),
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
}

function resolveChildEnvironment(env = process.env) {
    if (env.OO_INSTALL_PACKAGE_MANAGER) {
        return env;
    }

    const installContext = readInstallContext();

    if (!installContext) {
        return env;
    }

    return {
        ...env,
        OO_INSTALL_PACKAGE_MANAGER: installContext.packageManager,
    };
}

function readInstallContext() {
    try {
        const parsedContent = JSON.parse(
            readFileSync(installContextFilePath, "utf8"),
        );

        if (
            parsedContent
            && typeof parsedContent === "object"
            && "packageManager" in parsedContent
            && isSupportedPackageManager(parsedContent.packageManager)
        ) {
            return {
                packageManager: parsedContent.packageManager,
            };
        }
    }
    catch {}

    return undefined;
}

function isSupportedPackageManager(value) {
    return value === "npm"
        || value === "pnpm"
        || value === "bun"
        || value === "yarn";
}

module.exports = {
    readInstallContext,
    resolveChildEnvironment,
    run,
};
