---
name: oo-create-skill
description: Author, generate, or scaffold a new local AI agent skill that turns a concrete oo connector action, including OOMOL-hosted Fusion API actions, into reusable instructions. Use when the user asks to create a skill, write a skill, or make a Codex/Claude/agent skill for an oo-powered workflow, even if capability discovery is needed first.
<!-- agentic:if agent=claude|hermes -->
allowed-tools: [Bash(oo *)]
<!-- agentic:endif -->
---

# oo Create Skill

Use this skill to create a new local skill around a concrete oo connector
action. This includes turning a known or newly discovered connector capability
into reusable agent instructions.

This skill only authors local skills. If the user wants to find or install an
existing skill, or distribute a finished skill, use the dedicated workflow for
that task instead.

This document has two roles:

- Authoring agent: the current agent creating the skill.
- Runtime agent: a future agent using the generated skill.

## Constitution

Use these rules to decide confidently. These governing principles define the
decision model. The workflow below is an application of this constitution, not a
separate checklist.

1. Scope is local skill authoring. Create local skills around concrete oo
   connector actions, including OOMOL-hosted Fusion API actions. Do not use this
   workflow to find, install, update, publish, or distribute existing skills.
2. User intent defines the reusable contract. Ask the user when a business
   decision would change the skill's repeated-use behavior: skill name or
   scope, workflow ordering, required user inputs, expected outputs, target
   service, account, cost, compliance, data routing, output destination, or a
   metadata ambiguity with multiple user-visible outcomes. Prefer a short
   choice prompt with a recommended option when asking; add a free-form input
   option only when the decision cannot be covered by concrete choices.
3. `oo` metadata and command output define execution facts. Do not ask the user
   to resolve facts that metadata, schemas, or command output can answer:
   connector service/action identifiers, payload field names, result field
   paths, command shape, authentication state, defaults, or schema constraints.
   Use `oo connector schema "<service>" --action "<action>"` to prove the
   selected action contract. Current command output or a safe invocation must
   confirm action availability; observed result paths are preferred when a safe
   invocation is proportionate, but result paths may also come from schema; if a
   field path is inferred from schema rather than observed, label it as
   untested.
4. Resolve and test before writing the runbook. Do not predesign the whole
   execution process and then look for metadata that seems to fit it. Discover
   the capability, inspect metadata, run the smallest safe test when command,
   result, status, file, or envelope shape matters, and write from observed
   facts. Do not spend meaningful user money, mutate external state, disclose
   sensitive data, or trigger large jobs only to learn a response shape. For
   cheap, non-sensitive artifact transforms with tiny synthetic inputs, run one
   representative invocation before finalizing unless the user or connector
   context makes that unsafe.
5. Choose the most direct executable connector action for the user's outcome.
   Use only connector entries as authoring candidates; treat non-connector
   entries as non-authoring catalog noise. During selection, classify service
   `fusion-api` as OOMOL-hosted Fusion API, which does not require the user to
   provide their own provider API key. After discovery, prefer a matching
   `fusion-api` action by default for generic managed transforms such as
   background removal, OCR, translation, transcription, TTS, image generation,
   and document conversion. Choose a non-Fusion connector action when the user
   explicitly names an external service, account, or provider; when Fusion API
   is unavailable or does not fit the required output; or when provider,
   account, cost, compliance, data-routing, or output-contract differences are
   material enough to require a user decision.
6. Preserve the local/remote connector file boundary. For connector or Fusion
   API execution, local files are not remotely addressable. Generated skills
   must tell future agents to upload a local file by default when the selected
   action input needs file content and its schema accepts a URI/URL-compatible
   value; run `oo file upload "<filePath>" --json` and pass the returned
   `downloadUrl`. Skip upload only when the user already provided a remote URL
   or when the schema explicitly requires a different supported input shape,
   such as an inline value or connector-specific file identifier. Save remote
   artifacts with `oo file download "<url>" [outDir] [--name "<name>"] [--ext
   "<ext>"]` only when the action schema or description identifies the output
   field as a downloadable artifact URL and the task needs a local file result.
   `oo file download` prints `Saved to: <path>` and does not support `--json`.
   Do not treat these file-transfer commands as capabilities to rediscover, do
   not hand-roll transfer logic, and do not pass local filesystem paths or
   `file://` URLs to remote connector actions unless the schema explicitly
   supports local paths.
