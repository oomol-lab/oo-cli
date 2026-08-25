import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    availableBundledSkillAgentNames,
    availableBundledSkillNames,
    getBundledSkillFiles,
    materializeBundledSkillToDirectory,
    readBundledSkillFileContent,
} from "./embedded-assets.ts";

describe("embedded skill assets", () => {
    test("keeps the bundled skill file registry aligned with the bundled skill names", () => {
        expect(availableBundledSkillNames).toEqual([
            "oo",
            "oo-find-skills",
            "oo-create-skill",
            "oo-publish-skill",
        ]);
        expect(getBundledSkillFiles("oo", "universal").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/flow-authoring.md",
            "references/flow-n8n-conversion.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(getBundledSkillFiles("oo", "claude").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/flow-authoring.md",
            "references/flow-n8n-conversion.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(getBundledSkillFiles("oo", "hermes").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/flow-authoring.md",
            "references/flow-n8n-conversion.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(getBundledSkillFiles("oo", "codebuddy").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/flow-authoring.md",
            "references/flow-n8n-conversion.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(getBundledSkillFiles("oo", "workbuddy").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/flow-authoring.md",
            "references/flow-n8n-conversion.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(getBundledSkillFiles("oo", "trae").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/flow-authoring.md",
            "references/flow-n8n-conversion.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(getBundledSkillFiles("oo", "trae-cn").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/flow-authoring.md",
            "references/flow-n8n-conversion.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(getBundledSkillFiles("oo", "openclaw").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/flow-authoring.md",
            "references/flow-n8n-conversion.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(getBundledSkillFiles("oo", "qoderwork").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/flow-authoring.md",
            "references/flow-n8n-conversion.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(getBundledSkillFiles("oo", "deepseek-tui").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/flow-authoring.md",
            "references/flow-n8n-conversion.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "universal").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "claude").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "hermes").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "codebuddy").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "workbuddy").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "trae").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "trae-cn").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "openclaw").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "qoderwork").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "deepseek-tui").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/oo-cli-contract.md",
        ]);
        for (const agentName of availableBundledSkillAgentNames) {
            expect(
                getBundledSkillFiles("oo-create-skill", agentName).map(
                    file => file.relativePath,
                ),
            ).toEqual([
                "SKILL.md",
                posix.join("agents", "openai.yaml"),
                posix.join("references", "skill-authoring.md"),
                posix.join("references", "existing-workflow.md"),
                posix.join("references", "oo-powered.md"),
            ]);
        }
        expect(
            getBundledSkillFiles("oo-publish-skill", "universal").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "claude").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "hermes").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "codebuddy").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "workbuddy").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "trae").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "trae-cn").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "openclaw").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "qoderwork").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "deepseek-tui").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
        ]);
    });

    test("maps bundled skills to the shared source directory", () => {
        expect([...availableBundledSkillAgentNames]).toEqual([
            "universal",
            "claude",
            "hermes",
            "codebuddy",
            "workbuddy",
            "trae",
            "trae-cn",
            "openclaw",
            "qoderwork",
            "deepseek-tui",
        ]);

        for (const skillName of availableBundledSkillNames) {
            for (const agentName of availableBundledSkillAgentNames) {
                const sourceDirectory = `contrib/skills/shared/${skillName}`;
                const skillFiles = getBundledSkillFiles(skillName, agentName);

                expect(skillFiles.every(file => file.agentName === agentName)).toBeTrue();
                expect(
                    skillFiles.every(file =>
                        normalizePathForAssertion(file.sourcePath).includes(
                            `/${sourceDirectory}/`,
                        ),
                    ),
                ).toBeTrue();
            }
        }
    });

    test("guides oo search selection toward low-friction and high-quality candidates", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const searchGuide = getBundledSkillFiles("oo", agentName).find(
                file => file.relativePath === "references/search-and-selection.md",
            );

            if (searchGuide === undefined) {
                throw new Error(`Missing ${agentName} oo search-and-selection guide`);
            }

            const content = normalizeMarkdownWrappingForAssertion(
                await readBundledSkillFileContent(searchGuide),
            );

            expect(content).toContain("Scan all connector entries");
            expect(content).toContain("do not let array order");
            expect(content).toContain("out-of-box");
            expect(content).toContain("Setup cost");
            expect(content).toContain("Treat `fusion-api` as OOMOL-hosted Fusion API");
            expect(content).toContain("already authenticated non-Fusion connector");
            expect(content).toContain("generic managed transforms");
            expect(content).toContain("prefer a matching `fusion-api` action by default");
            expect(content).toContain("unauthenticated non-Fusion connector as higher setup cost");
            expect(content).toContain("Do not ask the user to connect it");
            expect(content).toContain("can complete the core task");
            expect(content).toContain("Use an authenticated non-Fusion connector when the user named a connected service");
            expect(content).toContain("external side effect");
            expect(content).toContain("Ask the user only when the choice changes");
            expect(content).toContain("run one connector refinement");
            expect(content).toContain("before reporting that no executable capability is available");
            expect(content).not.toContain("catalog signals only");
            expect(content).not.toContain("package-execution.md");
            expect(content).not.toContain("packageId");
            expect(content).not.toContain("uses `kind` as the");
            // Connector services are recorded for the wrap-up; the oo skill no
            // longer runs an `oo skills search` sidecar.
            expect(content).toContain("Record connectors for the wrap-up");
            expect(content).toContain("do not need `oo skills search`");
            expect(content).toContain("connector `service` values");
            expect(content).toContain("service `github` -> `oo-github`");
            expect(content).toContain("never assemble or guess package names yourself");
            expect(content).toContain("has produced a successful useful result");
            // Wrap-up batched recommendation flow.
            expect(content).toContain("Wrap-up skill recommendation");
            expect(content).toContain("oo skills recommend plan <connectorService>... --json");
            expect(content).toContain("oo skills add <installPackageName>...");
            expect(content).toContain("oo skills update <updatePackageName>...");
            expect(content).toContain("oo skills recommend mute <packageName>...");
            expect(content).toContain("oo skills recommend mute --all");
            expect(content).toContain("not published");
            expect(content).toContain("Never mention skipped packages");
            expect(content).toContain("Never invent package names");
            // The sidecar search and the legacy single-skill prompt are gone.
            expect(content).not.toContain("sidecar discovery branch");
            expect(content).not.toContain("Skill sidecar policy");
            expect(content).not.toContain("best credible installable skill match");
            expect(content).not.toContain("`1. Install <skillName> (<packageName>)`");
            expect(content).not.toContain("`2. Do not install`");
            expect(content).not.toContain("reply with `1` to install or `2` to skip");
            expect(content).not.toContain("use the `oo-find-skills` installation flow");
            expect(content).toContain("If the user did not name a model or product");
            expect(content).toContain("prefer more capable, modern, reputable candidates");
            expect(content).toContain("older or obscure equivalents");
            expect(content).not.toContain("Prefer a package when the user wants a managed transform");
        }
    });

    test("guides oo runtime to record packages and recommend skills at wrap-up", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const skillFile = getBundledSkillFiles("oo", agentName).find(
                file => file.relativePath === "SKILL.md",
            );

            if (skillFile === undefined) {
                throw new Error(`Missing ${agentName} oo SKILL.md`);
            }

            const content = normalizeMarkdownWrappingForAssertion(
                await readBundledSkillFileContent(skillFile),
            );

            expect(content).toContain("Record the `service` of each connector capability");
            expect(content).toContain("do not need `oo skills search`");
            expect(content).toContain("deduplicated wrap-up list of connector services");
            expect(content).toContain(
                "Do not install or ask about installation before the selected connector capability",
            );
            expect(content).toContain("After the final useful result");
            expect(content).toContain("oo skills recommend plan <connectorService>... --json");
            expect(content).toContain("say nothing about skills and finish");
            // The legacy single-skill numbered prompt is gone from SKILL.md.
            expect(content).not.toContain("After the first successful result");
            expect(content).not.toContain("Record credible installable skill matches");
            expect(content).not.toContain("`1. Install <skillName> (<packageName>)`");
            expect(content).not.toContain("`2. Do not install`");
            expect(content).not.toContain("Do not install unless the user explicitly agrees");
        }
    });

    test("routes persistent workflows through Flow-scoped authoring", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const skillFiles = getBundledSkillFiles("oo", agentName);
            const skillFile = skillFiles.find(file => file.relativePath === "SKILL.md");
            const flowGuide = skillFiles.find(
                file => file.relativePath === "references/flow-authoring.md",
            );

            if (skillFile === undefined || flowGuide === undefined) {
                throw new Error(`Missing ${agentName} oo Flow authoring guidance`);
            }

            const skillContent = normalizeMarkdownWrappingForAssertion(
                await readBundledSkillFileContent(skillFile),
            );
            const flowContent = normalizeMarkdownWrappingForAssertion(
                await readBundledSkillFileContent(flowGuide),
            );

            expect(skillContent).toContain("Open Flow mode");
            expect(skillContent).toContain("references/flow-authoring.md");
            expect(skillContent).toContain("replaces the connector operating state machine");
            expect(skillContent).toContain("services that were only added to a Flow");
            expect(flowContent).toContain("oo flow connector search <query>");
            expect(flowContent).toContain("Prefer one `oo flow apply`");
            expect(flowContent).toContain("Triggers are not `apply` Nodes");
            expect(flowContent).toContain("export default function run");
            expect(flowContent).toContain("the resulting Draft remains structurally invalid");
            expect(flowContent).toContain("Do neither unless the user explicitly requested");
            expect(flowContent).toContain("Never substitute `oo search`");
            expect(flowContent).toContain("array output to a string input");
            expect(flowContent).toContain("An empty schema `{}` is dynamic, not a conversion");
            expect(flowContent).toContain("`check.valid` is `false`");
            expect(flowContent).toContain("Do not retry the same request");
        }
    });

    test("guides local code toward oo LLM client config", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const skillFiles = getBundledSkillFiles("oo", agentName);
            const skillFile = skillFiles.find(file => file.relativePath === "SKILL.md");
            const llmGuide = skillFiles.find(
                file => file.relativePath === "references/llm-client.md",
            );

            if (skillFile === undefined || llmGuide === undefined) {
                throw new Error(`Missing ${agentName} oo LLM client guidance`);
            }

            const skillContent = normalizeMarkdownWrappingForAssertion(
                await readBundledSkillFileContent(skillFile),
            );
            const llmGuideContent = normalizeMarkdownWrappingForAssertion(
                await readBundledSkillFileContent(llmGuide),
            );

            expect(skillContent).toContain("LLM client config mode");
            expect(skillContent).toContain("local code");
            expect(skillContent).toContain("references/llm-client.md");
            expect(llmGuideContent).toContain("oo llm config --json");
            expect(llmGuideContent).toContain("OpenAI-compatible");
            expect(llmGuideContent).toContain("baseUrl");
            expect(llmGuideContent).toContain("apiKey");
            expect(llmGuideContent).toContain("oomol-chat");
            expect(llmGuideContent).toContain("Do not read `auth.toml` directly");
            expect(llmGuideContent).toContain("Do not hardcode");
        }
    });

    test("guides oo runtime to upload local files before remote payloads", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const skillFiles = getBundledSkillFiles("oo", agentName);
            const skillFile = skillFiles.find(file => file.relativePath === "SKILL.md");
            const fileTransferGuide = skillFiles.find(
                file => file.relativePath === "references/file-transfer.md",
            );

            if (skillFile === undefined) {
                throw new Error(`Missing ${agentName} oo SKILL.md`);
            }

            if (fileTransferGuide === undefined) {
                throw new Error(`Missing ${agentName} oo file-transfer guide`);
            }

            const skillContent = normalizeMarkdownWrappingForAssertion(
                await readBundledSkillFileContent(skillFile),
            );
            const fileTransferContent = normalizeMarkdownWrappingForAssertion(
                await readBundledSkillFileContent(fileTransferGuide),
            );

            expect(skillContent).toContain("Local `file://...` URIs");
            expect(skillContent).toContain("not cloud-accessible artifacts");
            expect(skillContent).toContain("`oo file upload \"<filePath>\" --json`");
            expect(skillContent).toContain("returned `downloadUrl`");
            expect(fileTransferContent).toContain("Local `file://...` URIs");
            expect(fileTransferContent).toContain("local filesystem references");
            expect(fileTransferContent).toContain("Do not submit local absolute paths");
            expect(fileTransferContent).toContain("remote payloads");
            expect(fileTransferContent).toContain("explicitly supports local paths");
            expect(fileTransferContent).toContain("fail when the remote action tries");
            expect(fileTransferContent).toContain("`oo file upload` did not return");

            expect(skillContent).not.toContain("cloud-task");
            expect(skillContent).not.toContain("task-lifecycle.md");
            expect(skillContent).not.toContain("package-execution.md");
            expect(fileTransferContent).not.toContain("cloud-task");
        }
    });

    test("routes oo-create-skill by runtime dependency and existing evidence", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const content = normalizeMarkdownWrappingForAssertion(
                await readRequiredBundledSkillContent(
                    "oo-create-skill",
                    agentName,
                    "SKILL.md",
                ),
            );

            expect(content).toContain("# oo Creator Skill");
            expect(content).toContain("A skill is **standard**");
            expect(content).toContain("A skill is **OO-powered**");
            expect(content).toContain("A skill has an **existing workflow**");
            expect(content).toContain("The references compose");
            expect(content).toContain("Do not run OO capability discovery for a standard skill");
            expect(content).toContain("Being managed by `oo` does not by itself");
            expect(content).toContain("Local scripts also do not imply");
            expect(content).toContain("Authoring-time use of `oo`");
            expect(content).toContain("explains or documents OO without executing it is standard");
            expect(content).toContain("directly or indirectly invokes `oo` is OO-powered");
            expect(content).toContain("including an optional path");
            expect(content).toContain("An obsolete OO call");
            expect(content).toContain("first inspect available files and context");
        }
    });

    test("provides composable shared, existing-workflow, and OO authoring guidance", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const authoringContent = normalizeMarkdownWrappingForAssertion(
                await readRequiredBundledSkillContent(
                    "oo-create-skill",
                    agentName,
                    "references/skill-authoring.md",
                ),
            );
            const existingContent = normalizeMarkdownWrappingForAssertion(
                await readRequiredBundledSkillContent(
                    "oo-create-skill",
                    agentName,
                    "references/existing-workflow.md",
                ),
            );
            const ooContent = normalizeMarkdownWrappingForAssertion(
                await readRequiredBundledSkillContent(
                    "oo-create-skill",
                    agentName,
                    "references/oo-powered.md",
                ),
            );

            expect(authoringContent).toContain("Understand Reusable Intent");
            expect(authoringContent).toContain("Plan Reusable Contents");
            expect(authoringContent).toContain("preferably verb-led lowercase hyphen-case name");
            expect(authoringContent).toContain("Namespace it by tool");
            expect(authoringContent).toContain(`oo skills preflight --agent ${agentName}`);
            expect(authoringContent).toContain(`oo skills init <name> --agent ${agentName}`);
            expect(authoringContent).toContain("remove the generated `compatibility:");
            expect(authoringContent).toContain("Keep OO management metadata separate");
            expect(authoringContent).toContain("under 500 lines when practical");
            expect(authoringContent).toContain("reference longer than 100 lines");
            expect(authoringContent).toContain("agents/openai.yaml");
            expect(authoringContent).toContain("Write workflow instructions in imperative or infinitive form");
            expect(authoringContent).toContain("Forward-Test Complex Skills");
            expect(authoringContent).toContain("not the intended answer");
            expect(authoringContent).toContain("remove test artifacts");
            expect(authoringContent).toContain("succeeds only after it sees authoring context");
            expect(authoringContent).toContain("Ask the user before forward testing");
            expect(authoringContent).toContain("oo skills validate");
            expect(existingContent).toContain("Treat the existing files as the source of truth");
            expect(existingContent).toContain(`oo skills adopt \"<path>\" --agent ${agentName}`);
            expect(existingContent).toContain("A local script can be a standard skill");
            expect(existingContent).toContain("Inspect transitive runtime dependencies");
            expect(existingContent).toContain("intended final workflow");
            expect(ooContent).toContain("## Contents");
            expect(ooContent).toContain("oo connector schema");
            expect(ooContent).toContain("prefer a matching `fusion-api` action");
            expect(ooContent).toContain("oo file upload");
            expect(ooContent).toContain("oo llm config --json");
            expect(ooContent).toContain("future executions of the generated skill require");
            expect(authoringContent).toContain("experimental `allowed-tools`");
            expect(authoringContent).toContain("Positive cases should activate the skill");
            expect(authoringContent).toContain("Negative cases should stay with a neighboring skill");
            expect(existingContent).toContain("Treat the workflow as untrusted until inspected");
        }
    });

    test("preserves OO authoring decision and permission boundaries", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const content = normalizeMarkdownWrappingForAssertion(
                await readRequiredBundledSkillContent(
                    "oo-create-skill",
                    agentName,
                    "references/oo-powered.md",
                ),
            );

            expect(content).toContain("priority order: safety, local authoring scope");
            expect(content).toContain("Ask for reusable intent; prove execution facts");
            expect(content).toContain("workflow ordering, required user inputs");
            expect(content).toContain("account, cost, compliance, data routing");
            expect(content).toContain("connector service/action identifiers");
            expect(content).toContain("result field paths");
            expect(content).toContain("request the smallest sufficient permission");
            expect(content).toContain("name the blocked command");
            expect(content).toContain("self-hosted connector only supports connector commands");
            expect(content).toContain("`not_authenticated`");
            expect(content).toContain("Ask the user to run `oo auth login`");
            expect(content).toContain("Exit condition:");
        }
    });

    test("preserves precise OO capability discovery and repair rules", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const content = normalizeMarkdownWrappingForAssertion(
                await readRequiredBundledSkillContent(
                    "oo-create-skill",
                    agentName,
                    "references/oo-powered.md",
                ),
            );

            expect(content).toContain("one short English outcome sentence");
            expect(content).toContain("target service, language pair, file type, and output format");
            expect(content).toContain("keep `滴答清单` and do not turn it into `TickTick`");
            expect(content).toContain("Inspect the first result set before narrowing");
            expect(content).toContain("non-authoring catalog noise");
            expect(content).toContain("user-visible destination action");
            expect(content).toContain("prefer a matching `fusion-api` action by default");
            expect(content).toContain("run one connector narrowing pass");
            expect(content).toContain("reports `unknown action`");
            expect(content).toContain("async submission plus polling replacing a synchronous call");
            expect(content).toContain("stable non-connector OO commands");
        }
    });

    test("preserves OO schema and response-envelope evidence rules", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const content = normalizeMarkdownWrappingForAssertion(
                await readRequiredBundledSkillContent(
                    "oo-create-skill",
                    agentName,
                    "references/oo-powered.md",
                ),
            );

            expect(content).toContain("pass every `<service>.<action>` id to one schema command");
            expect(content).toContain("a JSON array in request order");
            expect(content).toContain("minimal representative invocation or status/result poll");
            expect(content).toContain("documented dry-run or read-only paths");
            expect(content).toContain("full `oo connector run --json` response paths");
            expect(content).toContain("response.data.sessionId");
            expect(content).toContain("response.data.state");
            expect(content).toContain("response.data.data.image.url");
            expect(content).toContain("label it as untested");
            expect(content).toContain("prove every OO command or connector contract");
        }
    });

    test("preserves OO file-source, asynchronous, and artifact handling rules", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const content = normalizeMarkdownWrappingForAssertion(
                await readRequiredBundledSkillContent(
                    "oo-create-skill",
                    agentName,
                    "references/oo-powered.md",
                ),
            );

            expect(content).toContain("environment-exposed attachment paths");
            expect(content).toContain("chat-visible media with no readable CLI path");
            expect(content).toContain("recent-file fallback");
            expect(content).toContain("candidate hashes match");
            expect(content).toContain("`--data @payload.json`");
            expect(content).toContain("inline base64 or `data:` URI artifacts");
            expect(content).toContain("status values, bounded retry policy");
            expect(content).toContain("stops polling immediately");
            expect(content).toContain("use a non-conflicting name");
            expect(content).toContain("PNG alpha/RGBA check and dimensions check");
            expect(content).toContain("connector-native action that performs the final upload");
            expect(content).toContain("does not support `--json`");
        }
    });

    test("preserves the OO runtime acceptance contract", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const content = normalizeMarkdownWrappingForAssertion(
                await readRequiredBundledSkillContent(
                    "oo-create-skill",
                    agentName,
                    "references/oo-powered.md",
                ),
            );

            expect(content).toContain("compact execution runbook, not API documentation");
            expect(content).toContain("without rediscovery");
            expect(content).toContain("Source: how required runtime inputs are obtained");
            expect(content).toContain("Invoke: the exact selected service/action");
            expect(content).toContain("Result: the full CLI JSON path");
            expect(content).toContain("Async: terminal success, failure, timeout");
            expect(content).toContain("Artifact: destination, preview/handoff, and verification");
            expect(content).toContain("Failure: auth, billing, permission, schema");
            expect(content).toContain("If any answer is missing, add only the missing execution guidance");
            expect(content).toContain("oo skills validate \"<skill-directory>\"");
        }
    });

    test("guides oo-publish-skill agents to publish agent skills", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const skillFile = getBundledSkillFiles("oo-publish-skill", agentName).find(
                file => file.relativePath === "SKILL.md",
            );

            if (skillFile === undefined) {
                throw new Error(`Missing ${agentName} oo-publish-skill SKILL.md`);
            }

            const content = normalizeLineEndingsForAssertion(
                await readBundledSkillFileContent(skillFile),
            );

            expect(content).toContain("Publish, release, upload, or submit");
            expect(content).toContain("oo skills share");
            expect(content).toContain("oo --lang zh skills share <skill-id> -y");
            expect(content).toContain("oo --lang en skills share <skill-id> -y");
            expect(content).toContain("Share a published skill");
            expect(content).toContain("temporary shares for private packages");
            expect(content).toContain("Private package shares support optional limits");
            expect(content).toContain("`--days <days>` sets the share duration");
            expect(content).toContain("omitting `--downloads` leaves installs unlimited");
            expect(content).toContain("general install preparation");
            expect(content).toContain("guide before running the final install command");
            expect(content).toContain("general install preparation URL");
            expect(content).toContain("exact `oo skills install ...` command");
            expect(content).toContain("existing AI agent skill");
            expect(content).toContain("it does not need to be an oo-specific skill");
            expect(content).toContain("oo skills publish");
            expect(content).toContain("oo skills locate <skill-id>");
            expect(content).toContain("extra locate step");
            expect(content).toContain("first-time packages in non-interactive");
            expect(content).toContain("pass `--visibility private` or `--visibility public`");
            expect(content).toContain("Use `--visibility public`");
            expect(content).toContain("Use `--visibility private` only");
            expect(content).toContain("Existing packages can omit `--visibility`");
            expect(content).toContain("The publish command performs its own");
            expect(content).toContain("Do not ask whether to publish to the current account");
            expect(content).toContain("Do not package manually");
            expect(content).toContain("Report the published package name");
            expect(content).not.toContain("default private");
            expect(content).not.toContain("private visibility");
            expect(content).not.toContain("OOMOL/oo skill");
            expect(content).not.toContain("oo skills preflight");
            expect(content).not.toContain("oo skills publish <skill-id> --agent");
            expect(content).not.toContain("Use `--agent` only as a source hint");
        }
    });

    test("keeps removed oo skills install confirmation flags out of bundled skill docs", async () => {
        // `oo skills install` never exposes `-y`/`--yes`. Guard every rendered
        // bundled skill asset so agent-facing docs cannot drift back to the dead
        // syntax that makes agents confidently run a command that errors with
        // `Unknown option: -y`. The check is position-aware so prose that warns
        // against the flag (e.g. "Never append `-y` ... to `oo skills install`")
        // is not mistaken for a command that appends it.
        const forbiddenInstallFlags = [" -y", " --yes"];
        for (const skillName of availableBundledSkillNames) {
            for (const agentName of availableBundledSkillAgentNames) {
                for (const file of getBundledSkillFiles(skillName, agentName)) {
                    const content = normalizeLineEndingsForAssertion(
                        await readBundledSkillFileContent(file),
                    );
                    for (const line of content.split("\n")) {
                        const installIndex = line.indexOf("oo skills install");
                        if (installIndex === -1) {
                            continue;
                        }
                        for (const flag of forbiddenInstallFlags) {
                            expect(
                                line.indexOf(flag, installIndex),
                                `${skillName}/${agentName}/${file.relativePath} appends '${flag.trim()}' to 'oo skills install': ${line.trim()}`,
                            ).toBe(-1);
                        }
                    }
                }
            }
        }
    });

    test("renders bundled skill markdown for host-specific frontmatter", async () => {
        for (const skillName of availableBundledSkillNames) {
            const claudeSkillFile = getBundledSkillFiles(skillName, "claude")
                .find(file => file.relativePath === "SKILL.md");

            if (claudeSkillFile === undefined) {
                throw new Error(`Missing claude SKILL.md for ${skillName}`);
            }

            expect(await readBundledSkillFileContent(claudeSkillFile)).toContain(
                "allowed-tools: [Bash(oo *)]",
            );
        }

        for (const agentName of ["universal", "deepseek-tui", "qoderwork", "trae", "trae-cn", "workbuddy"] as const) {
            for (const skillName of availableBundledSkillNames) {
                const skillFile = getBundledSkillFiles(skillName, agentName)
                    .find(file => file.relativePath === "SKILL.md");

                if (skillFile === undefined) {
                    throw new Error(`Missing ${agentName} SKILL.md for ${skillName}`);
                }

                expect(await readBundledSkillFileContent(skillFile)).not.toContain(
                    "allowed-tools",
                );
            }
        }
    });

    test("renders bundled skill markdown for host-specific instructions", async () => {
        const universalOoSkillFile = getRequiredBundledSkillFile("oo", "universal", "SKILL.md");
        const claudeOoSkillFile = getRequiredBundledSkillFile("oo", "claude", "SKILL.md");
        const universalFindSkillFile = getRequiredBundledSkillFile("oo-find-skills", "universal", "SKILL.md");
        const claudeFindSkillFile = getRequiredBundledSkillFile("oo-find-skills", "claude", "SKILL.md");
        const openClawFindSkillFile = getRequiredBundledSkillFile("oo-find-skills", "openclaw", "SKILL.md");
        const openClawFindContractFile = getRequiredBundledSkillFile(
            "oo-find-skills",
            "openclaw",
            "references/oo-cli-contract.md",
        );
        const universalCreateSkillFile = getRequiredBundledSkillFile("oo-create-skill", "universal", "SKILL.md");
        const qoderWorkCreateSkillFile = getRequiredBundledSkillFile("oo-create-skill", "qoderwork", "SKILL.md");
        const qoderWorkPublishSkillFile = getRequiredBundledSkillFile("oo-publish-skill", "qoderwork", "SKILL.md");

        const universalOoContent = await readBundledSkillFileContent(universalOoSkillFile);
        const claudeOoContent = await readBundledSkillFileContent(claudeOoSkillFile);
        const universalFindContent = await readBundledSkillFileContent(universalFindSkillFile);
        const claudeFindContent = await readBundledSkillFileContent(claudeFindSkillFile);
        const openClawFindContent = await readBundledSkillFileContent(openClawFindSkillFile);
        const openClawFindContractContent = await readBundledSkillFileContent(openClawFindContractFile);
        const universalCreateContent = await readBundledSkillFileContent(universalCreateSkillFile);
        const qoderWorkCreateContent = await readBundledSkillFileContent(qoderWorkCreateSkillFile);
        const universalCreateAuthoringContent = await readRequiredBundledSkillContent(
            "oo-create-skill",
            "universal",
            "references/skill-authoring.md",
        );
        const qoderWorkCreateOoContent = await readRequiredBundledSkillContent(
            "oo-create-skill",
            "qoderwork",
            "references/oo-powered.md",
        );
        const qoderWorkPublishContent = await readBundledSkillFileContent(qoderWorkPublishSkillFile);

        // The runtime note is unconditional, so it renders for every host.
        expect(universalOoContent).toContain("## Runtime note");
        expect(claudeOoContent).toContain("## Runtime note");
        // The universal host has no skill-selection prompt tool, so it renders
        // neither the AskUserQuestion guidance nor the openclaw chat prompt.
        expect(universalFindContent).not.toContain("request_user_input");
        expect(universalFindContent).not.toContain("AskUserQuestion");
        expect(claudeFindContent).toContain("AskUserQuestion");
        expect(claudeFindContent).not.toContain("request_user_input");
        expect(openClawFindContent).toContain("Prefer asking the user with a short multiple-choice prompt");
        expect(openClawFindContent).not.toContain("AskUserQuestion");
        expect(openClawFindContractContent).not.toContain("skillSelectionPromptTool");
        expect(openClawFindContractContent).not.toContain("request_user_input");
        expect(openClawFindContractContent).not.toContain("AskUserQuestion");
        expect(universalCreateAuthoringContent).toContain("oo skills preflight --agent universal");
        expect(qoderWorkCreateOoContent).toContain("QoderWork permission and storage probe");
        expect(qoderWorkCreateOoContent).toContain("oo skills preflight --agent qoderwork");
        expect(universalCreateContent).toContain("references/skill-authoring.md");
        expect(qoderWorkCreateContent).toContain("references/oo-powered.md");
        expect(qoderWorkPublishContent).toContain("`qoderwork` with that host id");
        expect(qoderWorkPublishContent).not.toContain("agentic:");
    });

    test("renders bundled skill files without agentic directives", async () => {
        for (const skillName of availableBundledSkillNames) {
            for (const agentName of availableBundledSkillAgentNames) {
                for (const file of getBundledSkillFiles(skillName, agentName)) {
                    expect(await readBundledSkillFileContent(file)).not.toContain(
                        "agentic:",
                    );
                }
            }
        }
    });
});

