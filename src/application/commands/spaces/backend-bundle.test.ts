import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import yauzl from "yauzl";
import { createTemporaryDirectory, expectCliUserError, useTemporaryDirectoryCleanup } from "../../../../__tests__/helpers.ts";
import { buildBackendBundle, findSpaceBackend } from "./backend-bundle.ts";
import { createRuntimeEnv } from "./embedded-runtime.ts";

const temporaryDirectories = useTemporaryDirectoryCleanup();
const worker = "import { greet } from './lib.ts';\nexport default { fetch: () => new Response(greet()) };\n";
const lib = "export const greet = (): string => 'hello from lib';\n";

describe("spaces backend discovery", () => {
    test("finds the entry, the schema and the manifest of a backend", async () => {
        const root = await createProject({
            "backend/backend.json": "{}",
            "backend/index.ts": worker,
            "backend/schema.ts": "export default { tables: {} };",
        });

        expect(await findSpaceBackend(root)).toEqual({
            entry: join(root, "backend", "index.ts"),
            manifest: join(root, "backend", "backend.json"),
            schema: join(root, "backend", "schema.ts"),
        });
    });

    test("takes a JavaScript entry and treats the schema and the manifest as optional", async () => {
        const root = await createProject({ "backend/index.mjs": "export default {};" });

        expect(await findSpaceBackend(root)).toEqual({
            entry: join(root, "backend", "index.mjs"),
            manifest: null,
            schema: null,
        });
    });

    test("has no backend without an entry module", async () => {
        expect(await findSpaceBackend(await createProject({ "backend/schema.ts": "" }))).toBeNull();
        expect(await findSpaceBackend(await createProject({ "package.json": "{}" }))).toBeNull();
    });
});

