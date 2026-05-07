import { describe, expect, test } from "bun:test";

import {
    availableBundledSkillAgentNames,
    availableBundledSkillNames,
    getBundledSkillFiles,
} from "./embedded-assets.ts";

describe("embedded skill assets", () => {
    test("keeps the bundled skill file registry aligned with the bundled skill names", () => {
        expect(availableBundledSkillNames).toEqual([
            "oo",
            "oo-find-skills",
            "oo-create-skill",
            "oo-publish-skill",
        ]);
        expect(getBundledSkillFiles("oo", "codex").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/auth-and-billing.md",
            "references/search-and-selection.md",
            "references/package-execution.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
            "references/task-lifecycle.md",
        ]);
        expect(getBundledSkillFiles("oo", "claude").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/search-and-selection.md",
            "references/package-execution.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
            "references/task-lifecycle.md",
        ]);
        expect(getBundledSkillFiles("oo", "hermes").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/search-and-selection.md",
            "references/package-execution.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
            "references/task-lifecycle.md",
        ]);
        expect(getBundledSkillFiles("oo", "codebuddy").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/search-and-selection.md",
            "references/package-execution.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
            "references/task-lifecycle.md",
        ]);
        expect(getBundledSkillFiles("oo", "workbuddy").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/search-and-selection.md",
            "references/package-execution.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
            "references/task-lifecycle.md",
        ]);
        expect(getBundledSkillFiles("oo", "trae").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/search-and-selection.md",
            "references/package-execution.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
            "references/task-lifecycle.md",
        ]);
        expect(getBundledSkillFiles("oo", "trae-cn").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/search-and-selection.md",
            "references/package-execution.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
            "references/task-lifecycle.md",
        ]);
        expect(getBundledSkillFiles("oo", "openclaw").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/search-and-selection.md",
            "references/package-execution.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
            "references/task-lifecycle.md",
        ]);
        expect(getBundledSkillFiles("oo", "qoderwork").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/search-and-selection.md",
            "references/package-execution.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
            "references/task-lifecycle.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "codex").map(
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
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "hermes").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "codebuddy").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "workbuddy").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "trae").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "trae-cn").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "openclaw").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "qoderwork").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-create-skill", "codex").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
        ]);
        expect(
            getBundledSkillFiles("oo-create-skill", "claude").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-create-skill", "hermes").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-create-skill", "codebuddy").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-create-skill", "workbuddy").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-create-skill", "trae").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-create-skill", "trae-cn").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-create-skill", "openclaw").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-create-skill", "qoderwork").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "codex").map(
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
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "hermes").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "codebuddy").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "workbuddy").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "trae").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "trae-cn").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "openclaw").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "qoderwork").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
    });

    test("maps bundled skills to contrib/skills/<agent>/<skill> source directories", () => {
        expect([...availableBundledSkillAgentNames]).toEqual([
            "codex",
            "claude",
            "hermes",
            "codebuddy",
            "workbuddy",
            "trae",
            "trae-cn",
            "openclaw",
            "qoderwork",
        ]);

        for (const skillName of availableBundledSkillNames) {
            for (const agentName of availableBundledSkillAgentNames) {
                const sourceAgentName = readBundledSkillSourceAgentName(agentName);
                const sourceDirectory = `contrib/skills/${sourceAgentName}/${skillName}`;
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

    test("guides oo-create-skill agents to fill presentation metadata", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const skillFile = getBundledSkillFiles("oo-create-skill", agentName).find(
                file => file.relativePath === "SKILL.md",
            );

            if (skillFile === undefined) {
                throw new Error(`Missing ${agentName} oo-create-skill SKILL.md`);
            }

            const content = normalizeMarkdownWrappingForAssertion(
                await Bun.file(skillFile.sourcePath).text(),
            );

            expect(content).toContain("required `--description`, `--title`, and `--icon`");
            expect(content).toContain("Derive title and icon");
            expect(content).toContain("fitting icon reference: an emoji, an image URL");
            expect(content).toContain("`:collection:icon:`");
            expect(content).toContain("https://icones.js.org/");
            expect(content).toContain(
                "If `metadata.title` or `metadata.icon` is absent, add a suitable value",
            );
            expect(content).not.toContain(
                "Pass `--title` only when the user provided or confirmed",
            );
            expect(content).not.toContain(
                "do not add it by deriving a title from the skill name",
            );
        }
    });

    test("guides oo-create-skill agents to ask for business decisions without offloading metadata lookup", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const skillFile = getBundledSkillFiles("oo-create-skill", agentName).find(
                file => file.relativePath === "SKILL.md",
            );

            if (skillFile === undefined) {
                throw new Error(`Missing ${agentName} oo-create-skill SKILL.md`);
            }

            const content = normalizeMarkdownWrappingForAssertion(
                await Bun.file(skillFile.sourcePath).text(),
            );

            expect(content).toContain("Constitution");
            expect(content).toContain("Use these rules to decide confidently");
            expect(content).toContain("not a separate checklist");
            expect(content).toContain("User intent defines the reusable contract");
            expect(content).toContain("decision would change");
            expect(content).toContain("scope, workflow ordering");
            expect(content).toContain("workflow ordering");
            expect(content).toContain("required user inputs");
            expect(content).toContain("expected outputs");
            expect(content).toContain("data routing");
            expect(content).toContain("metadata ambiguity");
            expect(content).toContain("choice prompt with a recommended option");
            expect(content).toContain("recommended option");
            expect(content).toContain("free-form input");
            expect(content).toContain("concrete choices");
            expect(content).toContain("`oo` metadata and command output define execution facts");
            expect(content).toContain("Do not ask");
            expect(content).toContain("resolve facts");
            expect(content).toContain("package/block references");
            expect(content).toContain("connector service/action identifiers");
            expect(content).toContain("field names");
            expect(content).toContain("result field paths");
            expect(content).toContain("authentication state");
            expect(content).toContain("defaults");
            expect(content).toContain("current command output");
            expect(content).toContain("safe invocation");
            expect(content).toContain("observed result paths");
            expect(content).toContain("Resolve and test before writing the runbook");
            expect(content).toContain("observed");
            expect(content).toContain("facts");
            expect(content).toContain("future agents");
            expect(content).toContain("do not run discovery");
            expect(content).toContain("again");
            expect(content).toContain("do not ask only for cosmetic details");
            expect(content).toContain("facts that `oo` metadata can resolve");
            expect(content).toContain("future agents");
            expect(content).toContain("do not run discovery");
            expect(content).toContain("again");
            expect(content).not.toContain("Operating Principles");
            expect(content).not.toContain("Work like a confident authoring agent");
            expect(content).not.toContain("interrupt the user only for true blockers");
            expect(content).not.toContain("Ask only for true blockers");
            expect(content).not.toContain("Otherwise decide and proceed");
        }
    });

    test("guides oo-create-skill trigger descriptions toward local skill authoring", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const skillFile = getBundledSkillFiles("oo-create-skill", agentName).find(
                file => file.relativePath === "SKILL.md",
            );

            if (skillFile === undefined) {
                throw new Error(`Missing ${agentName} oo-create-skill SKILL.md`);
            }

            const content = normalizeMarkdownWrappingForAssertion(
                await Bun.file(skillFile.sourcePath).text(),
            );

            expect(content).toContain("Author, generate, scaffold, or update");
            expect(content).toContain("create a skill, write a skill, make a");
            expect(content).toContain("Codex/Claude/agent skill");
            expect(content).toContain("connector action");
            expect(content).toContain("capability discovery is needed first");
            expect(content).toContain("discover or install existing published skills");
            expect(content).toContain("publish a finished skill");
            expect(content).not.toContain("already knows which oo package or block");
        }

        const openAiAgentFile = getBundledSkillFiles("oo-create-skill", "codex").find(
            file => file.relativePath === "agents/openai.yaml",
        );

        if (openAiAgentFile === undefined) {
            throw new Error("Missing codex oo-create-skill agents/openai.yaml");
        }

        const openAiAgentContent = await Bun.file(openAiAgentFile.sourcePath).text();

        expect(openAiAgentContent).toContain("$oo-create-skill");
        expect(openAiAgentContent).toContain("author, scaffold, generate, or update");
        expect(openAiAgentContent).toContain("connector action");
        expect(openAiAgentContent).toContain("capability discovery is needed before authoring");
        expect(openAiAgentContent).toContain(
            "finding/installing published skills or publishing finished skills",
        );
    });

    test("guides oo-create-skill generated descriptions toward user outcomes", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const skillFile = getBundledSkillFiles("oo-create-skill", agentName).find(
                file => file.relativePath === "SKILL.md",
            );

            if (skillFile === undefined) {
                throw new Error(`Missing ${agentName} oo-create-skill SKILL.md`);
            }

            const content = normalizeMarkdownWrappingForAssertion(
                await Bun.file(skillFile.sourcePath).text(),
            );

            expect(content).toContain("user-facing trigger summary");
            expect(content).toContain("main signal future agents see before loading the skill");
            expect(content).toContain("Start with the user outcome");
            expect(content).toContain("natural request verbs");
            expect(content).toContain("one or two concise sentences");
            expect(content).toContain("what users would ask");
            expect(content).toContain("Use this description shape when helpful");
            expect(content).toContain("negative conditions in the workflow body");
            expect(content).toContain(
                "user-visible outcome first",
            );
            expect(content).toContain(
                "Keep caveats, execution details, negative guidance, and boundary cases in",
            );
            expect(content).not.toContain("one short positive trigger sentence");
            expect(content).not.toContain("Keep implementation plumbing out of the description");
        }
    });

    test("guides oo-create-skill discovery toward connector-aware selection", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const skillFile = getBundledSkillFiles("oo-create-skill", agentName).find(
                file => file.relativePath === "SKILL.md",
            );

            if (skillFile === undefined) {
                throw new Error(`Missing ${agentName} oo-create-skill SKILL.md`);
            }

            const content = normalizeMarkdownWrappingForAssertion(
                await Bun.file(skillFile.sourcePath).text(),
            );

            expect(content).toContain(
                "Resolve concrete package, block, and connector references",
            );
            expect(content).toContain("Resolve and test before writing the runbook");
            expect(content).toContain("Do not predesign the whole");
            expect(content).toContain("execution process");
            expect(content).toContain("Discover");
            expect(content).toContain("the capability");
            expect(content).toContain("run the smallest safe test");
            expect(content).toContain("observed");
            expect(content).toContain("facts");
            expect(content).toContain("Choose the most direct capability");
            expect(content).toContain("domain fit over result ordering");
            expect(content).toContain("Treat Fusion API, connector, and package/block results");
            expect(content).toContain("first-class authoring");
            expect(content).toContain("ordinary connectors, packages, and blocks");
            expect(content).toContain("Classify service `fusion-api`");
            expect(content).toContain("does not require the user");
            expect(content).toContain("to provide their own API key");
            expect(content).toContain("choose Fusion API by default");
            expect(content).toContain("account, cost, compliance");
            expect(content).toContain("output-contract differences");
            expect(content).toContain("Treat local `schemaPath` files");
            expect(content).toContain("supporting");
            expect(content).toContain("metadata");
            expect(content).toContain("current command output");
            expect(content).toContain("safe invocation");
            expect(content).toContain("confirm connector");
            expect(content).toContain("action availability");
            expect(content).toContain("Apply the Constitution");
            expect(content).toContain("Blocks are flexible");
            expect(content).toContain("weaker performance and higher execution friction");
            expect(content).toContain(
                "Do not choose a connector action just because a local schema file exists",
            );
            expect(content).toContain("non-destructive test");
            expect(content).toContain("unknown action");
            expect(content).toContain("choose an exposed action");
            expect(content).toContain("async submission plus polling replacing a synchronous call");
            expect(content).toContain("When result shape");
            expect(content).toContain("status transitions");
            expect(content).toContain("file return format");
            expect(content).toContain("envelope structure");
            expect(content).toContain("minimal representative invocation");
            expect(content).toContain("status/result poll");
            expect(content).toContain("safe and proportionate");
            expect(content).toContain("Do not spend");
            expect(content).toContain("meaningful user money");
            expect(content).toContain("mutate external state");
            expect(content).toContain("disclose sensitive data");
            expect(content).toContain("documented dry-run");
            expect(content).toContain("read-only paths");
            expect(content).toContain("inferred from schema rather than observed");
            expect(content).toContain("label it as untested");
            expect(content).toContain("Do not force a package or block reference");
            expect(content).toContain("when the chosen reusable workflow is connector-backed.");
            expect(content).toContain(
                "connector service/action identifiers",
            );
            expect(content).toContain("future agents");
            expect(content).toContain("do not run discovery");
            expect(content).toContain("again");
            expect(content).not.toContain("default preference order");
            expect(content).not.toContain("If Fusion API and an ordinary connector action both match");
            expect(content).not.toContain("Apply the capability principle above");
        }
    });

    test("guides oo-create-skill generated workflows to use managed attachment transfer helpers", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const skillFile = getBundledSkillFiles("oo-create-skill", agentName).find(
                file => file.relativePath === "SKILL.md",
            );

            if (skillFile === undefined) {
                throw new Error(`Missing ${agentName} oo-create-skill SKILL.md`);
            }

            const content = normalizeMarkdownWrappingForAssertion(
                await Bun.file(skillFile.sourcePath).text(),
            );

            expect(content).toContain("Preserve the local/cloud boundary");
            expect(content).toContain("Make file artifacts visible to the user");
            expect(content).toContain("agent-provided `oo-upload` helper");
            expect(content).toContain("local attachments sent to");
            expect(content).toContain("`oo-download` for cloud artifacts");
            expect(content).toContain("treat these helpers as capabilities");
            expect(content).toContain("hand-roll transfer");
            expect(content).toContain("logic");
            expect(content).toContain(
                "do not pass local filesystem paths to cloud",
            );
            expect(content).toContain("A successful");
            expect(content).toContain("file path alone is not enough");
            expect(content).toContain("local/cloud file boundary");
        }
    });

    test("guides oo-create-skill generated workflows to be compact execution runbooks", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const skillFile = getBundledSkillFiles("oo-create-skill", agentName).find(
                file => file.relativePath === "SKILL.md",
            );

            if (skillFile === undefined) {
                throw new Error(`Missing ${agentName} oo-create-skill SKILL.md`);
            }

            const content = normalizeMarkdownWrappingForAssertion(
                await Bun.file(skillFile.sourcePath).text(),
            );

            expect(content).toContain("compact execution runbook");
            expect(content).toContain("call the selected capability without rediscovery");
            expect(content).toContain("not a full schema dump");
            expect(content).toContain("connector-backed or Fusion API-backed workflows");
            expect(content).toContain("Runtime input policy");
            expect(content).toContain("required inputs");
            expect(content).toContain("be inferred or defaulted");
            expect(content).toContain("optional inputs to omit when absent");
            expect(content).toContain("missing runtime values");
            expect(content).toContain("Invocation");
            expect(content).toContain("small payload skeleton");
            expect(content).toContain("`--data @payload.json`");
            expect(content).toContain("Payload rules");
            expect(content).toContain("Result handling");
            expect(content).toContain("JSON field paths");
            expect(content).toContain("what not to treat as the final result");
            expect(content).toContain("files, images, documents");
            expect(content).toContain("preview them or deliver them to the user");
            expect(content).toContain("reporting a local path");
            expect(content).toContain("inline base64 or `data:` URI artifacts");
            expect(content).toContain("save and preview the artifact");
            expect(content).toContain("printing the full");
            expect(content).toContain("encoded payload");
            expect(content).toContain("Failure handling");
            expect(content).toContain("action-specific stop conditions");
            expect(content).toContain("schema rejection");
            expect(content).toContain("async or");
            expect(content).toContain("idempotency guidance");
            expect(content).toContain("observed metadata");
            expect(content).toContain("documented oo");
            expect(content).toContain("Before finishing");
            expect(content).toContain("future agent can reach the selected capability");
            expect(content).toContain("without rediscovery");
            expect(content).toContain("stop on common failures");
            expect(content).not.toContain("Use whatever structure fits the domain");
            expect(content).not.toContain("async polling/idempotency when needed");
            expect(content).not.toContain("future agent can ask less");
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
                await Bun.file(skillFile.sourcePath).text(),
            );

            expect(content).toContain(
                "Publish, release, upload, submit, or share",
            );
            expect(content).toContain("existing AI agent skill");
            expect(content).toContain("it does not need to be an oo-specific skill");
            expect(content).toContain("oo skills publish");
            expect(content).toContain("When publishing by skill id");
            expect(content).toContain("include `--agent");
            expect(content).toContain("Add `--visibility public` only");
            expect(content).toContain("The publish command performs its own");
            expect(content).toContain("Do not ask whether to publish to the current account");
            expect(content).toContain("Do not package manually");
            expect(content).toContain("Report the published package name");
            expect(content).not.toContain("OOMOL/oo skill");
            expect(content).not.toContain("oo skills preflight");
            expect(content).not.toContain("oo auth status");
            expect(content).not.toContain("Use `--agent` only as a source hint");
        }
    });

    test("keeps non-Claude skill frontmatter free of Claude allowed tools", async () => {
        for (const agentName of ["qoderwork", "trae", "trae-cn", "workbuddy"] as const) {
            for (const skillName of availableBundledSkillNames) {
                const skillFile = getBundledSkillFiles(skillName, agentName)
                    .find(file => file.relativePath === "SKILL.md");

                if (skillFile === undefined) {
                    throw new Error(`Missing ${agentName} SKILL.md for ${skillName}`);
                }

                expect(await Bun.file(skillFile.sourcePath).text()).not.toContain(
                    "allowed-tools",
                );
            }
        }
    });
});

function normalizePathForAssertion(path: string): string {
    return path.replaceAll("\\", "/");
}

function normalizeLineEndingsForAssertion(text: string): string {
    return text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function normalizeMarkdownWrappingForAssertion(text: string): string {
    return normalizeLineEndingsForAssertion(text).replaceAll("\n", " ");
}

function readBundledSkillSourceAgentName(
    agentName: (typeof availableBundledSkillAgentNames)[number],
): string {
    switch (agentName) {
        case "hermes":
            return "claude";
        case "trae":
        case "trae-cn":
        case "workbuddy":
            return "codebuddy";
        default:
            return agentName;
    }
}
