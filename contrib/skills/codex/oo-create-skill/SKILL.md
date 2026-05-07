---
name: oo-create-skill
description: >-
  Author, generate, scaffold, or update a local AI agent skill that turns an
  OOMOL/oo package, connector action, block, or selected workflow into reusable
  instructions. Use when the user asks to create a skill, write a skill, make a
  Codex/Claude/agent skill, or refine an existing local skill for an oo-powered
  workflow, even if capability discovery is needed first.
---

# oo Create Skill

Use this skill to create or update a local skill around an OOMOL/oo package,
block, connector action, or selected workflow. This includes turning a known or
newly discovered capability into reusable agent instructions.

If the user only wants to discover or install existing published skills, use
`oo-find-skills`. If the user wants to publish a finished skill, use
`oo-publish-skill`.

## Constitution

Use these rules to decide confidently. The workflow below is an application of
this constitution, not a separate checklist.

1. User intent defines the reusable contract. Ask the user when a business
   decision would change the skill's repeated-use behavior: skill name or
   scope, workflow ordering, required user inputs, expected outputs, target
   service, account, cost, compliance, data routing, output destination, or a
   metadata ambiguity with multiple user-visible outcomes. Prefer a short
   choice prompt with a recommended option when asking; add a free-form input
   option only when the decision cannot be covered by concrete choices.
2. `oo` metadata and command output define execution facts. Do not ask the user
   to resolve facts that metadata, schemas, or command output can answer:
   package/block references, connector service/action identifiers, payload
   field names, result field paths, command shape, authentication state,
   defaults, or schema constraints. Treat local `schemaPath` files as supporting
   metadata; current command output or a safe invocation must confirm connector
   action availability and observed result paths.
3. Resolve and test before writing the runbook. Do not predesign the whole
   execution process and then look for metadata that seems to fit it. Discover
   the capability, inspect metadata, run the smallest safe test when command,
   result, status, file, or envelope shape matters, and write from observed
   facts. Mark schema-only inferences as untested. The generated skill must
   contain concrete package/block references or connector service/action
   identifiers plus the minimum payload, result, and failure guidance needed so
   future agents do not run discovery again.
4. Choose the most direct capability for the user's outcome. Treat Fusion API,
   ordinary connectors, packages, and blocks as first-class candidates. Prefer
   domain fit over result ordering. When choices are otherwise equivalent,
   choose Fusion API by default because it avoids user-managed provider
   credentials. Ask the user to choose only when provider, account, cost,
   compliance, data-routing, or output-contract differences are material.
5. Preserve the local/cloud boundary. Generated skills must tell future agents
   to use the agent-provided `oo-upload` helper for local attachments sent to
   cloud processing and `oo-download` for cloud artifacts saved locally. Do not
   treat these helpers as capabilities to rediscover, do not hand-roll transfer
   logic, and do not pass local filesystem paths to cloud actions unless the
   schema explicitly supports local paths.
6. Make file artifacts visible to the user. When a generated skill can produce
   images, documents, archives, media, or other files, it must tell future
   agents to preview the artifact when practical, or otherwise deliver it with
   a clear path, attachment, link, or user-appropriate handoff. A successful
   file path alone is not enough if the user cannot see or access the result.
7. Write a runbook, not API documentation. Keep generated skills concise and
   domain-focused. Include the facts needed to execute reliably; omit broad oo
   mechanics, full schema dumps, and implementation details that the managed OO
   notice already covers.

## Workflow

### 1. Check Codex execution permissions

Run the dedicated preflight once before creating or editing a skill:

```bash
oo skills preflight --agent codex
```

Treat this as the Codex permission and storage probe. If it passes, proceed
without extra permission discussion. If it or a later required command is
blocked by sandbox, write, or network limits, request the smallest sufficient
permission and name the blocked command. Common commands are:

```bash
oo skills init <name> ...
oo packages info "<packageName>" --json
oo search "<query>" --json
```

If Codex cannot request the needed permission, or the user denies it, stop and
ask the user to open the required access. Do not continue in the restricted
sandbox and do not guess package names, block names, inputs, or outputs.

Never work around a blocked `oo skills init` by manually creating a skill
directory elsewhere. Manual skeleton creation bypasses the managed canonical
location, metadata writing, agent publication links, and OO notice insertion.

### 2. Collect only the information needed

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

Follow the Constitution for when to ask. Ask when business intent would change
the reusable workflow; do not ask only for cosmetic details or facts that `oo`
metadata can resolve. Use a concise title and fitting icon reference: an emoji,
an image URL, or `:collection:icon:` from https://icones.js.org/.

