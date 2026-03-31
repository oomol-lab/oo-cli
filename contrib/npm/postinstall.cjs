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
    const pathSegments = splitPathSegments(rawValue);
    const fileName = pathSegments.at(-1) ?? "";

    if (
        pathSegments.includes("pnpm")
        || fileName === "pnpm"
        || fileName === "pnpm.cjs"
        || fileName === "pnpm.js"
        || fileName === "pnpm.exe"
    ) {
        return "pnpm";
    }

    if (
        pathSegments.includes("yarn")
        || fileName === "yarn"
        || fileName === "yarn.js"
        || fileName === "yarn.cjs"
        || fileName === "yarn.exe"
    ) {
        return "yarn";
    }

    if (
        pathSegments.includes(".bun")
        || fileName === "bun"
        || fileName === "bun.exe"
    ) {
        return "bun";
    }

    if (
        pathSegments.includes("npm")
        || fileName === "npm"
        || fileName === "npm.js"
        || fileName === "npm.cjs"
        || fileName === "npm-cli.js"
        || fileName === "npm.exe"
    ) {
        return "npm";
    }

    return undefined;
}

function splitPathSegments(rawValue) {
    if (typeof rawValue !== "string" || rawValue.trim() === "") {
        return [];
    }

    return rawValue
        .trim()
        .replaceAll("\\", "/")
        .split("/")
        .map(segment => segment.trim().toLowerCase())
        .filter(Boolean);
}

function normalizePackageManagerName(value) {
    const normalized = String(value).trim().toLowerCase();
    switch (normalized) {
        case "npm":
        case "pnpm":
        case "bun":
        case "yarn":
            return normalized;
        default:
            return undefined;
    }
}

module.exports = {
    detectPackageManager,
    detectPackageManagerFromExecPath,
    normalizePackageManagerName,
    parsePackageManagerToken,
    splitPathSegments,
    writeInstallContextFile,
};
