const process = require("node:process");

const loadedPlatformTargets = require("./platform-targets.json");

const platformTargets = Array.isArray(loadedPlatformTargets)
    ? loadedPlatformTargets
    : loadedPlatformTargets.default;

if (!Array.isArray(platformTargets)) {
    throw new TypeError("Failed to load platform target metadata.");
}

function detectLinuxLibc(runtime = process) {
    if (runtime.platform !== "linux") {
        return undefined;
    }

    const report = typeof runtime.report?.getReport === "function"
        ? runtime.report.getReport()
        : undefined;
    const header = report && typeof report === "object" ? report.header : undefined;

    if (
        header
        && typeof header.glibcVersionRuntime === "string"
        && header.glibcVersionRuntime !== ""
    ) {
        return "glibc";
    }

    return "musl";
}

function resolvePlatformTarget(runtime = process) {
    const libc = runtime.platform === "linux" ? detectLinuxLibc(runtime) : undefined;

    return platformTargets.find(target =>
        target.os === runtime.platform
        && target.cpu === runtime.arch
        && (target.libc ?? null) === (libc ?? null),
    );
}

function formatPlatform(runtime = process) {
    const parts = [runtime.platform, runtime.arch];

    if (runtime.platform === "linux") {
        parts.push(detectLinuxLibc(runtime) ?? "unknown-libc");
    }

    return parts.join(" ");
}

function resolveExecutablePath(loader = require, runtime = process) {
    const target = resolvePlatformTarget(runtime);

    if (!target) {
        throw new Error(
            `No prebuilt oo binary is available for ${formatPlatform(runtime)}.`,
        );
    }

    const specifier = `${target.packageName}/bin/${target.executableFileName}`;

    try {
        return loader.resolve(specifier);
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);

        throw new Error(
            [
                `Missing optional package ${target.packageName} for ${formatPlatform(runtime)}.`,
                "Reinstall @oomol-lab/oo-cli without --omit=optional or --no-optional.",
                `Resolution error: ${reason}`,
            ].join(" "),
        );
    }
}

module.exports = {
    detectLinuxLibc,
    platformTargets,
    resolveExecutablePath,
    resolvePlatformTarget,
};
