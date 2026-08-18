import type { Fetcher } from "../contracts/cli.ts";
import type { OpenFlowCommandRelease } from "./flow-release.ts";

import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, test } from "bun:test";
import { requireAbortSignal } from "../../../__tests__/helpers.ts";
import {
    installOpenFlowCommandRelease,
    resolveOpenFlowCommandCacheRoot,
} from "./flow-artifact.ts";
import { openFlowCommandRelease } from "./flow-release.ts";

const temporaryDirectories = new Set<string>();
const textEncoder = new TextEncoder();

afterEach(async () => {
    await Promise.all(Array.from(temporaryDirectories, path =>
        rm(path, { force: true, recursive: true })));
    temporaryDirectories.clear();
});

describe("Open Flow command artifact", () => {
    test("pins an immutable Open Flow command archive", () => {
        const { archive, openFlowVersion } = openFlowCommandRelease;

        expect(archive.length).toBeGreaterThan(0);
        expect(archive.url).toBe(
            `https://static.oomol.com/release/apps/open-flow/command/open-flow-${openFlowVersion}-${archive.digest}.tar.gz`,
        );
    });

    test("reports one verified archive download and reuses its cache offline", async () => {
        const fixture = createCommandReleaseFixture();
        const environment = await createTestEnvironment();
        const progress: number[] = [];
        let requestCount = 0;
        const fetcher = createArchiveFetcher(fixture.archive, () => {
            requestCount += 1;
        });
        const options = {
            env: environment.env,
            execPath: process.execPath,
            fetcher,
            onDownloadProgress: (downloadedBytes: number) => {
                progress.push(downloadedBytes);
            },
        };

        const commandDirectory = await installOpenFlowCommandRelease(
            fixture.release,
            options,
        );
        const cachedDirectory = await installOpenFlowCommandRelease(
            fixture.release,
            options,
        );

        expect(cachedDirectory).toBe(commandDirectory);
        expect(requestCount).toBe(1);
        expect(progress).toEqual([0, fixture.archive.byteLength]);
        expect(await readFile(join(commandDirectory, "entry.js"), "utf8"))
            .toBe(fixture.entrySource);
    });

    test("removes a corrupt cache entry and downloads the pinned archive again", async () => {
        const fixture = createCommandReleaseFixture();
        const environment = await createTestEnvironment();
        let requestCount = 0;
        const fetcher = createArchiveFetcher(fixture.archive, () => {
            requestCount += 1;
        });
        const options = {
            env: environment.env,
            execPath: process.execPath,
            fetcher,
        };
        const commandDirectory = await installOpenFlowCommandRelease(
            fixture.release,
            options,
        );
        await writeFile(join(commandDirectory, "entry.js"), "corrupt\n");

        const repairedDirectory = await installOpenFlowCommandRelease(
            fixture.release,
            options,
        );

        expect(repairedDirectory).toBe(commandDirectory);
        expect(requestCount).toBe(2);
        expect(await readFile(join(commandDirectory, "entry.js"), "utf8"))
            .toBe(fixture.entrySource);
    });

    test("rejects archive bytes that do not match the pinned digest", async () => {
        const fixture = createCommandReleaseFixture();
        const environment = await createTestEnvironment();
        const digest = "0".repeat(64);
        const release = {
            ...fixture.release,
            archive: {
                ...fixture.release.archive,
                digest,
                url: `https://static.example.test/open-flow-${fixture.release.openFlowVersion}-${digest}.tar.gz`,
            },
        } satisfies OpenFlowCommandRelease;

        await expect(installOpenFlowCommandRelease(release, {
            env: environment.env,
            execPath: process.execPath,
            fetcher: createArchiveFetcher(fixture.archive),
        })).rejects.toThrow("digest does not match its release record");
    });

    test("rejects links before writing any command artifact files", async () => {
        const archive = encodeTarGzip([{
            body: new Uint8Array(),
            mode: 0o644,
            path: "open-flow-command/entry.js",
            type: "2",
        }]);
        const release = createRelease(archive);
        const environment = await createTestEnvironment();

        await expect(installOpenFlowCommandRelease(release, {
            env: environment.env,
            execPath: process.execPath,
            fetcher: createArchiveFetcher(archive),
        })).rejects.toThrow("link, directory, device, metadata, or other non-file");
    });

    for (const path of [
        "open-flow-command/../escape.js",
        "open-flow-command//escape.js",
    ]) {
        test(`rejects unsafe tar path ${JSON.stringify(path)}`, async () => {
            const archive = encodeTarGzip([{
                body: new Uint8Array(),
                mode: 0o644,
                path,
                type: "0",
            }]);
            const release = createRelease(archive);
            const environment = await createTestEnvironment();

            await expect(installOpenFlowCommandRelease(release, {
                env: environment.env,
                execPath: process.execPath,
                fetcher: createArchiveFetcher(archive),
            })).rejects.toThrow("invalid file path");
        });
    }

    test("aborts timed out archive downloads and removes temporary files", async () => {
        const fixture = createCommandReleaseFixture();
        const environment = await createTestEnvironment();
        const requestStarted = Promise.withResolvers<AbortSignal>();
        const timeoutScheduled = Promise.withResolvers<{
            advanceBy: (milliseconds: number) => void;
            isCancelled: () => boolean;
        }>();

        const installation = installOpenFlowCommandRelease(fixture.release, {
            env: environment.env,
            execPath: process.execPath,
            fetcher: (_input, init) => {
                const signal = requireAbortSignal(init);
                requestStarted.resolve(signal);

                return new Promise<Response>((_resolve, reject) => {
                    signal.addEventListener("abort", () => {
                        reject(signal.reason);
                    }, { once: true });
                });
            },
            scheduleDownloadTimeout: (onTimeout, timeoutMs) => {
                let elapsedMilliseconds = 0;
                let isCancelled = false;

                timeoutScheduled.resolve({
                    advanceBy: (milliseconds) => {
                        elapsedMilliseconds += milliseconds;

                        if (!isCancelled && elapsedMilliseconds >= timeoutMs) {
                            onTimeout();
                        }
                    },
                    isCancelled: () => isCancelled,
                });

                return () => {
                    isCancelled = true;
                };
            },
        });
        const [signal, fakeTimer] = await Promise.all([
            requestStarted.promise,
            timeoutScheduled.promise,
        ]);

        fakeTimer.advanceBy(299_999);
        expect(signal.aborted).toBe(false);

        fakeTimer.advanceBy(1);

        await expect(installation).rejects.toBe(signal.reason);
        expect(signal.aborted).toBe(true);
        expect(fakeTimer.isCancelled()).toBe(true);

        const cacheRoot = resolveOpenFlowCommandCacheRoot({
            env: environment.env,
            platform: process.platform,
        });
        const temporaryEntries = (await readdir(cacheRoot, { recursive: true }))
            .filter(entry =>
                entry.startsWith(".archive-")
                || entry.startsWith(".extract-")
                || entry.endsWith(".lock"));

        expect(temporaryEntries).toEqual([]);
    });

    test("accepts a valid archive from a different gzip compressor level", async () => {
        const fixture = createCommandReleaseFixture(0);
        const environment = await createTestEnvironment();

        const commandDirectory = await installOpenFlowCommandRelease(
            fixture.release,
            {
                env: environment.env,
                execPath: process.execPath,
                fetcher: createArchiveFetcher(fixture.archive),
            },
        );

        expect(await readFile(join(commandDirectory, "entry.js"), "utf8"))
            .toBe(fixture.entrySource);
    });

    test("serializes concurrent installation of the same digest", async () => {
        const fixture = createCommandReleaseFixture();
        const environment = await createTestEnvironment();
        const requestStarted = Promise.withResolvers<void>();
        const resumeRequest = Promise.withResolvers<void>();
        let requestCount = 0;
        const fetcher: Fetcher = async () => {
            requestCount += 1;
            requestStarted.resolve();
            await resumeRequest.promise;
            return new Response(fixture.archive, {
                headers: {
                    "content-length": String(fixture.archive.byteLength),
                },
            });
        };
        const options = {
            env: environment.env,
            execPath: process.execPath,
            fetcher,
        };
        const first = installOpenFlowCommandRelease(fixture.release, options);
        await requestStarted.promise;
        const second = installOpenFlowCommandRelease(fixture.release, options);
        await Bun.sleep(150);

        expect(requestCount).toBe(1);
        resumeRequest.resolve();

        const directories = await Promise.all([first, second]);

        expect(directories[0]).toBe(directories[1]);
        expect(requestCount).toBe(1);
    });
});

