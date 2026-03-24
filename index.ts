#!/usr/bin/env bun

import process from "node:process";

import { runCli } from "./src/application/bootstrap/run-cli.ts";

const exitCode = await runCli(process.argv.slice(2));

if (exitCode !== 0) {
    process.exit(exitCode);
}