describe("spaces backend bundling", () => {
    test("bundles the entry into one module and packs it with the evaluated schema and the manifest", async () => {
        const root = await createProject({
            "backend/backend.json": "{ \"publicPaths\": [\"/api/hooks\"] }",
            "backend/index.ts": worker,
            "backend/lib.ts": lib,
            // Output of the schema module must not end up in the schema.
            "backend/schema.ts": "console.log('loading the schema');\nexport default { tables: { notes: { columns: { title: { type: 'text' } } } } };\n",
        });
        const { output, written } = createOutput();
        const bundle = await buildBackendBundle({
            env: createEnv(root),
            output,
            projectRoot: root,
            runtimeExecPath: process.execPath,
            source: (await findSpaceBackend(root))!,
        });
        const entries = await readZipEntries(bundle.zip);

        expect(Object.keys(entries).sort()).toEqual(["backend.json", "index.js", "schema.json"]);
        expect(entries["index.js"]).toContain("hello from lib");
        expect(entries["index.js"]).not.toContain("./lib.ts");
        expect(Buffer.byteLength(entries["index.js"]!)).toBe(bundle.moduleBytes);
        expect(JSON.parse(entries["schema.json"]!)).toEqual({ tables: { notes: { columns: { title: { type: "text" } } } } });
        expect(JSON.parse(entries["backend.json"]!)).toEqual({ publicPaths: ["/api/hooks"] });
        expect(written()).toContain("loading the schema");
    });

    test("deploys a backend without a schema module as one without tables", async () => {
        const root = await createProject({ "backend/index.js": "export default { fetch: () => new Response('ok') };" });
        const bundle = await buildBackendBundle({
            env: createEnv(root),
            output: createOutput().output,
            projectRoot: root,
            runtimeExecPath: process.execPath,
            source: (await findSpaceBackend(root))!,
        });
        const entries = await readZipEntries(bundle.zip);

        expect(Object.keys(entries).sort()).toEqual(["index.js", "schema.json"]);
        expect(JSON.parse(entries["schema.json"]!)).toEqual({ tables: {} });
    });

    test("keeps the environment of the host out of the module, apart from a fixed NODE_ENV", async () => {
        const root = await createProject({
            ".env": "FROM_ENV_FILE=value-of-the-env-file\n",
            "backend/index.ts": [
                "export default {",
                "    fetch: () => new Response([process.env.API_TOKEN, process.env.FROM_ENV_FILE, process.env.NODE_ENV].join('|')),",
                "};",
            ].join("\n"),
        });
        const bundle = await buildBackendBundle({
            env: { ...createEnv(root), API_TOKEN: "value-of-the-host", NODE_ENV: "development" },
            output: createOutput().output,
            projectRoot: root,
            runtimeExecPath: process.execPath,
            source: (await findSpaceBackend(root))!,
        });
        const module = (await readZipEntries(bundle.zip))["index.js"]!;

        expect(module).not.toContain("value-of-the-host");
        expect(module).not.toContain("value-of-the-env-file");
        expect(module).toContain("process.env.API_TOKEN");
        expect(module).toContain("\"production\"");
        expect(module).not.toContain("development");
    });

    test("reports a backend that does not bundle, with the bundler output", async () => {
        const root = await createProject({ "backend/index.ts": "import { missing } from './nowhere.ts';\nexport default missing;\n" });
        const { output, written } = createOutput();
        const error = await expectCliUserError(buildBackendBundle({
            env: createEnv(root),
            output,
            projectRoot: root,
            runtimeExecPath: process.execPath,
            source: (await findSpaceBackend(root))!,
        }));

        expect(error.key).toBe("errors.spaces.backendBundleFailed");
        expect(written()).toContain("nowhere");
    });

    test("refuses a build that emits anything besides the one module", async () => {
        const root = await createProject({
            "backend/index.ts": "import logo from './logo.png';\nexport default { fetch: () => new Response(logo) };\n",
            "backend/logo.png": "not really a png",
        });
        const error = await expectCliUserError(buildBackendBundle({
            env: createEnv(root),
            output: createOutput().output,
            projectRoot: root,
            runtimeExecPath: process.execPath,
            source: (await findSpaceBackend(root))!,
        }));

        expect(error.key).toBe("errors.spaces.backendBundleFiles");
        expect(String(error.params?.files)).toContain(".png");
    });

    test("reports a schema module that fails to load or exports something else", async () => {
        const cases = [
            "throw new Error('schema exploded');",
            "export default ['not', 'a', 'schema'];",
            "export const tables = {};",
        ];

        for (const schema of cases) {
            const root = await createProject({ "backend/index.js": "export default {};", "backend/schema.ts": schema });
            const error = await expectCliUserError(buildBackendBundle({
                env: createEnv(root),
                output: createOutput().output,
                projectRoot: root,
                runtimeExecPath: process.execPath,
                source: (await findSpaceBackend(root))!,
            }));

            expect(error.key).toBe("errors.spaces.schemaReadFailed");
            expect(error.params?.path).toBe(join(root, "backend", "schema.ts"));
        }
    });
});

function createEnv(root: string): Record<string, string> {
    return createRuntimeEnv({ base: process.env, projectRoot: root, shimDir: join(root, "no-shims") });
}

function createOutput(): { output: { write: (chunk: string) => boolean }; written: () => string } {
    const chunks: string[] = [];

    return {
        output: {
            write: (chunk) => {
                chunks.push(chunk);

                return true;
            },
        },
        written: () => chunks.join(""),
    };
}

async function createProject(files: Record<string, string>): Promise<string> {
    const root = await createTemporaryDirectory("oo-spaces-backend");

    temporaryDirectories.track(root);

    for (const [path, content] of Object.entries(files)) {
        const target = join(root, path);

        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
    }

    return root;
}

async function readZipEntries(zip: Uint8Array): Promise<Record<string, string>> {
    return await new Promise<Record<string, string>>((resolve, reject) => {
        yauzl.fromBuffer(Buffer.from(zip), { lazyEntries: true }, (error, file) => {
            if (error !== null) {
                reject(error);
                return;
            }

            const entries: Record<string, string> = {};

            file.on("entry", (entry: yauzl.Entry) => {
                file.openReadStream(entry, (streamError, stream) => {
                    if (streamError !== null) {
                        reject(streamError);
                        return;
                    }

                    const chunks: Buffer[] = [];

                    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
                    stream.on("end", () => {
                        entries[entry.fileName] = Buffer.concat(chunks).toString("utf8");
                        file.readEntry();
                    });
                });
            });
            file.on("end", () => resolve(entries));
            file.readEntry();
        });
    });
}