function createCommandReleaseFixture(compressionLevel = 9): {
    archive: Uint8Array;
    entrySource: string;
    release: OpenFlowCommandRelease;
} {
    const entrySource = [
        "export const commandArtifactVersion = 2;",
        `export const requiredBunVersion = ${JSON.stringify(Bun.version)};`,
        "export async function runOpenFlowCommand() { return 0; }",
        "",
    ].join("\n");
    const payload = [
        { body: textEncoder.encode("Open Flow license\n"), path: "LICENSE" },
        { body: textEncoder.encode(entrySource), path: "entry.js" },
    ].toSorted((left, right) => left.path < right.path ? -1 : 1);
    const files = payload.map(file => ({
        digest: sha256(file.body),
        length: file.body.byteLength,
        path: file.path,
    }));
    const manifest = `${JSON.stringify({
        bunVersion: Bun.version,
        entry: "entry.js",
        files,
        format: "open-flow-command-artifact",
        openFlowVersion: "1.2.3-test",
        version: 2,
    })}\n`;
    const archiveEntries = [
        {
            body: textEncoder.encode(manifest),
            mode: 0o644,
            path: "open-flow-command/command-artifact.json",
            type: "0" as const,
        },
        ...payload.map(file => ({
            ...file,
            mode: file.path === "entry.js" ? 0o755 : 0o644,
            path: `open-flow-command/${file.path}`,
            type: "0" as const,
        })),
    ].toSorted((left, right) => left.path < right.path ? -1 : 1);
    const archive = encodeTarGzip(archiveEntries, compressionLevel);

    return {
        archive,
        entrySource,
        release: createRelease(archive),
    };
}

