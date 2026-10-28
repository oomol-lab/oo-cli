import type { SelfUpdateRuntime } from "./core.ts";
import process from "node:process";
import { pathExists } from "../shared/fs-utils.ts";
import { cleanupWindowsExecutableBackups } from "./fs-cleanup.ts";
import { acquireActiveVersionMarker } from "./lock.ts";
import {
    resolveActiveVersionMarkerPath,
    resolveSelfUpdatePaths,
    resolveSelfUpdateVersionDirectoryPath,
    resolveSelfUpdateVersionExecutablePath,
} from "./paths.ts";

// Every invocation creates the marker, so this module stays separate from the
// self-update engine and keeps startup from loading it.
export interface CurrentVersionActiveMarkerResource {
    close: () => Promise<void>;
}

export async function initializeCurrentVersionActiveMarker(options: {
    currentVersion: string;
    runtime: Pick<SelfUpdateRuntime, "env" | "execPath" | "logger" | "now" | "platform" | "processId">;
}): Promise<CurrentVersionActiveMarkerResource | undefined> {
    const paths = resolveSelfUpdatePaths({
        env: options.runtime.env,
        platform: options.runtime.platform,
    });
    const currentVersionPath = resolveSelfUpdateVersionExecutablePath(
        paths,
        options.currentVersion,
    );
    const legacyCurrentVersionPath = resolveSelfUpdateVersionDirectoryPath(
        paths,
        options.currentVersion,
    );

    if (options.runtime.platform === "win32") {
        await cleanupWindowsExecutableBackups(paths, options.runtime.logger);
    }

    if (
        !(await pathExists(currentVersionPath))
        && !(await pathExists(legacyCurrentVersionPath))
    ) {
        return undefined;
    }

    try {
        const markerId = Bun.randomUUIDv7();
        const markerHandle = await acquireActiveVersionMarker({
            execPath: options.runtime.execPath,
            markerFilePath: resolveActiveVersionMarkerPath(
                paths,
                options.currentVersion,
                options.runtime.processId,
                markerId,
            ),
            markerId,
            now: options.runtime.now,
            processId: options.runtime.processId,
            version: options.currentVersion,
        });

        if (!markerHandle) {
            options.runtime.logger.warn(
                {
                    currentVersion: options.currentVersion,
                },
                "Current CLI version active marker could not be created; continuing without lifecycle marker.",
            );
            return undefined;
        }

        const closeOnExit = () => {
            markerHandle.closeSync();
        };

        process.once("exit", closeOnExit);

        return {
            close: async () => {
                process.off("exit", closeOnExit);
                await markerHandle.close();
            },
        };
    }
    catch (error) {
        options.runtime.logger.warn(
            {
                currentVersion: options.currentVersion,
                err: error,
            },
            "Current CLI version active marker creation failed; continuing without lifecycle marker.",
        );
        return undefined;
    }
}