describe("materializeBundledSkillToDirectory", () => {
    test("writes every bundled skill file into the target directory", async () => {
        const outputDirectory = await mkdtemp(join(tmpdir(), "oo-export-"));

        try {
            const targetSkillDirectoryPath = join(outputDirectory, "oo");
            const written = await materializeBundledSkillToDirectory({
                agentName: "universal",
                skillName: "oo",
                targetSkillDirectoryPath,
            });

            expect([...written]).toEqual(
                getBundledSkillFiles("oo", "universal").map(file => file.relativePath),
            );

            for (const relativePath of written) {
                expect(
                    await pathExists(join(targetSkillDirectoryPath, relativePath)),
                ).toBeTrue();
            }
        }
        finally {
            await rm(outputDirectory, { force: true, recursive: true });
        }
    });

    test("renders the skill for the requested agent format", async () => {
        const outputDirectory = await mkdtemp(join(tmpdir(), "oo-export-"));

        try {
            await materializeBundledSkillToDirectory({
                agentName: "claude",
                skillName: "oo",
                targetSkillDirectoryPath: join(outputDirectory, "claude", "oo"),
            });
            await materializeBundledSkillToDirectory({
                agentName: "universal",
                skillName: "oo",
                targetSkillDirectoryPath: join(outputDirectory, "universal", "oo"),
            });

            const claudeSkill = await readFile(
                join(outputDirectory, "claude", "oo", "SKILL.md"),
                "utf8",
            );
            const universalSkill = await readFile(
                join(outputDirectory, "universal", "oo", "SKILL.md"),
                "utf8",
            );

            // Claude renders the host-specific frontmatter; universal does not.
            expect(claudeSkill).toContain("allowed-tools: [Bash(oo *)]");
            expect(universalSkill).not.toContain("allowed-tools");
            // No agentic-markdown directives survive the render in either format.
            expect(claudeSkill).not.toContain("agentic:");
            expect(universalSkill).not.toContain("agentic:");
        }
        finally {
            await rm(outputDirectory, { force: true, recursive: true });
        }
    });

    test("does not write an oo management metadata marker", async () => {
        const outputDirectory = await mkdtemp(join(tmpdir(), "oo-export-"));

        try {
            const targetSkillDirectoryPath = join(outputDirectory, "oo");
            await materializeBundledSkillToDirectory({
                agentName: "universal",
                skillName: "oo",
                targetSkillDirectoryPath,
            });

            expect(
                await pathExists(join(targetSkillDirectoryPath, ".oo-metadata.json")),
            ).toBeFalse();
        }
        finally {
            await rm(outputDirectory, { force: true, recursive: true });
        }
    });

    test("replaces only the per-skill directory and keeps sibling content", async () => {
        const outputDirectory = await mkdtemp(join(tmpdir(), "oo-export-"));

        try {
            const targetSkillDirectoryPath = join(outputDirectory, "oo");
            await mkdir(targetSkillDirectoryPath, { recursive: true });
            await writeFile(join(targetSkillDirectoryPath, "STALE.md"), "stale\n");
            await writeFile(join(outputDirectory, "keep.txt"), "keep\n");

            await materializeBundledSkillToDirectory({
                agentName: "universal",
                skillName: "oo",
                targetSkillDirectoryPath,
            });

            // The stale file inside the per-skill directory is removed.
            expect(
                await pathExists(join(targetSkillDirectoryPath, "STALE.md")),
            ).toBeFalse();
            // The freshly materialized skill is present.
            expect(
                await pathExists(join(targetSkillDirectoryPath, "SKILL.md")),
            ).toBeTrue();
            // Sibling content outside the per-skill directory is untouched.
            expect(await readFile(join(outputDirectory, "keep.txt"), "utf8")).toBe(
                "keep\n",
            );
        }
        finally {
            await rm(outputDirectory, { force: true, recursive: true });
        }
    });
});