function createRelease(archive: Uint8Array): OpenFlowCommandRelease {
    const digest = sha256(archive);
    const openFlowVersion = "1.2.3-test";

    return {
        archive: {
            digest,
            length: archive.byteLength,
            url: `https://static.example.test/open-flow-${openFlowVersion}-${digest}.tar.gz`,
        },
        bunVersion: Bun.version,
        format: "open-flow-command-release",
        openFlowVersion,
        version: 1,
    };
}

function createArchiveFetcher(
    archive: Uint8Array,
    onRequest: (init: RequestInit | undefined) => void = () => {},
): Fetcher {
    return (_input, init) => {
        onRequest(init);
        return Promise.resolve(new Response(archive, {
            headers: {
                "content-length": String(archive.byteLength),
            },
        }));
    };
}

async function createTestEnvironment(): Promise<{
    env: Record<string, string | undefined>;
}> {
    const root = await mkdtemp(join(tmpdir(), "oo-flow-artifact-"));
    temporaryDirectories.add(root);

    return {
        env: {
            HOME: join(root, "home"),
            LOCALAPPDATA: join(root, "local-app-data"),
            USERPROFILE: join(root, "home"),
            XDG_CACHE_HOME: join(root, "cache"),
        },
    };
}

function encodeTarGzip(entries: readonly {
    body: Uint8Array;
    mode: number;
    path: string;
    type: "0" | "2";
}[], compressionLevel = 9): Uint8Array {
    const chunks: Uint8Array[] = [];

    for (const entry of entries) {
        const header = new Uint8Array(512);
        writeTarText(header, 0, 100, entry.path);
        writeTarOctal(header, 100, 8, entry.mode);
        writeTarOctal(header, 108, 8, 0);
        writeTarOctal(header, 116, 8, 0);
        writeTarOctal(header, 124, 12, entry.body.byteLength);
        writeTarOctal(header, 136, 12, 0);
        header.fill(0x20, 148, 156);
        header[156] = entry.type.charCodeAt(0);
        header.set(textEncoder.encode("ustar\0"), 257);
        header.set(textEncoder.encode("00"), 263);
        const checksum = header.reduce((sum, byte) => sum + byte, 0);
        writeTarChecksum(header, checksum);
        chunks.push(header, entry.body);

        const padding = (512 - entry.body.byteLength % 512) % 512;

        if (padding > 0) {
            chunks.push(new Uint8Array(padding));
        }
    }

    chunks.push(new Uint8Array(1024));
    const tar = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.byteLength, 0));
    let offset = 0;

    for (const chunk of chunks) {
        tar.set(chunk, offset);
        offset += chunk.byteLength;
    }

    const archive = new Uint8Array(gzipSync(tar, { level: compressionLevel }));
    archive[3] = 0;
    archive[4] = 0;
    archive[5] = 0;
    archive[6] = 0;
    archive[7] = 0;
    archive[8] = 2;
    archive[9] = 255;
    return archive;
}

function writeTarText(
    header: Uint8Array,
    offset: number,
    length: number,
    value: string,
): void {
    const bytes = textEncoder.encode(value);

    if (bytes.byteLength >= length) {
        throw new TypeError(`Tar fixture path is too long: ${value}`);
    }

    header.set(bytes, offset);
}

function writeTarOctal(
    header: Uint8Array,
    offset: number,
    length: number,
    value: number,
): void {
    const source = value.toString(8).padStart(length - 1, "0");
    header.set(textEncoder.encode(source), offset);
    header[offset + length - 1] = 0;
}

function writeTarChecksum(header: Uint8Array, value: number): void {
    const source = value.toString(8).padStart(6, "0");
    header.set(textEncoder.encode(source), 148);
    header[154] = 0;
    header[155] = 0x20;
}

function sha256(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}
