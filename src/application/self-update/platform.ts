import { existsSync } from "node:fs";

export type LinuxLibcKind = "glibc" | "musl";

export function resolveSelfUpdateReleasePlatform(options: {
    arch: string;
    linuxLibc?: LinuxLibcKind;
    platform: NodeJS.Platform;
    rosettaTranslated?: boolean;
}): string {
    switch (options.platform) {
        case "darwin":
            return resolveDarwinReleasePlatform(
                options.arch,
                options.rosettaTranslated,
            );
        case "linux":
            return resolveLinuxReleasePlatform(
                options.arch,
                options.linuxLibc,
            );
        case "win32":
            return resolveWindowsReleasePlatform(options.arch);
        default:
            throw new Error(
                `Unsupported platform for self-update: ${options.platform}/${options.arch}`,
            );
    }
}

export async function detectSelfUpdateReleasePlatform(options: {
    arch: string;
    platform: NodeJS.Platform;
}): Promise<string> {
    return resolveSelfUpdateReleasePlatform({
        arch: options.arch,
        linuxLibc: options.platform === "linux"
            ? detectLinuxLibcKind()
            : undefined,
        platform: options.platform,
        rosettaTranslated: options.platform === "darwin"
            ? isRosettaTranslated()
            : undefined,
    });
}

function resolveDarwinReleasePlatform(
    arch: string,
    rosettaTranslated: boolean | undefined,
): string {
    if (arch === "arm64") {
        return "darwin-arm64";
    }

    if (arch === "x64") {
        return rosettaTranslated ? "darwin-arm64" : "darwin-x64";
    }

    throw new Error(`Unsupported darwin architecture for self-update: ${arch}`);
}

function resolveLinuxReleasePlatform(
    arch: string,
    linuxLibc: LinuxLibcKind | undefined,
): string {
    if (arch !== "arm64" && arch !== "x64") {
        throw new Error(`Unsupported linux architecture for self-update: ${arch}`);
    }

    return linuxLibc === "musl"
        ? `linux-${arch}-musl`
        : `linux-${arch}`;
}

function resolveWindowsReleasePlatform(arch: string): string {
    if (arch === "arm64") {
        return "win32-arm64";
    }

    if (arch === "x64") {
        return "win32-x64";
    }

    throw new Error(`Unsupported windows architecture for self-update: ${arch}`);
}

function isRosettaTranslated(): boolean {
    try {
        const result = Bun.spawnSync(
            [
                "sysctl",
                "-n",
                "sysctl.proc_translated",
            ],
            {
                stderr: "pipe",
                stdin: "ignore",
                stdout: "pipe",
            },
        );

        return result.exitCode === 0
            && decodeSpawnOutput(result.stdout).trim() === "1";
    }
    catch {
        return false;
    }
}

function detectLinuxLibcKind(): LinuxLibcKind {
    if (
        existsSync("/lib/libc.musl-x86_64.so.1")
        || existsSync("/lib/libc.musl-aarch64.so.1")
    ) {
        return "musl";
    }

    try {
        const result = Bun.spawnSync(
            [
                "ldd",
                "/bin/ls",
            ],
            {
                stderr: "pipe",
                stdin: "ignore",
                stdout: "pipe",
            },
        );
        const output = [
            decodeSpawnOutput(result.stdout),
            decodeSpawnOutput(result.stderr),
        ].join("\n");

        return output.includes("musl") ? "musl" : "glibc";
    }
    catch {
        return "glibc";
    }
}

function decodeSpawnOutput(output: Uint8Array): string {
    return new TextDecoder().decode(output);
}