async function pathExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    }
    catch {
        return false;
    }
}

function normalizePathForAssertion(path: string): string {
    return path.replaceAll("\\", "/");
}

function normalizeLineEndingsForAssertion(text: string): string {
    return text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function normalizeMarkdownWrappingForAssertion(text: string): string {
    const lines = normalizeLineEndingsForAssertion(text).split("\n");
    // Strip leading whitespace from continuation lines so soft-wrapped list
    // items and indented prose match assertions written as flat sentences.
    return lines
        .map((line, index) => (index === 0 ? line : line.trimStart()))
        .join(" ");
}

function getRequiredBundledSkillFile(
    skillName: (typeof availableBundledSkillNames)[number],
    agentName: (typeof availableBundledSkillAgentNames)[number],
    relativePath: string,
) {
    const skillFile = getBundledSkillFiles(skillName, agentName)
        .find(file => file.relativePath === relativePath);

    if (skillFile === undefined) {
        throw new Error(`Missing ${agentName}/${skillName}/${relativePath}`);
    }

    return skillFile;
}

async function readRequiredBundledSkillContent(
    skillName: (typeof availableBundledSkillNames)[number],
    agentName: (typeof availableBundledSkillAgentNames)[number],
    relativePath: string,
): Promise<string> {
    return await readBundledSkillFileContent(
        getRequiredBundledSkillFile(skillName, agentName, relativePath),
    );
}
