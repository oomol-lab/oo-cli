#!/usr/bin/env node

const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const process = require("node:process");

const installContextFileName = "install-context.json";

if (require.main === module) {
    try {
        writeInstallContextFile();
    }
    catch {}
}

function writeInstallContextFile(options = {}) {
    const baseDirectory = options.baseDirectory ?? __dirname;
    const env = options.env ?? process.env;
    const packageManager = detectPackageManager(env);

    if (!packageManager) {
        return false;
    }

    mkdirSync(baseDirectory, { recursive: true });
    writeFileSync(
        join(baseDirectory, installContextFileName),
        `${JSON.stringify({ packageManager }, null, 2)}\n`,
        "utf8",
    );

    return true;
}

function detectPackageManager(env = process.env) {
    return parsePackageManagerToken(env.npm_config_user_agent)
        ?? detectPackageManagerFromExecPath(env.npm_execpath);
}

function parsePackageManagerToken(rawValue) {
    if (typeof rawValue !== "string" || rawValue.trim() === "") {
        return undefined;
    }

    const trimmedValue = rawValue.trim();
    const firstTokenSeparatorIndex = trimmedValue.indexOf(" ");
    const firstToken = firstTokenSeparatorIndex >= 0
        ? trimmedValue.slice(0, firstTokenSeparatorIndex)
        : trimmedValue;
    const versionSeparatorIndex = firstToken.indexOf("/");
    const packageManager = versionSeparatorIndex >= 0
        ? firstToken.slice(0, versionSeparatorIndex)
        : firstToken;

    return normalizePackageManagerName(packageManager);
}

function detectPackageManagerFromExecPath(rawValue) {
    if (typeof rawValue !== "string" || rawValue.trim() === "") {
        return undefined;
    }

    const normalizedValue = rawValue.trim().toLowerCase();

    if (normalizedValue.includes("pnpm")) {
        return "pnpm";
    }

    if (normalizedValue.includes("yarn")) {
        return "yarn";
    }

    if (normalizedValue.includes("bun")) {
        return "bun";
    }

    if (normalizedValue.includes("npm")) {
        return "npm";
    }

    return undefined;
}

function normalizePackageManagerName(value) {
    switch (String(value).trim().toLowerCase()) {
        case "npm":
        case "pnpm":
        case "bun":
        case "yarn":
            return String(value).trim().toLowerCase();
        default:
            return undefined;
    }
}

module.exports = {
    detectPackageManager,
    normalizePackageManagerName,
    parsePackageManagerToken,
    writeInstallContextFile,
};
