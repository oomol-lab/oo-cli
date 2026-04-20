import { appendFile } from "node:fs/promises";
import process from "node:process";

export async function writeGitHubOutputText(formattedOutput: string): Promise<void> {
    const githubOutputPath = process.env.GITHUB_OUTPUT;

    if (githubOutputPath === undefined || githubOutputPath === "") {
        process.stdout.write(formattedOutput);
        return;
    }

    await appendFile(githubOutputPath, formattedOutput, "utf8");
}
