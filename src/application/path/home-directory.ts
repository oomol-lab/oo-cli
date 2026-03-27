import { homedir } from "node:os";
import { join } from "node:path";

export function resolveHomeDirectory(
    env: Record<string, string | undefined>,
    explicitHomeDirectory?: string,
): string {
    return explicitHomeDirectory
        ?? env.HOME
        ?? env.USERPROFILE
        ?? homedir();
}

export function expandHomeDirectoryPath(
    value: string,
    env: Record<string, string | undefined>,
    explicitHomeDirectory?: string,
): string {
    if (value === "~") {
        return resolveHomeDirectory(env, explicitHomeDirectory);
    }

    if (!value.startsWith("~/") && !value.startsWith("~\\")) {
        return value;
    }

    return join(
        resolveHomeDirectory(env, explicitHomeDirectory),
        value.slice(2),
    );
}