7. Resolve user-provided files into readable runtime sources. For file, image,
   audio, video, or document workflows, generated skills must distinguish
   explicit local paths, remote URLs, environment-exposed attachment paths, and
   chat-visible media that the CLI cannot read directly. If a pasted or
   displayed attachment has no readable path or URL, say so and ask for a path
   or use a clearly labeled recent-file fallback only when practical. If
   multiple candidate files are present, compare concrete evidence such as
   path, timestamp, size, type, hash, or preview. If candidates differ and the
   intended source remains ambiguous, ask the user. If candidate hashes match,
   treat them as the same source and explain the chosen file briefly.
8. Generated skills are execution runbooks. Write a compact execution runbook,
   not API documentation. Keep generated skills concise and domain-focused.
   Include concrete connector service/action identifiers plus the minimum
   payload, result, file-transfer, artifact handoff, and failure guidance needed
   so future agents do not run discovery again. Omit broad oo mechanics, full
   schema dumps, and implementation details that the managed OO notice already
   covers. Make file artifacts visible to the user: when a generated skill can
   produce images, documents, archives, media, or other files, it must tell
   future agents to preview the artifact when practical, or otherwise deliver
   it with a clear path, attachment, link, or user-appropriate handoff. A
   successful file path alone is not enough if the user cannot see or access the
   result. For local artifact downloads, default to the input file's directory
   when the input was a local file; otherwise choose a user-accessible output
   directory such as Downloads or an explicit requested directory. Do not
   default generated artifacts into the current repository workspace unless the
   user asked for that destination.
9. Native skill commands are mandatory. Run the dedicated preflight, initialize
   with `oo skills init --agent <!-- agentic:var agent -->`, and validate with
   `oo skills validate`. Do not substitute manual file creation for native skill
   initialization.
10. Write generated skills in English regardless of the user's language,
   including `--description`, `--title`, frontmatter, headings, examples, and
   reference files. Preserve non-English only for literal runtime values,
   product names, language-pair requirements, or necessary sample I/O.

## Workflow

### 1. Check <!-- agentic:var agentTitle --> execution permissions

Run the dedicated preflight once before creating a skill:

```bash
oo skills preflight --agent <!-- agentic:var agent -->
```

Treat this as the <!-- agentic:var agentTitle --> permission and storage probe for <!-- agentic:var agentTitle -->'s native skills
directory. If it passes, proceed without extra permission discussion. If it or a
later required command is blocked by sandbox, write, or network limits, request
the smallest sufficient permission and name the blocked command. Common commands
are:

```bash
oo skills init <name> --agent <!-- agentic:var agent --> --description "..."
oo search "<query>" --keywords "<keywords>" --json
oo connector schema "<service>" --action "<action>"
```

If <!-- agentic:var agentTitle --> cannot request the needed permission, or the user denies it, stop and
ask the user to open the required access. Do not continue in the restricted
sandbox and do not guess service names, action names, inputs, or outputs.

Never work around a blocked `oo skills init --agent <!-- agentic:var agent -->` by manually creating
a skill directory elsewhere. Manual skeleton creation bypasses the agent-native
target directory, metadata writing, and OO notice insertion.

### 2. Capture reusable contract decisions

Collect these inputs from the user or infer them from existing context and `oo`
metadata:

- skill name
- workflow purpose
- known connector services, connector actions, or provider constraints
- user inputs the skill should collect
- workflow ordering and expected outputs
- likely user requests that should trigger the generated skill
- optional display title and icon preference

Follow the Constitution for when to ask. Ask when business intent would change
the reusable workflow; do not ask only for cosmetic details or facts that `oo`
metadata can resolve. Use a concise title and fitting icon reference: an emoji,
an image URL, or `:collection:icon:` from https://icones.js.org/.

### 3. Resolve the concrete connector action

Capability discovery may return multiple catalog result types. If the user has
not provided a complete connector action contract, use discovery before
authoring:

