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

function resolveChildEnvironment(
    env = process.env,
    options = {},
) {
    if (env.OO_INSTALL_PACKAGE_MANAGER) {
        return env;
    }

    const installContext = readInstallContext(
        options.installContextFilePath ?? installContextFilePath,
    );
    const packageManager = installContext?.packageManager
        ?? detectPackageManagerFromOoPath(
            options.ooPathCandidates
            ?? [
                env._,
                process.argv[1],
                __filename,
            ],
        )
        ?? "npm";

    return {
        ...env,
        OO_INSTALL_PACKAGE_MANAGER: packageManager,
    };
}

function readInstallContext(filePath = installContextFilePath) {
    try {
        const parsedContent = JSON.parse(
            readFileSync(filePath, "utf8"),
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

function detectPackageManagerFromOoPath(paths) {
    for (const rawPath of paths) {
        const pathSegments = splitPathSegments(rawPath);

        if (pathSegments.includes(".bun")) {
            return "bun";
        }

        if (pathSegments.includes("pnpm")) {
            return "pnpm";
        }

        if (pathSegments.includes("fnm_multishells")) {
            return "npm";
        }
    }

    return undefined;
}

function splitPathSegments(rawPath) {
    if (typeof rawPath !== "string" || rawPath.trim() === "") {
        return [];
    }

    return rawPath
        .trim()
        .replaceAll("\\", "/")
        .split("/")
        .map(segment => segment.trim().toLowerCase())
        .filter(Boolean);
}

function isSupportedPackageManager(value) {
    return value === "npm"
        || value === "pnpm"
        || value === "bun"
        || value === "yarn";
}

module.exports = {
    detectPackageManagerFromOoPath,
    readInstallContext,
    resolveChildEnvironment,
    run,
    splitPathSegments,
};
