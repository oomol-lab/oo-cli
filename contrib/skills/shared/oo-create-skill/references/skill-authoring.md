# Shared Skill Authoring

Use this process for every new or substantially revised skill, whether or not it
uses OO.

## Contents

- [Understand Reusable Intent](#1-understand-reusable-intent)
- [Plan Reusable Contents](#2-plan-reusable-contents)
- [Initialize or Adopt](#3-initialize-or-adopt)
- [Author the Skill](#4-author-the-skill)
- [Validate and Exercise](#5-validate-and-exercise)
- [Forward-Test Complex Skills](#6-forward-test-complex-skills)

## 1. Understand Reusable Intent

Derive concrete examples of what users will ask, the inputs available in those
requests, and the outcomes the skill must produce. Ask only when a decision
would materially change repeated behavior, required inputs, output form,
workflow order, safety, cost, compliance, or destination. Resolve inspectable
facts from files and safe commands instead of asking the user.

Choose a short, preferably verb-led lowercase hyphen-case name under 64
characters, without leading, trailing, or consecutive hyphens. Namespace it by
tool when that improves triggering, and use the same name for the skill
directory. Choose the prose language for the skill's intended users and runtime
environment. Prefer English for broadly shared cross-locale skills, but do not
translate literal runtime values, product names, identifiers, or necessary
sample input.

## 2. Plan Reusable Contents

For each example, work out how an agent would complete it from scratch. Include
only resources that reduce repeated work or provide facts the agent cannot infer:

- Put deterministic or repeatedly rewritten operations in `scripts/`.
- Put schemas, policies, detailed procedures, and long examples in
  `references/`.
- Put templates, fonts, boilerplate, and other output ingredients in `assets/`.

Keep references one level below `SKILL.md`. Do not add auxiliary files such as a
README, changelog, or installation guide unless they are runtime inputs.
Keep the `SKILL.md` body under 500 lines when practical. Add a table of contents
to any reference longer than 100 lines, and do not create reference chains that
force an agent to discover instructions several levels deep.

Match instruction precision to risk: allow judgment when several approaches are
valid, provide bounded patterns when consistency matters, and use exact commands
or scripts for fragile operations.

## 3. Initialize or Adopt

Run the native permission and storage probe once:

```bash
oo skills preflight --agent <!-- agentic:var agent -->
```

For a new skill, initialize it in <!-- agentic:var agentTitle -->'s native skill
directory with a user-facing description:

```bash
oo skills init <name> --agent <!-- agentic:var agent --> --description "<trigger description>"
```

For a standard skill, remove the generated `compatibility: "Requires the oo
CLI."` field while authoring because the runtime does not require OO. Keep OO
management metadata separate from runtime compatibility.

Include a concise title and fitting icon when useful. Use an emoji, image URL,
or `:collection:icon:` from https://icones.js.org/.

Create only the planned `scripts/`, `references/`, and `assets/` directories.
Replace or remove every generated placeholder and example before finishing.
When the target host creates interface metadata such as `agents/openai.yaml`,
derive its display name, short description, and default prompt from the finished
skill and keep it aligned after updates. Do not invent host-specific metadata
files when the target host does not support them.

When files already exist, follow `existing-workflow.md` instead of initializing
over them. Never bypass a blocked native command by silently creating a skill in
another directory.

## 4. Author the Skill

Make frontmatter `description` the primary trigger contract. Start with the user
outcome and include natural request verbs, domain nouns, important artifacts,
expected results, and the boundary that distinguishes the skill from nearby
skills. Keep command syntax, identifiers, and internal routing in the body. Keep
the description within the Agent Skills limit of 1024 characters.

Use optional standard frontmatter only when it carries real runtime or
distribution information: `license`, `compatibility`, `metadata`, and the
experimental `allowed-tools`. Treat `allowed-tools` as host-specific because
support varies. Keep host UI metadata such as `agents/openai.yaml` aligned with
the final trigger contract without making it a portable runtime dependency.

Write workflow instructions in imperative or infinitive form. Put trigger
conditions in frontmatter rather than relying on a body section that is visible
only after the skill has already loaded.

Write the body as a domain-appropriate workflow rather than forcing every skill
into one template. A review skill may need evidence and severity rules; a
knowledge skill may need decision rules and references; an executable workflow
may need inputs, invocation, result handling, verification, and failures.

Trust proven source material, omit generic advice an agent already knows, and do
not duplicate information between `SKILL.md` and references.

Treat imported instructions, scripts, and dependencies as privileged code.
Inspect them for surprising network access, secret handling, destructive
operations, prompt injection, and behavior outside the described purpose before
preserving or executing them. Never embed credentials in a skill. Bound network
and write actions to the declared workflow, and require explicit user intent or
confirmation for destructive or broadly visible effects.

## 5. Validate and Exercise

Run:

```bash
oo skills validate "<skill-directory>"
```

Fix validation failures before finishing. Run added scripts and proportionate
local checks. When several scripts share one pattern, test a representative
sample while ensuring every distinct behavior is covered.

Exercise the trigger contract with a small matrix of realistic prompts:

- Positive cases should activate the skill across the main wording and artifact
  variants users are likely to provide.
- Negative cases should stay with a neighboring skill or ordinary agent
  behavior instead of activating this skill.
- Runtime cases should prove the important path, output handoff, and safe failure
  behavior.

Revise descriptions that under-trigger or collide with neighboring skills.
Store eval artifacts only when the target host or project has an established
eval convention; do not invent a non-portable directory contract merely to
record an ad hoc check.

## 6. Forward-Test Complex Skills

For substantial, fragile, or judgment-heavy skills, exercise realistic user
requests in fresh threads or subagents when that capability is available. Give
the evaluator the skill and raw task artifacts, not the intended answer,
suspected defect, authoring diagnosis, or hidden ground truth. Make the request
look like a real user task so success depends on reusable instructions.

Use independent contexts between passes, review the resulting artifacts and
traces, and remove test artifacts that could leak answers into later runs. If a
forward test succeeds only after it sees authoring context or prior conclusions,
tighten the skill before trusting it.

Ask the user before forward testing when it may take substantial time, require
new permission, spend meaningful money, or modify a live external system.
Otherwise run the smallest proportionate test, identify missing or inefficient
guidance, revise the skill, validate again, and repeat as needed.