```bash
oo search "<goal>" --keywords "<comma-separated keywords>" --json
```

Do this even when the user mentions a model, product, provider name, or managed
API capability, unless the user already provided a complete current connector
contract. Shape `<goal>` as one short English outcome sentence for the current
external step, preserving the user's decisive constraints such as target
service, language pair, file type, and output format. Always pass `1` to `3`
keywords. Keywords may use the user's original language and must keep product,
brand, and proper names untranslated, for example keep `滴答清单` and do not
turn it into `TickTick`; the backend tokenizes keywords, while the free-text
query alone runs an untokenized semantic search. If those decisive business
constraints are missing and would change the reusable skill contract, ask the
user before discovery. Inspect the first result set before narrowing the query.

Use only connector entries as authoring candidates. Treat non-connector entries
as non-authoring catalog noise during this workflow: do not inspect them, do not
select them, and do not put non-connector references in the generated skill.

During selection, classify service `fusion-api` as OOMOL-hosted Fusion API,
which does not require the user to provide their own provider API key. When a
`fusion-api` action and a non-Fusion connector action can both satisfy the same
generic managed transform, prefer the `fusion-api` action by default. Choose a
non-Fusion connector only when the user explicitly requested that service,
account, or provider; when Fusion API is unavailable or does not fit the
required output; or when material provider, account, cost, compliance,
data-routing, or output-contract differences require a user decision.

Use `oo connector search "<goal>" --json` only to narrow a shortlisted connector
path, not to restart broad discovery. If the task looks like an OOMOL-hosted
managed API capability but the mixed result set has no `fusion-api` connector
candidate, run one connector narrowing pass before reporting that no Fusion API
action is available.

Do not choose a connector action unless current command output exposes it. If
command output does not expose the candidate action, or a non-destructive test
reports `unknown action`, choose an exposed action and document any runtime
shape change, such as async submission plus polling replacing a synchronous
call.

Keep the chosen connector action concrete in the generated skill.

### 4. Prove the selected action contract

For the selected action, capture the exact `service`, action `name`,
description, authentication state, and schema-derived input/output concepts.
Use the schema command before authoring the runbook:

```bash
oo connector schema "<service>" --action "<action>"
```

When result shape, status transitions, file return format, or envelope structure
will affect the runbook, run a minimal representative invocation or status/result
poll during authoring when safe and proportionate. Do not spend meaningful user
money, mutate external state, disclose sensitive data, or trigger large jobs
only to learn a response shape; ask the user or use documented dry-run or
read-only paths when those risks are material. If a field path is inferred from
schema rather than observed, label it as untested.

Record the full `oo connector run --json` response paths that future agents must
read, not only the connector payload's inner field names. If the CLI wraps the
connector payload under `data` and adds `meta`, make that envelope explicit, for
example `response.data.sessionId`, `response.data.state`, or
`response.data.data.image.url`. When useful, also state the inner connector
payload path separately.

### 5. Initialize the local skill

Run `oo skills init <name> --agent <!-- agentic:var agent -->` with a required `--description`.
Include `--title` and `--icon` when you have suitable values. Derive title and
icon from the workflow purpose and resolved metadata unless the user provided
them. If the selected <!-- agentic:var agentTitle --> skill directory already exists, ask for a different
skill name instead of overwriting.

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

Use the path printed by `oo skills init` as the skill directory for authoring
and validation.

Do not substitute manual file creation for this step. The initialized skill
directory must come from a successful `oo skills init --agent <!-- agentic:var agent -->`
invocation before you fill in its workflow instructions or run validation.

### 6. Author the generated skill runbook

Write the generated skill as a compact execution runbook, not API
documentation: enough for future agents to call the selected capability without
rediscovery, but not a full schema dump.

Keep the generated skill centered on runtime execution. Include authoring-time
evidence only when it affects runtime behavior, such as an untested schema-only
result path or an observed async polling requirement.

For selected connector action workflows, use domain-appropriate headings but
include these execution facts when metadata provides them:

- Runtime input policy: when to use the skill, required inputs, inputs that can
  be inferred or defaulted, optional inputs to omit when absent, and the exact
  missing runtime values that justify asking the user.
