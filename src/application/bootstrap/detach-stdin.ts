import { closeSync, openSync } from "node:fs";
import process from "node:process";

// Subcommands that genuinely consume fd 0 for interactive input. Everything
// else is treated as non-interactive and has its fd 0 / fd 2 pointed at
// /dev/null so Bun's exit-time `tcsetattr` cannot disturb the shared
// terminal when the caller has piped us into another process. Keep this set
// tight: adding an entry here gives up the downstream-pager fix for that
// subcommand.
const interactiveCommandNames: ReadonlySet<string> = new Set([
    "skills",
]);

export interface DetachTtyProbe {
    readonly argv: readonly string[];
    readonly platform: NodeJS.Platform;
    readonly stderrIsTTY: boolean;
    readonly stdoutIsTTY: boolean;
}

// The Bun runtime `tcgetattr` both fd 0 and fd 2 at startup whenever either
// is a TTY, then `tcsetattr` them back at exit. When our stdout is a pipe
// (e.g. `oo X --json | fx`) that exit-time tcsetattr can fire after the
// downstream process has switched the real terminal to raw mode, wiping out
// its keyboard handling. Since termios is per-device, writing back "cooked"
// via *any* fd on the /dev/pts/* device clobbers the raw mode. We can't stop
// the syscall, but we can point fd 0 and fd 2 at /dev/null so Bun's restore
// hits a non-terminal descriptor and fails with ENOTTY.
export function shouldDetachTtyFds(probe: DetachTtyProbe): boolean {
    if (probe.platform === "win32") {
        return false;
    }

    // Nothing to protect: either stream being a real TTY means the user is
    // running oo interactively at the terminal, not piping its output.
    if (probe.stdoutIsTTY && probe.stderrIsTTY) {
        return false;
    }

    // If stdout is a TTY but stderr is not, the pipe is on stderr (unusual)
    // and we leave the mitigation off to avoid surprises.
    if (probe.stdoutIsTTY) {
        return false;
    }

    const firstArg = probe.argv[0];

    if (firstArg !== undefined && interactiveCommandNames.has(firstArg)) {
        return false;
    }

    return true;
}

export interface DetachFdIo {
    openDevNullFd: () => number;
    dup2: (srcFd: number, dstFd: number) => number;
    closeFd: (fd: number) => void;
}

// Atomically reassign `targetFd` to /dev/null. We must NOT use `closeSync` +
// `openSync` to take the lowest-free-fd: Bun guards fds 0/1/2 at the JS
// layer, so `closeSync(0)` and `closeSync(2)` are silently no-ops and the
// follow-up open lands on fd 3+. Using `dup2` goes straight to libc and
// atomically reassigns the target fd regardless of Bun's guards.
export function detachFdToDevNull(io: DetachFdIo, targetFd: number): void {
    let srcFd: number | undefined;
    try {
        srcFd = io.openDevNullFd();
        io.dup2(srcFd, targetFd);
    }
    catch {
        // Intentionally swallowed: the mitigation is best-effort.
    }
    finally {
        if (srcFd !== undefined && srcFd !== targetFd) {
            try {
                io.closeFd(srcFd);
            }
            catch {
                // Intentionally swallowed.
            }
        }
    }
}

// Resolves a libc `dup2` implementation appropriate for the current
// platform. Returns `undefined` when none can be found, which causes the
// mitigation to no-op rather than crash.
type Dup2 = (srcFd: number, dstFd: number) => number;

async function loadLibcDup2(platform: NodeJS.Platform): Promise<Dup2 | undefined> {
    if (platform === "win32") {
        return undefined;
    }

    const candidateLibraryNames = platform === "darwin"
        ? ["libSystem.B.dylib", "libc.dylib"]
        : ["libc.so.6", "libc.so"];

    const { dlopen, FFIType } = await import("bun:ffi");

    for (const name of candidateLibraryNames) {
        try {
            const lib = dlopen(name, {
                dup2: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
            });
            return (src, dst) => Number(lib.symbols.dup2(src, dst));
        }
        catch {
            // Try the next candidate.
        }
    }

    return undefined;
}

export async function detachNonInteractiveTtyFdsFromProcess(): Promise<void> {
    const probe: DetachTtyProbe = {
        argv: process.argv.slice(2),
        platform: process.platform,
        stderrIsTTY: process.stderr.isTTY === true,
        stdoutIsTTY: process.stdout.isTTY === true,
    };

    if (!shouldDetachTtyFds(probe)) {
        return;
    }

    const dup2 = await loadLibcDup2(probe.platform);

    if (dup2 === undefined) {
        return;
    }

    const io: DetachFdIo = {
        openDevNullFd: () => openSync("/dev/null", "r"),
        dup2,
        closeFd: closeSync,
    };

    // fd 0: detach immediately. Nothing reads stdin for non-interactive
    // commands, so pointing it at /dev/null up front has no downside.
    detachFdToDevNull(io, 0);

    // fd 2: detach at the last possible moment so CLI errors keep reaching
    // the real terminal during normal execution. Node/Bun run `exit` event
    // listeners right before runtime cleanup, so our dup2 happens just
    // before Bun's exit-time `tcsetattr(2, ...)`, causing it to land on
    // /dev/null (ENOTTY) instead of the shared /dev/pts device.
    process.on("exit", () => {
        detachFdToDevNull(io, 2);
    });
}