### 3. Resolve concrete package, block, and connector references

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
language pair, file type, and output format. If those decisive business
constraints are missing and would change the reusable skill contract, ask the
user before discovery. Inspect the first result set before refining.

Treat Fusion API, connector, and package/block results as first-class authoring
candidates. Classify service `fusion-api` as OOMOL built-in Fusion API, which
does not require the user to provide their own API key. Apply the Constitution
to select the most direct capability. Blocks are flexible, but usually have
weaker performance and higher execution friction.

For connector-backed choices, capture the exact `service`, action `name`,
description, authentication state, and schema-derived input/output concepts.
Use `oo connector search "<goal>" --json` only to refine a shortlisted connector
path, not to restart broad discovery. Do not force a package or block reference
when the chosen reusable workflow is connector-backed.

Do not choose a connector action just because a local schema file exists. If
command output does not expose the candidate action, or a non-destructive test
reports `unknown action`, choose an exposed action and document any runtime
shape change, such as async submission plus polling replacing a synchronous
call.

When result shape, status transitions, file return format, or envelope structure
will affect the runbook, run a minimal representative invocation or status/result
poll during authoring when safe and proportionate. Do not spend meaningful user
money, mutate external state, disclose sensitive data, or trigger large jobs
only to learn a response shape; ask the user or use documented dry-run or
read-only paths when those risks are material. If a field path is inferred from
schema rather than observed, label it as untested.

Keep chosen packages, blocks, or connector actions concrete in the generated
skill.

### 4. Initialize the local skill

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

Do not substitute manual file creation for this step. The initialized skill
directory must come from a successful `oo skills init` invocation before you
edit its workflow instructions or run validation.

### 5. Author the workflow instructions

Write the generated skill as a compact execution runbook, not API
documentation: enough for future agents to call the selected capability without
rediscovery, but not a full schema dump. Reference packages with
`oo::packageName` and stable blocks with `oo::packageName::blockName`.

For connector-backed or Fusion API-backed workflows, use domain-appropriate
headings but include these execution facts when metadata provides them:

- Runtime input policy: when to use the skill, required inputs, inputs that can
  be inferred or defaulted, optional inputs to omit when absent, and the exact
  missing runtime values that justify asking the user.
- Invocation: the exact `service.action` and minimal
  `oo connector run "<service>" --action "<action>" --data ... --json` command
  shape. Include a small payload skeleton with schema-derived field names. For
  long text, nested JSON, or quote/newline-heavy values, tell future agents to
  use `--data @payload.json` instead of inline shell JSON.
- Payload rules: required fields, defaultable fields, accepted file or URL
  forms, and schema constraints that affect user-visible behavior.
- Result handling: JSON field paths that contain the useful result,
  downloadable artifact URL, status, id, or human-readable output. State what
  to report on success and what not to treat as the final result. For generated
  files, images, documents, archives, media, or other artifacts, state how
  future agents should preview them or deliver them to the user instead of only
  reporting a local path. For inline base64 or `data:` URI artifacts, tell
  future agents to save and preview the artifact rather than printing the full
  encoded payload.
- Failure handling: action-specific stop conditions from schema or metadata,
  plus common auth, permission, billing, schema rejection, inaccessible file,
  timeout, and not-found branches.

Distill any `schemaPath` metadata into required/defaultable inputs and output
field paths; do not present the local `schemaPath` as a stable contract for
future agents.

When the workflow crosses the local/cloud file boundary, include the
`oo-upload` and `oo-download` helper guidance from the Constitution in the
generated skill.

Review the frontmatter `description` before finishing: user-visible outcome
first, common request language, relevant artifacts, and user-visible services,
models, products, or workflow names when useful. Keep caveats, execution
details, negative guidance, and boundary cases in the workflow body unless they
prevent direct sibling-skill routing conflicts.

Preserve `metadata.title` when it exists. If you change the displayed title or
first heading, update `metadata.title` to match. If `metadata.title` or
`metadata.icon` is absent, add a suitable value.

The final skill must not instruct future agents to run `oo search`, `oo
connector search`, or discover capabilities at execution time. Include only the
selected package/block references or connector service/action identity, command
shape, payload rules, result extraction, common stop conditions, and async or
idempotency guidance that observed metadata, output shape, or documented oo
workflow exposes.

Before finishing, check that a future agent can reach the selected capability
without rediscovery, build a valid payload, read the useful result, and stop on
common failures. If not, add only the missing execution guidance.

Keep `SKILL.md` concise. Use `references/workflow.md` only when the workflow
has several steps, decision rules, or examples. Use `references/packages.json`
only when captured package metadata will help future updates.

### 6. Validate before finishing

After editing the skill, run `oo skills validate "<skill-directory>"`. If
validation fails, fix the generic skill contract before reporting completion.
