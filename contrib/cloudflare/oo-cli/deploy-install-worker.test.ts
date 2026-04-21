import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const workerDirectoryPath = import.meta.dir;
const workflowPath = join(workerDirectoryPath, "..", "..", "..", ".github", "workflows", "deploy-install-worker.yaml");
const wranglerConfigPath = join(workerDirectoryPath, "wrangler.jsonc");

describe("install worker deployment", () => {
    test("deploys the install scripts through the expected worker endpoints", async () => {
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
        expect(workflow).toContain("cp contrib/install/install.cmd");
        expect(workflow).toContain("cp contrib/install/install.ps1");
        expect(workflow).toContain("cp contrib/install/install.sh");
        expect(workflow).toContain("uses: cloudflare/wrangler-action@v3");
        expect(workflow).toContain("workingDirectory: contrib/cloudflare/oo-cli");
        expect(workflow).toContain("command: deploy");
    });
});
