import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function writeReleaseBundleBinaryFixture(
    stagingDirectoryPath: string,
    targetId: string,
    executableFileName: string,
): Promise<void> {
    const outputPath = join(
        stagingDirectoryPath,
        targetId,
        "bin",
        executableFileName,
    );

    await mkdir(join(stagingDirectoryPath, targetId, "bin"), {
        recursive: true,
    });
    await writeFile(outputPath, `${targetId}\n`);
}
