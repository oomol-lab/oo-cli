import { Buffer } from "node:buffer";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import yauzl from "yauzl";
import {
    createTemporaryDirectory,
    expectCliUserError,
    useTemporaryDirectoryCleanup,
} from "../../../../__tests__/helpers.ts";
import { collectSiteFiles, packDirectory, readZipFile } from "./pack.ts";

const temporaryDirectories = useTemporaryDirectoryCleanup();

describe("spaces site packing", () => {
    test("collects files with forward-slash paths and skips junk", async () => {
        const files = await collectSiteFiles(await createSite());

        expect(files.map(file => file.relative)).toEqual(["assets/app.js", "assets/nested/x.css", "index.html"]);
    });

    test("produces a zip the service's reader can list", async () => {
        const { fileCount, zip } = await packDirectory(await createSite());

        expect(fileCount).toBe(3);
        expect(await listZipEntries(zip)).toEqual(["assets/app.js", "assets/nested/x.css", "index.html"]);
    });

    test("requires index.html at the root", async () => {
        const dir = await createSite();
        const nested = join(dir, "assets");
        const error = await expectCliUserError(collectSiteFiles(nested));

        expect(error.key).toBe("errors.spaces.indexHtmlMissing");
        expect(error.exitCode).toBe(1);
    });

    test("refuses a missing directory as a usage error", async () => {
        const error = await expectCliUserError(collectSiteFiles(join(await createSite(), "nope")));

        expect(error.key).toBe("errors.spaces.dirNotFound");
        expect(error.exitCode).toBe(2);
    });

    test.skipIf(process.platform === "win32")("refuses symbolic links as a usage error", async () => {
        const dir = await createSite();

        await symlink(join(dir, "index.html"), join(dir, "link.html"));

        const error = await expectCliUserError(collectSiteFiles(dir));

        expect(error.key).toBe("errors.spaces.symlinkNotSupported");
        expect(error.exitCode).toBe(2);
    });

    test("reads an existing zip and rejects other files", async () => {
        const dir = await createSite();
        const { zip } = await packDirectory(dir);
        const zipPath = join(dir, "site.zip");

        await writeFile(zipPath, zip);

        expect((await readZipFile(zipPath)).byteLength).toBe(zip.byteLength);
        expect((await expectCliUserError(readZipFile(join(dir, "index.html")))).key).toBe("errors.spaces.notAZip");

        const missing = await expectCliUserError(readZipFile(join(dir, "missing.zip")));

        expect(missing.key).toBe("errors.spaces.zipNotFound");
        expect(missing.exitCode).toBe(2);
    });
});

async function createSite(): Promise<string> {
    const dir = await createTemporaryDirectory("oo-spaces-site");

    temporaryDirectories.track(dir);
    await mkdir(join(dir, "assets", "nested"), { recursive: true });
    await mkdir(join(dir, ".git"));
    await Promise.all([
        writeFile(join(dir, "index.html"), "<h1>hi</h1>"),
        writeFile(join(dir, "assets", "app.js"), "console.log(1)"),
        writeFile(join(dir, "assets", "nested", "x.css"), "a{}"),
        writeFile(join(dir, ".DS_Store"), "junk"),
        writeFile(join(dir, ".git", "HEAD"), "ref"),
    ]);

    return dir;
}

async function listZipEntries(zip: Uint8Array): Promise<string[]> {
    return await new Promise<string[]>((resolve, reject) => {
        yauzl.fromBuffer(Buffer.from(zip), { lazyEntries: true }, (error, file) => {
            if (error !== null) {
                reject(error);
                return;
            }

            const names: string[] = [];

            file.on("entry", (entry: yauzl.Entry) => {
                names.push(entry.fileName);
                file.readEntry();
            });
            file.on("end", () => resolve(names));
            file.readEntry();
        });
    });
}
