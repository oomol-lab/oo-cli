import { describe, expect, test } from "bun:test";

import {
    availableBundledSkillAgentNames,
    availableBundledSkillNames,
    getBundledSkillFiles,
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
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(getBundledSkillFiles("oo", "claude").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(getBundledSkillFiles("oo", "hermes").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(getBundledSkillFiles("oo", "codebuddy").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(getBundledSkillFiles("oo", "workbuddy").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(getBundledSkillFiles("oo", "trae").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(getBundledSkillFiles("oo", "trae-cn").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(getBundledSkillFiles("oo", "openclaw").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(getBundledSkillFiles("oo", "qoderwork").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/llm-client.md",
            "references/search-and-selection.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
        ]);
        expect(getBundledSkillFiles("oo", "deepseek-tui").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/llm-client.md",
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
            getBundledSkillFiles("oo-find-skills", "deepseek-tui").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-create-skill", "universal").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
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
            getBundledSkillFiles("oo-create-skill", "deepseek-tui").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "universal").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
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
        expect(
            getBundledSkillFiles("oo-publish-skill", "deepseek-tui").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
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
            expect(content).toContain("Skill sidecar");
            expect(content).toContain("oo skills search");
            expect(content).toContain("sidecar discovery branch");
            expect(content).toContain("not a callable capability contract");
            expect(content).toContain("Skill sidecar policy");
            expect(content).toContain("best credible installable skill match");
            expect(content).toContain("Do not install a skill");
            expect(content).toContain("do not ask about installation before");
            expect(content).toContain("first successful useful result");
            expect(content).toContain("numbered choices");
            expect(content).toContain("`1. Install <skillName> (<packageName>)`");
            expect(content).toContain("`2. Do not install`");
            expect(content).toContain("reply with `1` to install or `2` to skip");
            expect(content).toContain("Treat a `1` response as explicit agreement");
            expect(content).toContain("use the `oo-find-skills` installation flow");
            expect(content).toContain("If the user did not name a model or product");
            expect(content).toContain("prefer more capable, modern, reputable candidates");
            expect(content).toContain("older or obscure equivalents");
            expect(content).not.toContain("Prefer a package when the user wants a managed transform");
        }
    });

    test("guides oo runtime to defer sidecar skill installation", async () => {
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

            expect(content).toContain("When running capability discovery");
            expect(content).toContain("also run at most one");
            expect(content).toContain("sidecar query");
            expect(content).toContain("Record credible installable skill matches");
            expect(content).toContain("possible future enhancements");
            expect(content).toContain("do not install or ask about installation before");
            expect(content).toContain("capability succeeds");
            expect(content).toContain("After the first successful result");
            expect(content).toContain("ask whether the user wants to");
            expect(content).toContain("install that specific skill");
            expect(content).toContain("numbered choices");
            expect(content).toContain("`1. Install <skillName> (<packageName>)`");
            expect(content).toContain("`2. Do not install`");
            expect(content).toContain("reply with `1` to install or `2` to skip");
            expect(content).toContain("Treat a `1` response as explicit agreement");
            expect(content).toContain("Do not install unless the user explicitly agrees");
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

    test("guides oo-create-skill agents to fill presentation metadata", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const skillFile = getBundledSkillFiles("oo-create-skill", agentName).find(
                file => file.relativePath === "SKILL.md",
            );

            if (skillFile === undefined) {
                throw new Error(`Missing ${agentName} oo-create-skill SKILL.md`);
            }

            const content = normalizeMarkdownWrappingForAssertion(
                await readBundledSkillFileContent(skillFile),
            );

            expect(content).toContain("with a required `--description`");
            expect(content).toContain("Include `--title` and `--icon` when you have suitable values");
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
                await readBundledSkillFileContent(skillFile),
            );

            expect(content).toContain("Constitution");
            expect(content).toContain("Use these rules to decide confidently");
            expect(content).toContain("not a separate checklist");
            expect(content).toContain("priority order: safety, local authoring scope");
            expect(content).toContain("Ask for reusable intent; prove execution facts");
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
            expect(content).toContain("Evidence outranks memory");
            expect(content).toContain("Do not ask");
            expect(content).toContain("resolve facts that `oo` metadata");
            expect(content).toContain("connector service/action identifiers");
            expect(content).toContain("field names");
            expect(content).toContain("result field paths");
            expect(content).toContain("authentication state");
            expect(content).toContain("defaults");
            expect(content).toContain("current command output");
            expect(content).toContain("Resolve before designing");
            expect(content).toContain("Test only when the test is safer than the uncertainty");
            expect(content).toContain("observed");
            expect(content).toContain("current evidence");
            expect(content).toContain("future agents");
            expect(content).toContain("without rediscovery");
            expect(content).toContain("Do not ask only for cosmetic details");
            expect(content).toContain("facts that `oo` metadata can resolve");
            expect(content).toContain("Exit condition");
            expect(content).not.toContain("package/block references");
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
                await readBundledSkillFileContent(skillFile),
            );

            expect(content).toContain("Author, generate, adopt, or document a local AI agent skill");
            expect(content).toContain("create a skill, write a skill, adopt an existing workflow");
            expect(content).toContain("existing local workflow directory");
            expect(content).toContain("connector action");
            expect(content).toContain("Use the local workflow path");
            expect(content).toContain("oo skills preflight --agent");
            expect(content).toContain("oo skills adopt \"<path>\" --agent");
            expect(content).toContain("oo skills init <name> --agent");
            expect(content).toContain("find or install an");
            expect(content).toContain("existing skill");
            expect(content).toContain("distribute a finished skill");
            expect(content).not.toContain("Author, generate, or scaffold a new local AI agent skill");
            expect(content).not.toContain("Author, generate, scaffold, or update");
            expect(content).not.toContain("create or update a local skill");
            expect(content).not.toContain("default private");
            expect(content).not.toContain("private visibility");
            expect(content).not.toContain("--visibility private");
            expect(content).not.toContain("already knows which oo package or block");
        }
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
                await readBundledSkillFileContent(skillFile),
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
                "Before validation, re-check the trigger description and presentation metadata",
            );
            expect(content).toContain(
                "against the Initialize Skill contract",
            );
            expect(content).not.toContain("one short positive trigger sentence");
            expect(content).not.toContain("Keep implementation plumbing out of the description");
        }
    });

    test("guides oo-create-skill generated skills to stay in English", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const skillFile = getBundledSkillFiles("oo-create-skill", agentName).find(
                file => file.relativePath === "SKILL.md",
            );

            if (skillFile === undefined) {
                throw new Error(`Missing ${agentName} oo-create-skill SKILL.md`);
            }

            const content = normalizeMarkdownWrappingForAssertion(
                await readBundledSkillFileContent(skillFile),
            );

            expect(content).toContain(
                "Write generated skills in English regardless of the user's language",
            );
            expect(content).toContain("including `--description`, `--title`");
            expect(content).toContain("frontmatter, headings, examples, and reference files");
            expect(content).toContain("Preserve non-English only for literal runtime values");
            expect(content).toContain("language-pair requirements");
            expect(content).not.toContain("Do not mirror the user's language into the skill body");
        }
    });

    test("guides oo-create-skill discovery toward Fusion API selection preference", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const skillFile = getBundledSkillFiles("oo-create-skill", agentName).find(
                file => file.relativePath === "SKILL.md",
            );

            if (skillFile === undefined) {
                throw new Error(`Missing ${agentName} oo-create-skill SKILL.md`);
            }

            const content = normalizeMarkdownWrappingForAssertion(
                await readBundledSkillFileContent(skillFile),
            );

            expect(content).toContain("Capability Discovery");
            expect(content).toContain("Capability Contract");
            expect(content).toContain("Resolve before designing");
            expect(content).toContain("Do not predesign the whole");
            expect(content).toContain("execution process");
            expect(content).toContain("Discover");
            expect(content).toContain("the capability");
            expect(content).toContain("Test only when the test is safer than the uncertainty");
            expect(content).toContain("smallest representative invocation");
            expect(content).toContain("cheap, non-sensitive, non-destructive");
            expect(content).toContain("observed");
            expect(content).toContain("current evidence");
            expect(content).toContain("Select the most direct executable action");
            expect(content).toContain("prefer a matching `fusion-api` action by default");
            expect(content).toContain("generic managed transforms");
            expect(content).toContain("background removal");
            expect(content).toContain("OCR");
            expect(content).toContain("translation");
            expect(content).toContain("image generation");
            expect(content).toContain("document conversion");
            expect(content).toContain("Apply the Constitution's Fusion tie-breaker");
            expect(content).toContain("non-Fusion connectors only when user intent");
            expect(content).toContain("contract constraints require them");
            expect(content).toContain("Fusion API actions are connector actions");
            expect(content).toContain("using `fusion-api` as the service");
            expect(content).toContain("Capability discovery may return");
            expect(content).toContain("complete connector action contract");
            expect(content).toContain("Do this even when the user mentions");
            expect(content).toContain("model, product, provider name");
            expect(content).toContain("Use only connector entries");
            expect(content).toContain("authoring candidates");
            expect(content).toContain("non-connector entries");
            expect(content).toContain("non-authoring catalog noise");
            expect(content).toContain("classify `fusion-api`");
            expect(content).toContain("OOMOL-hosted Fusion API");
            expect(content).toContain("account, cost, compliance");
            expect(content).toContain("data-routing");
            expect(content).toContain("output-contract constraints");
            expect(content).toContain("oo connector schema");
            expect(content).toContain("selected service/action");
            expect(content).toContain("current command output");
            expect(content).toContain(
                "Do not choose a connector action unless current command output exposes it",
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
            expect(content).toContain("full `oo connector run --json` response paths");
            expect(content).toContain("not only the connector payload's inner field names");
            expect(content).toContain("response.data.sessionId");
            expect(content).toContain("response.data.state");
            expect(content).toContain("response.data.data.image.url");
            expect(content).toContain("Do not spend");
            expect(content).toContain("meaningful user money");
            expect(content).toContain("mutate external state");
            expect(content).toContain("disclose sensitive data");
            expect(content).toContain("documented dry-run");
            expect(content).toContain("read-only paths");
            expect(content).toContain("inferred from schema rather than observed");
            expect(content).toContain("label it as untested");
            expect(content).toContain("Keep the chosen connector action concrete");
            expect(content).toContain("run one connector narrowing pass");
            expect(content).toContain("reporting that no Fusion API action is available");
            expect(content).toContain(
                "connector service/action identifiers",
            );
            expect(content).toContain("future agents");
            expect(content).toContain("without rediscovery");
            expect(content).not.toContain("default preference order");
            expect(content).not.toContain("If Fusion API and an ordinary connector action both match");
            expect(content).not.toContain("Apply the capability principle above");
            expect(content).not.toContain("If the user provides only package-level information");
            expect(content).not.toContain("packages or blocks after those");
            expect(content).not.toContain("complete package/block contract");
            expect(content).not.toContain("complete package-level contract");
            expect(content).not.toContain("package-like name");
            expect(content).not.toContain("package/block results");
            expect(content).not.toContain("connector actions, packages, and blocks");
            expect(content).not.toContain("Blocks are flexible");
            expect(content).not.toContain("Do not force a package or block reference");
            expect(content).not.toContain("package-only path");
            expect(content).not.toContain("Treat Connect and");
            expect(content).not.toContain("Fusion API actions as the only authoring candidates");
            expect(content).not.toContain("Use only Connect and Fusion API connector entries");
            expect(content).not.toContain("for Connect and Fusion API contracts");
        }
    });

    test("guides oo-create-skill generated workflows to route file transfers through connector-native actions", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const skillFile = getBundledSkillFiles("oo-create-skill", agentName).find(
                file => file.relativePath === "SKILL.md",
            );

            if (skillFile === undefined) {
                throw new Error(`Missing ${agentName} oo-create-skill SKILL.md`);
            }

            const content = normalizeMarkdownWrappingForAssertion(
                await readBundledSkillFileContent(skillFile),
            );

            expect(content).toContain(
                "Preserve file and artifact boundaries",
            );
            expect(content).toContain(
                "Local files are not remote connector inputs",
            );
            expect(content).toContain(
                "temporary source adapter",
            );
            expect(content).toContain(
                "connector-native upload/import/attach/create-file actions",
            );
            expect(content).toContain("`oo file upload \"<filePath>\" --json`");
            expect(content).toContain("returned `downloadUrl`");
            expect(content).toContain(
                "another supported file input shape",
            );
            expect(content).toContain("target-service write");
            expect(content).toContain("`oo file download \"<url>\" [outDir]");
            expect(content).toContain(
                "downloadable artifact URL and the task needs a local file result",
            );
            expect(content).toContain("`Saved to: <path>`");
            expect(content).toContain("does not support `--json`");
            expect(content).toContain(
                "schema explicitly supports local paths",
            );
            expect(content).toContain("A file-producing skill is not complete");
            expect(content).toContain("future agents can preview, attach, link, save");
            expect(content).toContain("environment-exposed attachment paths");
            expect(content).toContain("chat-visible media with no readable CLI path");
            expect(content).toContain("recent-file fallback");
            expect(content).toContain("candidate hashes match");
            expect(content).toContain("Do not default generated artifacts into the current repository workspace");
            expect(content).toContain("local/remote connector file boundary");
            expect(content).not.toContain("local/cloud");
            expect(content).not.toContain("cloud payloads");
            expect(content).toContain("oo llm config --json");
            expect(content).toContain("OOMOL-hosted LLM client");
            expect(content).toContain("returned `apiKey`");
            expect(content).toContain("`baseUrl`");
            expect(content).toContain("`model`");
            expect(content).toContain("Do not hardcode");
            expect(content).toContain("read local auth files directly");
            expect(content).not.toContain("oo-upload");
            expect(content).not.toContain("oo-download");
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
                await readBundledSkillFileContent(skillFile),
            );

            expect(content).toContain("compact execution runbook");
            expect(content).toContain("call the selected capability without rediscovery");
            expect(content).toContain("not a full schema dump");
            expect(content).toContain("Include a section only when it changes runtime behavior");
            expect(content).toContain("Authoring State Machine");
            expect(content).toContain("selected connector action workflows");
            expect(content).toContain("Runtime input policy");
            expect(content).toContain("required inputs");
            expect(content).toContain("be inferred or defaulted");
            expect(content).toContain("optional inputs to omit when absent");
            expect(content).toContain("missing runtime values");
            expect(content).toContain("Source resolution for file-like inputs");
            expect(content).toContain("chat-visible media with no");
            expect(content).toContain("multiple candidate files");
            expect(content).toContain("Invocation");
            expect(content).toContain("small payload skeleton");
            expect(content).toContain("`--data @payload.json`");
            expect(content).toContain("Payload rules");
            expect(content).toContain("Result handling");
            expect(content).toContain("JSON field paths");
            expect(content).toContain("full CLI response paths");
            expect(content).toContain("schema-only paths as untested");
            expect(content).toContain("what not to treat as the final result");
            expect(content).toContain("files, images, documents");
            expect(content).toContain("preview them or deliver them to the user");
            expect(content).toContain("reporting a local path");
            expect(content).toContain("inline base64 or `data:` URI artifacts");
            expect(content).toContain("save and preview the artifact");
            expect(content).toContain("printing the full");
            expect(content).toContain("encoded payload");
            expect(content).toContain("Async handling");
            expect(content).toContain("early-exit");
            expect(content).toContain("stops polling immediately");
            expect(content).toContain("Artifact destination and verification");
            expect(content).toContain("avoids polluting an unrelated repository");
            expect(content).toContain("PNG alpha/RGBA check");
            expect(content).toContain("Failure handling");
            expect(content).toContain("action-specific stop conditions");
            expect(content).toContain("schema rejection");
            expect(content).toContain("async or");
            expect(content).toContain("idempotency guidance");
            expect(content).toContain("observed metadata");
            expect(content).toContain("documented oo");
            expect(content).toContain("Final Acceptance Check");
            expect(content).toContain("future agent can reach the selected capability");
            expect(content).toContain("without rediscovery");
            expect(content).toContain("stop on common failures");
            expect(content).toContain("only the runtime questions that apply");
            expect(content).toContain("Source: how required runtime inputs are obtained");
            expect(content).toContain("Invoke: the exact selected service/action");
            expect(content).toContain("Result: the full CLI JSON path");
            expect(content).toContain("Async: terminal success, failure, timeout");
            expect(content).toContain("Artifact: destination, preview/handoff, and verification");
            expect(content).toContain("Failure: auth, billing, permission, schema");
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
            expect(content).toContain("exact `oo skills install ... -y` command");
            expect(content).toContain("existing AI agent skill");
            expect(content).toContain("it does not need to be an oo-specific skill");
            expect(content).toContain("oo skills publish");
            expect(content).toContain("oo skills locate <skill-id>");
            expect(content).toContain("extra locate step");
            expect(content).toContain("Pass `--visibility` only");
            expect(content).toContain("The publish command performs its own");
            expect(content).toContain("Do not ask whether to publish to the current account");
            expect(content).toContain("Do not package manually");
            expect(content).toContain("Report the published package name");
            expect(content).not.toContain("default private");
            expect(content).not.toContain("private visibility");
            expect(content).not.toContain("--visibility private");
            expect(content).not.toContain("OOMOL/oo skill");
            expect(content).not.toContain("oo skills preflight");
            expect(content).not.toContain("oo skills publish <skill-id> --agent");
            expect(content).not.toContain("Use `--agent` only as a source hint");
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
        expect(universalCreateContent).toContain("oo skills preflight --agent universal");
        expect(universalCreateContent).toContain("Universal permission and storage probe");
        expect(qoderWorkCreateContent).toContain("oo skills preflight --agent qoderwork");
        expect(qoderWorkCreateContent).toContain("QoderWork permission and storage probe");
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
