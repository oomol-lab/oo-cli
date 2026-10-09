import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "agentic-markdown";

const targetDirectoryPath = join(import.meta.dir, "shared", "oo", "references");
await mkdir(targetDirectoryPath, { recursive: true });
await Promise.all(["flow-authoring.md", "flow-n8n-conversion.md"].map(async (fileName) => {
    const sourcePath = fileURLToPath(import.meta.resolve(
        `@oomol-lab/open-flow/skills/open-flow/references/${fileName}`,
    ));
    const content = await readFile(sourcePath, "utf8");
    await writeFile(join(targetDirectoryPath, fileName), render(content, { flowCommand: "oo flow" }));
}));
