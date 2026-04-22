#!/usr/bin/env bun

import process from "node:process";
import { detachNonInteractiveTtyFdsFromProcess } from "./src/application/bootstrap/detach-stdin.ts";

// Point fd 0 and fd 2 at /dev/null for non-interactive piping scenarios so
// Bun's exit-time `tcsetattr(0)` and `tcsetattr(2)` land on /dev/null
// (ENOTTY) instead of mutating the shared `/dev/pts/*` device a downstream
// pager (fx, fzf, less) is actively using.
await detachNonInteractiveTtyFdsFromProcess();

const { runCli } = await import("./src/application/bootstrap/run-cli.ts");

const exitCode = await runCli(process.argv.slice(2));

if (exitCode !== 0) {
    process.exit(exitCode);
}
