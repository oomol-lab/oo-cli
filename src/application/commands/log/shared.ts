import type { CliExecutionContext } from "../../contracts/cli.ts";
import process from "node:process";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";

export function resolveCliLogDirectoryPath(
    context: CliExecutionContext,
): string {
    return resolveStorePaths({
        appName: APP_NAME,
        env: context.env,
        platform: process.platform,
    }).logDirectoryPath;
}

export function writeLine(context: CliExecutionContext, message: string): void {
    context.stdout.write(`${message}\n`);
}
