---
name: oo-create-skill
description: >-
  Author, generate, scaffold, or update a local AI agent skill that turns an
  OOMOL/oo package, connector action, block, or selected workflow into reusable
  instructions. Use when the user asks to create a skill, write a skill, make a
  Codex/Claude/agent skill, or refine an existing local skill for an oo-powered
  workflow, even if capability discovery is needed first.
allowed-tools: ["Bash(oo *)"]
---

# oo Create Skill

Use this skill to create or update a local skill around an OOMOL/oo package,
block, connector action, or selected workflow. This includes turning a known or
newly discovered capability into reusable agent instructions.

If the user only wants to discover or install existing published skills, use
`oo-find-skills`. If the user wants to publish a finished skill, use
`oo-publish-skill`.

## Operating Principles

Work like a confident authoring agent: gather facts from `oo` metadata, make
reasonable choices, write the skill, validate it, and interrupt the user only
for true blockers.

- Ask only for true blockers: an underivable skill name, a material service,
  cost/account, or output-destination choice, a blocked `oo` command or target
  conflict, or required inputs/outputs that metadata cannot answer.
- Otherwise decide and proceed. Derive the display title, icon, trigger
  description, capability selection, and workflow wording from the user's
  purpose and resolved metadata.
- Resolve capabilities once before authoring. The finished skill must contain
  concrete package/block references or connector service/action identifiers,
  not instructions for future agents to run discovery.
- Choose the capability that most directly satisfies the reusable workflow.
  Prefer domain fit over result ordering. When options are otherwise
  equivalent, choose Fusion API by default because it avoids user-managed
  provider credentials. Ask about an ordinary connector only when the user has
  stated provider, account, cost, compliance, or data-routing constraints.
- Treat local/cloud file transfer as a boundary. Generated skills must tell
  future agents to use the agent-provided `oo-upload` helper for local
  attachments sent to cloud processing and `oo-download` for cloud artifacts
  saved locally. Do not treat these helpers as capabilities to rediscover, do
  not hand-roll transfer logic, and do not pass local filesystem paths to cloud
  actions unless the schema explicitly supports local paths.
- Keep generated skills concise and domain-focused. Do not duplicate broad oo
  execution mechanics that the managed OO notice already provides.

## Workflow

### 1. Collect only the information needed

Collect these inputs from the user or infer them from existing context and `oo`
metadata:

- skill name
- workflow purpose
- known package names, connector services, or connector actions
- stable block names, when the user knows them
- user inputs the skill should collect
- workflow ordering and expected outputs
- likely user requests that should trigger the generated skill
- optional display title and icon preference

Follow the Operating Principles for when to ask. Do not ask only for cosmetic
details. Use a concise title and fitting icon reference: an emoji, an image URL,
or `:collection:icon:` from https://icones.js.org/.

### 2. Resolve concrete package, block, and connector references

If the user provides only package-level information, inspect the package before
writing the skill:

```bash
oo packages info "<packageName>" --json
```

Use the returned metadata to identify stable block references, input concepts,
and output concepts. Prefer the most specific safe reference:
`oo::packageName::blockName` when a block is clearly part of the intended
workflow, or `oo::packageName` only when the block must remain a deliberate
runtime choice based on user intent.

If the user does not know the package name, the connector action, or the
workflow clearly needs an additional capability, use mixed discovery before
authoring:

```bash
oo search "<goal>" --json
```

Shape `<goal>` as one short English outcome sentence for the current external
step, preserving the user's decisive constraints such as target service,
language pair, file type, and output format. Inspect the first result set
before refining.

Treat Fusion API, connector, and package/block results as first-class authoring
candidates. Classify service `fusion-api` as OOMOL built-in Fusion API, which
does not require the user to provide their own API key. Apply the capability
principle above; use a package/block only when no suitable Fusion API or
ordinary connector action exists. Blocks are flexible, but usually have weaker
performance and higher execution friction.

For connector-backed choices, capture the exact `service`, action `name`,
description, authentication state, and schema-derived input/output concepts.
Use `oo connector search "<goal>" --json` only to refine a shortlisted connector
path, not to restart broad discovery. Do not force a package or block reference
when the chosen reusable workflow is connector-backed.

Keep chosen packages, blocks, or connector actions concrete in the generated
skill.

### 3. Initialize the local skill

When creating a new skill, run `oo skills init <name>` with required
`--description`, `--title`, and `--icon` values. Derive title and icon from the
workflow purpose and resolved metadata unless the user provided them. If the
canonical directory or an agent target already exists, ask for a different skill
name instead of overwriting.

Make `--description` a user-facing trigger summary: it becomes the frontmatter
description and the main signal future agents see before loading the skill.
Start with the user outcome. Include natural request verbs, domain nouns,
important input artifacts, expected outputs, and user-visible product, model,
service, or workflow names that improve matching.

Prefer one or two concise sentences over a generic label. The description
should answer what the skill does and what users would ask. Keep operational
details, routing caveats, identifiers, schema details, command syntax, and
negative conditions in the workflow body unless they are natural user-facing
terms.

Use this description shape when helpful:
`<Primary user outcome>. Use when the user asks to <common verbs/request
phrases> for <domain objects or input artifacts>, especially when they need
<expected output/result>.`

### 4. Author the workflow instructions

Write the generated skill in domain terms: when to use it, what to ask the
user, which workflow steps to follow, and what outputs to report. Reference
packages with `oo::packageName` and stable blocks with
`oo::packageName::blockName`. For connector-backed workflows, name the exact
`service.action` and include the minimal `oo connector run "<service>"
--action "<action>" --data '<json>' --json` command shape with schema-derived
input and output concepts. Do not present a local `schemaPath` as a stable
contract for future agents.

When the workflow crosses the local/cloud file boundary, include the
`oo-upload` and `oo-download` helper guidance from the Operating Principles in
the generated skill.

Review the frontmatter `description` before finishing: user-visible outcome
first, common request language, relevant artifacts, and user-visible services,
models, products, or workflow names when useful. Keep caveats, execution
details, negative guidance, and boundary cases in the workflow body unless they
prevent direct sibling-skill routing conflicts.

Preserve `metadata.title` when it exists. If you change the displayed title or
first heading, update `metadata.title` to match. If `metadata.title` or
`metadata.icon` is absent, add a suitable value.

The final skill must contain concrete package/block references or connector
service/action identifiers. It must not instruct future agents to run `oo
search`, `oo connector search`, or discover capabilities at execution time.

Do not duplicate broad oo execution mechanics. For connector-backed workflows,
include only the selected service/action identity, the small connector command
shape, and schema-derived payload rules.

Keep `SKILL.md` concise. Use `references/workflow.md` only when the workflow
has several steps, decision rules, or examples. Use `references/packages.json`
only when captured package metadata will help future updates.

### 5. Validate before finishing

After editing the skill, run `oo skills validate "<skill-directory>"`. If
validation fails, fix the generic skill contract before reporting completion.
