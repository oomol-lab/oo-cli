import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const workerDirectoryPath = import.meta.dir;
const repositoryRootPath = join(workerDirectoryPath, "..", "..", "..");
const workflowPath = join(repositoryRootPath, ".github", "workflows", "deploy-install-worker.yaml");
const wranglerConfigPath = join(workerDirectoryPath, "wrangler.jsonc");
const indexHtmlPath = join(repositoryRootPath, "contrib", "install", "index.html");

describe("install worker deployment", () => {
    test("deploys the install assets through the expected worker endpoints", async () => {
        const wranglerConfig = await readFile(wranglerConfigPath, "utf8");

        expect(wranglerConfig).toContain("\"name\": \"oo-cli\"");
        expect(wranglerConfig).toContain("\"workers_dev\": true");
        expect(wranglerConfig).toContain("\"directory\": \"../../../dist/install-worker-assets\"");
        expect(wranglerConfig).toContain("\"pattern\": \"cli.oomol.com\"");
        expect(wranglerConfig).toContain("\"custom_domain\": true");
    });

    test("defines a reusable workflow with manual deployment support", async () => {
        const workflow = await readFile(workflowPath, "utf8");

        expect(workflow).toContain("workflow_call:");
        expect(workflow).toContain("workflow_dispatch:");
        expect(workflow).toContain("tag:");
        expect(workflow).toContain("Git tag whose install scripts should be published.");
        expect(workflow).not.toContain("deployment_url:");
        expect(workflow).not.toContain("custom_domain_url:");
        expect(workflow).not.toContain("worker_name:");
        expect(workflow).not.toContain("Set deployment metadata");
        expect(workflow).toContain("deploy-install-worker-");
        expect(workflow).toContain("format('tag-{0}', inputs.tag)");
        expect(workflow).toContain("ref: ${{ inputs.tag != ''");
        expect(workflow).toContain("format('refs/tags/{0}', inputs.tag)");
        expect(workflow).toContain("|| github.sha }}");
        expect(workflow).toContain("Prepare install worker assets");
        expect(workflow).toContain("asset_directory=\"dist/install-worker-assets\"");
        expect(workflow).toContain("cp contrib/install/index.html");
        expect(workflow).toContain("cp contrib/install/install.cmd");
        expect(workflow).toContain("cp contrib/install/install-guide.md");
        expect(workflow).toContain("cp contrib/install/install.ps1");
        expect(workflow).toContain("cp contrib/install/install.sh");
        expect(workflow).toContain("uses: cloudflare/wrangler-action@v4");
        expect(workflow).toContain("workingDirectory: contrib/cloudflare/oo-cli");
        expect(workflow).toContain("command: deploy");
    });

    test("serves a landing page that redirects to the OOMOL CLI site", async () => {
        const indexHtml = await readFile(indexHtmlPath, "utf8");

        expect(indexHtml).toContain("http-equiv=\"refresh\"");
        expect(indexHtml).toContain("content=\"0; url=https://oomol.com/cli/\"");
        expect(indexHtml).toContain("window.location.replace(\"https://oomol.com/cli/\")");
        expect(indexHtml).toContain("<a href=\"https://oomol.com/cli/\">https://oomol.com/cli/</a>");
    });
});
