import type { Writer } from "../../contracts/cli.ts";

import { Buffer } from "node:buffer";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { ZipFile } from "yazl";
import { CliUserError } from "../../contracts/cli.ts";
import { isPathMissingError } from "../../shared/fs-errors.ts";
import { formatFileSize } from "../shared/file-size.ts";
import { describeExit, runProcess } from "./embedded-runtime.ts";

// The backend of a space the platform hosts itself: `backend/index.ts` is a
// Worker module (`export default { fetch }`), `backend/schema.ts` declares the
// tables. A deploy sends them as a zip of one bundled ES module (`index.js`),
// the schema as data (`schema.json`) and, when the project has one, the
// `backend.json` that lists the paths reachable without signing in.

const backendDirName = "backend";
const entryFileNames = ["index.ts", "index.tsx", "index.js", "index.mjs"] as const;
const schemaFileNames = ["schema.ts", "schema.js", "schema.mjs"] as const;
const manifestFileName = "backend.json";
const moduleName = "index.js";
const emptySchema = JSON.stringify({ tables: {} });
// The service's own limits, so an oversized backend is refused before the upload.
const maxZipBytes = 16 * 1024 * 1024;
const maxSchemaBytes = 512 * 1024;
const workDirPrefix = "oo-spaces-backend-";

export interface SpaceBackendSource {
    entry: string;
    /** `backend/backend.json`, sent along unchanged. */
    manifest: string | null;
    /** `null` deploys a backend without tables. */
    schema: string | null;
}

async function isFile(path: string): Promise<boolean> {
    const info = await stat(path).catch((error: unknown) => {
        if (isPathMissingError(error)) {
            return undefined;
        }

        throw error;
    });

    return info?.isFile() === true;
}

async function firstFile(directory: string, names: readonly string[]): Promise<string | null> {
    for (const name of names) {
        const path = join(directory, name);

        if (await isFile(path)) {
            return path;
        }
    }

    return null;
}

/** The platform-hosted backend of a project, or `null` when it has no `backend/index.*`. */
export async function findSpaceBackend(root: string): Promise<SpaceBackendSource | null> {
    const directory = join(root, backendDirName);
    const entry = await firstFile(directory, entryFileNames);

    if (entry === null) {
        return null;
    }

    const manifest = join(directory, manifestFileName);

    return {
        entry,
        manifest: await isFile(manifest) ? manifest : null,
        schema: await firstFile(directory, schemaFileNames),
    };
}

// Evaluates the schema module and writes its default export to a file. The
// result does not travel over stdout: whatever the module prints while it
// loads would end up in it.
const schemaReaderSource = `import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const [source, target] = process.argv.slice(2);
const loaded = await import(pathToFileURL(source).href);
const schema = loaded.default;

if (schema === null || typeof schema !== "object" || Array.isArray(schema)
    || schema.tables === null || typeof schema.tables !== "object" || Array.isArray(schema.tables)) {
    console.error("The schema module must default-export defineSchema({ tables: { ... } }).");
    process.exit(3);
}

writeFileSync(target, JSON.stringify(schema));
`;

async function listFiles(root: string): Promise<string[]> {
    const names: string[] = [];
    const walk = async (current: string): Promise<void> => {
        for (const entry of await readdir(current, { withFileTypes: true })) {
            const absolute = join(current, entry.name);

            if (entry.isDirectory()) {
                await walk(absolute);
            }
            else {
                names.push(relative(root, absolute).split(sep).join("/"));
            }
        }
    };

    await walk(root);

    return names.sort();
}

async function zipFiles(files: ReadonlyArray<{ content: Uint8Array; name: string }>): Promise<Uint8Array> {
    return await new Promise<Uint8Array>((resolve, reject) => {
        const archive = new ZipFile();
        const chunks: Buffer[] = [];

        archive.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
        archive.outputStream.on("error", reject);
        archive.outputStream.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));

        for (const file of files) {
            archive.addBuffer(Buffer.from(file.content), file.name, { mode: 0o644 });
        }

        archive.end();
    });
}

export interface BackendBundle {
    /** Size of the bundled module before compression. */
    moduleBytes: number;
    zip: Uint8Array;
}

// Bundles the backend with the embedded runtime and packs the deploy zip.
// The module is built for a Worker: no Node built-ins, the `workerd` and
// `worker` export conditions of packages preferred. A build that emits
// anything besides the one module (a `.wasm` file, an asset) is refused,
// since the service only takes JavaScript modules.
export async function buildBackendBundle(options: {
    env: Record<string, string>;
    /** Receives the output of the bundler and of the schema module. */
    output: Writer;
    projectRoot: string;
    runtimeExecPath: string;
    source: SpaceBackendSource;
}): Promise<BackendBundle> {
    const { source } = options;
    const run = { cwd: options.projectRoot, env: options.env, output: options.output };
    const workDir = await mkdtemp(join(tmpdir(), workDirPrefix));

    try {
        const outDir = join(workDir, "modules");
        const built = await runProcess(options.runtimeExecPath, [
            "build",
            source.entry,
            "--target=browser",
            "--format=esm",
            "--conditions=workerd",
            "--conditions=worker",
            `--entry-naming=${moduleName}`,
            "--outdir",
            outDir,
        ], run);

        if (built.exitCode !== 0) {
            throw new CliUserError("errors.spaces.backendBundleFailed", 1, { exit: describeExit(built) });
        }

        const emitted = await listFiles(outDir);
        const extra = emitted.filter(name => name !== moduleName);

        if (!emitted.includes(moduleName) || extra.length > 0) {
            throw new CliUserError("errors.spaces.backendBundleFiles", 1, {
                files: extra.length > 0 ? extra.join(", ") : "-",
            });
        }

        const module = new Uint8Array(await readFile(join(outDir, moduleName)));
        const files = [
            { content: module, name: moduleName },
            { content: await readSchema(source.schema, workDir, options), name: "schema.json" },
        ];

        if (source.manifest !== null) {
            files.push({ content: new Uint8Array(await readFile(source.manifest)), name: manifestFileName });
        }

        const zip = await zipFiles(files);

        if (zip.byteLength > maxZipBytes) {
            throw new CliUserError("errors.spaces.backendTooLarge", 1, {
                max: formatFileSize(maxZipBytes),
                size: formatFileSize(zip.byteLength),
            });
        }

        return { moduleBytes: module.byteLength, zip };
    }
    finally {
        await rm(workDir, { force: true, recursive: true }).catch(() => {});
    }
}

async function readSchema(
    schemaPath: string | null,
    workDir: string,
    options: { env: Record<string, string>; output: Writer; projectRoot: string; runtimeExecPath: string },
): Promise<Uint8Array> {
    if (schemaPath === null) {
        return new TextEncoder().encode(emptySchema);
    }

    const reader = join(workDir, "read-schema.mjs");
    const target = join(workDir, "schema.json");

    await writeFile(reader, schemaReaderSource);

    const evaluated = await runProcess(options.runtimeExecPath, [reader, schemaPath, target], {
        cwd: options.projectRoot,
        env: options.env,
        output: options.output,
    });

    if (evaluated.exitCode !== 0) {
        throw new CliUserError("errors.spaces.schemaReadFailed", 1, {
            exit: describeExit(evaluated),
            path: schemaPath,
        });
    }

    const schema = new Uint8Array(await readFile(target));

    if (schema.byteLength > maxSchemaBytes) {
        throw new CliUserError("errors.spaces.backendTooLarge", 1, {
            max: formatFileSize(maxSchemaBytes),
            size: formatFileSize(schema.byteLength),
        });
    }

    return schema;
}