- Source resolution for file-like inputs: how to handle explicit local paths,
  remote URLs, environment-exposed attachment paths, chat-visible media with no
  readable CLI path, recent-file fallback, and multiple candidate files.
- Invocation: the exact `service.action` and minimal
  `oo connector run "<service>" --action "<action>" --data ... --json` command
  shape. Include a small payload skeleton with schema-derived field names. For
  long text, nested JSON, or quote/newline-heavy values, tell future agents to
  use `--data @payload.json` instead of inline shell JSON.
- Payload rules: required fields, defaultable fields, accepted file or URL
  forms, and schema constraints that affect user-visible behavior.
- Result handling: JSON field paths that contain the useful result,
  downloadable artifact URL, status, id, or human-readable output. Include full
  CLI response paths when `--json` adds an envelope, and label schema-only paths
  as untested. State what to report on success and what not to treat as the
  final result. For generated
  files, images, documents, archives, media, or other artifacts, state how
  future agents should preview them or deliver them to the user instead of only
  reporting a local path. For inline base64 or `data:` URI artifacts, tell
  future agents to save and preview the artifact rather than printing the full
  encoded payload.
- Async handling: for submit/poll/result workflows, include the status values,
  bounded retry policy, not-found or timeout stop conditions, and an early-exit
  rule that stops polling immediately when the terminal success state appears.
- Artifact destination and verification: choose a default output directory that
  avoids polluting an unrelated repository, use a non-conflicting name such as
  an original stem plus a suffix, report the actual saved path, and verify the
  artifact type after download. For transparent image outputs, require a PNG
  alpha/RGBA check and dimensions check when practical.
- Failure handling: action-specific stop conditions from schema or metadata,
  plus common auth, permission, billing, schema rejection, inaccessible file,
  timeout, and not-found branches.

Distill schema metadata into required/defaultable inputs and output field
paths; do not present any local cache path as a stable contract for future
agents.

When the workflow crosses the local/remote connector file boundary, include the
schema-driven `oo file upload` and `oo file download` guidance from the
Constitution in the generated skill.

When generated skill code needs an OOMOL-hosted LLM client, instruct future
agents to run `oo llm config --json` at runtime and use the returned `apiKey`,
`baseUrl`, and `model`. Do not hardcode, persist, log, or print the API key,
and do not tell future agents to read local auth files directly.

Review the frontmatter `description` before finishing: user-visible outcome
first, common request language, relevant artifacts, and user-visible services,
models, products, or workflow names when useful. Keep caveats, execution
details, negative guidance, and boundary cases in the workflow body unless they
prevent direct sibling-skill routing conflicts.

Preserve `metadata.title` when it exists. If you change the displayed title or
first heading, keep `metadata.title` aligned. If `metadata.title` or
`metadata.icon` is absent, add a suitable value.

The final skill must not instruct future agents to run `oo search`, `oo
connector search`, or discover capabilities at execution time. Include only the
selected connector service/action identity, command shape, payload rules, result
extraction, common stop conditions, and async or idempotency guidance that
observed metadata, output shape, or documented oo workflow exposes.

Before finishing, check that a future agent can reach the selected capability
without rediscovery, build a valid payload, read the useful result, and stop on
common failures. For file or artifact connector skills, also check that the
runbook answers:

- How does the runtime agent obtain a readable source from an explicit path,
  URL, exposed attachment path, or chat-visible media?
- What exact command uploads local files, invokes the connector, polls async
  status when needed, fetches results, and downloads artifacts?
- What full CLI JSON response path contains the job id, status, result text, or
  artifact URL?
- What condition stops polling immediately, and what conditions stop with a
  failure or bounded timeout?
- Where is the artifact downloaded by default, and does that avoid polluting an
  unrelated git workspace?
- How is the artifact verified after download, and what should be shown or
  reported to the user?

If any answer is missing, add only the missing execution guidance.

Keep `SKILL.md` concise. Use `references/workflow.md` only when the workflow
has several steps, decision rules, or examples.

### 7. Validate before finishing

After authoring the skill, run `oo skills validate "<skill-directory>"`. If
validation fails, fix the generic skill contract before reporting completion.
