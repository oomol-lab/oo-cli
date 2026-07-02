---
name: oo-create-skill
description: Author, generate, adopt, or document a local AI agent skill from either an existing local workflow directory or a concrete oo connector action. Use when the user asks to create a skill, write a skill, adopt an existing workflow, document a local script as a skill, or make an agent skill for an oo-powered workflow.
<!-- agentic:if agent=claude|hermes -->
allowed-tools: [Bash(oo *)]
<!-- agentic:endif -->
---

# oo Create Skill

Use this skill to create or adopt a local skill. The authoring agent either
turns an existing local workflow directory into a reusable runtime runbook, or
turns a known or newly discovered `oo` connector action into reusable runtime
instructions for future agents.

This workflow only authors local skills. If the user wants to find or install an
existing skill, or distribute a finished skill, use the dedicated workflow for
that task instead.

## Constitution

Use these rules to decide confidently. They define the governing model; the
workflow below is an application of this constitution, not a separate checklist.
When rules appear to compete, use this priority order: safety, local authoring
scope, existing workflow evidence, proven connector contract when applicable,
reusable user intent, compact runtime runbook, then convenience.

1. Local authoring only. Create new local skills or adopt existing local
   workflow directories. For existing scripts, configs, tests, docs, and output
   conventions, treat the existing directory as the source of truth and use
   native `oo skills adopt` to add the skill contract. For connector workflows,
   create skills around concrete `oo` connector actions, including OOMOL-hosted
   Fusion API actions. Do not use this workflow to find, install, update,
   publish, or distribute existing skills, or bypass native skill commands with
   manual skeleton creation.
2. Ask for reusable intent; prove execution facts. Ask the user only when a
   business decision would change repeated runtime behavior: skill name or
   scope, workflow ordering, required user inputs, expected outputs, target
   service, account, cost, compliance, data routing, output destination, or a
   metadata ambiguity with multiple user-visible outcomes. Prefer a short
   choice prompt with a recommended option; add free-form input only when
   concrete choices cannot cover the decision. Do not ask the user to resolve
   facts that `oo` metadata, schemas, or command output can answer, including
   connector service/action identifiers, payload field names, result field
   paths, command shape, authentication state, defaults, and schema constraints.
3. Evidence outranks memory. For existing local workflows, inspect current files
   and use safe local command output or tests when they are proportionate. For
   connector workflows, a callable contract exists only when current command
   output and `oo connector schema "<service>" --action "<action>"` prove the
   selected service/action, required inputs, and output semantics. Do not invent
   connector facts from prior knowledge, examples, old runs, or catalog guesses.
4. Resolve before designing. Do not predesign the whole execution process and
   then look for metadata that seems to fit it. Discover the capability, inspect
   metadata, and write from current evidence.
5. Test only when the test is safer than the uncertainty. Run the smallest
   representative invocation when command shape, result shape, status
   transitions, file return format, or envelope structure affects the generated
   skill and the test is cheap, non-sensitive, non-destructive, and
   proportionate. Do not spend meaningful user money, mutate external state,
   disclose sensitive data, or trigger large jobs only to learn a response
   shape. If a result field path is inferred from schema rather than observed,
   label it as untested.
6. Select the most direct executable action. Use only connector entries as
   authoring candidates and treat non-connector entries as non-authoring catalog
   noise. Prefer the connector action that most directly produces the user's
   outcome. For generic managed transforms such as background removal, OCR,
   translation, transcription, TTS, image generation, and document conversion,
   prefer a matching `fusion-api` action by default unless the user, schema,
   required output, provider, account, cost, compliance, data-routing, or
   output-contract constraints require another connector.
7. Secondary search is repair, not exploration. Inspect the first result set
   before narrowing. Use `oo connector search "<goal>" --json` only to repair a
   known discovery gap in a shortlisted connector path, not to restart broad
   discovery.
8. Preserve file and artifact boundaries. Local files are not remote connector
   inputs unless the schema explicitly supports local paths. Use `oo file upload "<filePath>"
   --json` only as a temporary source adapter when the selected connector action
   needs a remote URI/URL-compatible input and the user has only a local file;
   pass the returned `downloadUrl` into the connector action. Use
   connector-native upload/import/attach/create-file actions for user-visible
   upload, import, attach, save, or materialize outcomes. Save remote artifacts
   with `oo file download "<url>" [outDir] [--name "<name>"] [--ext "<ext>"]`
   only when the action schema or description identifies a downloadable artifact
   URL and the task needs a local file result; `oo file download` prints
   `Saved to: <path>` and does not support `--json`. A file-producing skill is
   not complete until future agents can preview, attach, link, save, or
   otherwise hand off the artifact in a way the user can access. Do not default
   generated artifacts into the current repository workspace unless the user
   asked for that destination.
9. Generated skills are execution runbooks. Write a compact execution runbook,
    not API documentation. Include the minimum service/action identity, input,
    payload, result, file-transfer, artifact handoff, async, idempotency, and
    failure guidance needed for future agents to execute without rediscovery.
    Include a section only when it changes runtime behavior. Omit broad `oo`
    mechanics, full schema dumps, and implementation details already covered by
    the managed OO notice.
10. Write generated skills in English regardless of the user's language,
    including `--description`, `--title`, frontmatter, headings, examples, and
    reference files. Preserve non-English only for literal runtime values,
    product names, language-pair requirements, or necessary sample I/O.

## Authoring State Machine

Move through these states. First classify the workflow. Use the local workflow
path when the user points to an existing directory, says a script/config already
runs, asks to solidify or document existing work, or asks to adopt an existing
workflow. Use the connector path only when the reusable behavior depends on an
OOMOL connector, Fusion API action, or another hosted `oo connector` action.
Skip a state only when current evidence already proves its exit condition.

### 1. Permission Probe

Run the dedicated preflight once before creating a skill:

```bash
oo skills preflight --agent <!-- agentic:var agent -->
```

Treat this as the <!-- agentic:var agentTitle --> permission and storage probe
for <!-- agentic:var agentTitle -->'s native skills directory. If it passes,
proceed without extra permission discussion. If it or a later required command
is blocked by sandbox, write, or network limits, request the smallest sufficient
permission and name the blocked command. Common commands are:

```bash
oo skills init <name> --agent <!-- agentic:var agent --> --description "..."
oo search "<query>" --json
oo connector schema "<service>" --action "<action>"
```

If <!-- agentic:var agentTitle --> cannot request the needed permission, or the
user denies it, stop and ask the user to open the required access. Do not
continue in the restricted sandbox and do not guess service names, action names,
inputs, or outputs.

Never work around a blocked `oo skills init --agent <!-- agentic:var agent -->`
by manually creating a skill directory elsewhere. Manual skeleton creation
bypasses the agent-native target directory, metadata writing, and OO notice
insertion.

Exit condition: required native skill commands can run, or the blocked command
and required access have been reported.

### 2. Intent Contract

Capture the reusable skill contract from the user, current context, or proven
`oo` evidence:

- skill name
- workflow purpose
- known connector services, connector actions, or provider constraints
- user inputs the skill should collect
- workflow ordering and expected outputs
- likely user requests that should trigger the generated skill
- optional display title and icon preference

Ask only under the Constitution's reusable-intent rule. Do not ask only for
cosmetic details or facts that `oo` metadata can resolve. Use a concise title
and fitting icon reference: an emoji, an image URL, or `:collection:icon:` from
https://icones.js.org/.

Exit condition: the repeated-use behavior is clear enough to search or inspect a
connector action without guessing business intent.

### 3. Capability Discovery

Skip this state for existing local workflow adoption. Do not run `oo search`,
`oo connector search`, or `oo connector schema` merely to document a local
script or configuration workflow. Instead inspect the local directory, identify
entrypoint commands, required files, generated outputs, validation steps, and
failure modes from current files and safe command output.

Capability discovery may return multiple catalog result types. If the user has
not provided a complete connector action contract, use discovery before
authoring:

```bash
oo search "<goal>" --json
```

Do this even when the user mentions a model, product, provider name, or managed
API capability, unless the user already provided a complete current connector
contract. Shape `<goal>` as one short English outcome sentence for the current
external step, preserving the user's decisive constraints such as target
service, language pair, file type, and output format. Name the target service
when known, and keep product, brand, and proper names exactly as the user wrote
them, for example keep `滴答清单` and do not turn it into `TickTick`, since the
free-text query is the only discovery signal and a translated name can map onto
a different global product. If those decisive business constraints are missing
and would change the reusable skill contract, ask the user before discovery.
Inspect the first result set before narrowing the query.

Use only connector entries as authoring candidates. Treat non-connector entries
as non-authoring catalog noise during this workflow: do not inspect them, do not
select them, and do not put non-connector references in the generated skill.

For file workflows, search and select by the user-visible destination action,
not by the transfer mechanism. Use search results and `oo connector schema` to
prove whether the target connector exposes the needed upload, import, attach,
create-file, or materialize action.

Apply the Constitution's Fusion tie-breaker during selection: classify
`fusion-api` as OOMOL-hosted Fusion API, prefer it for generic managed
transforms, and use non-Fusion connectors only when user intent or contract
constraints require them. Fusion API actions are connector actions in this
workflow; prove them with the same schema command, using `fusion-api` as the
service.

Use `oo connector search "<goal>" --json` only to narrow a shortlisted connector
path, not to restart broad discovery. If the task looks like an OOMOL-hosted
managed API capability but the result set has no `fusion-api` connector
candidate, run one connector narrowing pass before reporting that no Fusion API
action is available.

Do not choose a connector action unless current command output exposes it. If
command output does not expose the candidate action, or a non-destructive test
reports `unknown action`, choose an exposed action and document any runtime
shape change, such as async submission plus polling replacing a synchronous
call.

Keep the chosen connector action concrete in the generated skill.

Exit condition: one exposed connector action is selected, with at most one
fallback reserved for a named blocker.

### 4. Capability Contract

For existing local workflow adoption, capture the local contract instead of a
connector contract: source directory, entrypoint scripts or commands, working
directory, required input files/configuration, environment variables or
credentials, generated outputs, validation commands, and failure conditions. Run
only safe local checks that are proportionate and do not mutate user data unless
the user asked for that behavior.

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

Exit condition: the selected action has a proven contract, and any schema-only
runtime path that matters is explicitly marked untested.

### 5. Initialize Skill

For an existing local workflow directory, run `oo skills adopt "<path>" --agent <!-- agentic:var agent -->`
with a required `--description` unless the existing `SKILL.md` already has one.
Include `--name`, `--title`, and `--icon` when you have suitable values. Existing
workflow files are the source of truth; do not overwrite scripts, configs,
docs, references, tests, or user artifacts.

For a new connector workflow, run `oo skills init <name> --agent <!-- agentic:var agent -->`
with a required `--description`. Include `--title` and `--icon` when you have
suitable values. Derive title and icon from the workflow purpose and resolved
metadata unless the user provided them. If the selected <!-- agentic:var agentTitle -->
skill directory already exists, use `oo skills adopt` only when it is the
existing workflow the user wants to solidify; otherwise ask for a different
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

Use the path printed by `oo skills init` or `oo skills adopt` as the skill
directory for authoring and validation.

Do not substitute manual file creation for this step. New connector skills must
come from a successful `oo skills init --agent <!-- agentic:var agent -->`
invocation. Existing local workflows must come from a successful
`oo skills adopt "<path>" --agent <!-- agentic:var agent -->` invocation before
you fill in or patch workflow instructions or run validation.

Write all generated skill prose in English, including frontmatter, headings,
examples, and reference files. Preserve non-English only for literal runtime
values, product names, language-pair requirements, or necessary sample I/O.

Exit condition: the native skill directory exists, includes the managed OO
notice, and has a user-facing trigger description.

### 6. Author Runtime Runbook

Write the generated skill as a compact execution runbook, not API
documentation: enough for future agents to call the selected capability without
rediscovery, but not a full schema dump.

Keep the generated skill centered on runtime execution. Include authoring-time
evidence only when it affects runtime behavior, such as an untested schema-only
result path or an observed async polling requirement.

For existing local workflows, use domain-appropriate headings and describe only
runtime facts future agents need: when to use the skill, required files/configs,
entrypoint commands, working directory, environment variables, outputs,
validation, artifact handoff, and failure handling.

For selected connector action workflows, use domain-appropriate headings.
Include only execution facts that change runtime behavior:

- Runtime input policy: when to use the skill, required inputs, inputs that can
  be inferred or defaulted, optional inputs to omit when absent, and the exact
  missing runtime values that justify asking the user.
- Source resolution for file-like inputs: how to handle explicit local paths,
  remote URLs, environment-exposed attachment paths, chat-visible media with no
  readable CLI path, recent-file fallback, and multiple candidate files. If
  candidate hashes match, treat them as the same source and explain the chosen
  file briefly.
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
  final result. For generated files, images, documents, archives, media, or
  other artifacts, state how future agents should preview them or deliver them
  to the user instead of only reporting a local path. For inline base64 or
  `data:` URI artifacts, tell future agents to save and preview the artifact
  rather than printing the full encoded payload.
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

Distill schema metadata into required/defaultable inputs and output field paths;
do not present any local cache path as a stable contract for future agents.

When the workflow crosses the local/remote connector file boundary, document the
actual file route. If `oo file upload` is needed, describe it only as a
temporary OO transfer URL used to feed the selected connector action. Also
document the connector-native action that performs the final upload, import,
attachment, or target-service write. If the connector schema accepts a remote
URL, inline content, connector file id, or another supported file input shape
directly, use that schema-driven input shape and do not add an unnecessary
`oo file upload` step.

When generated skill code needs an OOMOL-hosted LLM client, instruct future
agents to run `oo llm config --json` at runtime and use the returned `apiKey`,
`baseUrl`, and `model`. Do not hardcode, persist, log, or print the API key,
and do not tell future agents to read local auth files directly.

Before validation, re-check the trigger description and presentation metadata
against the Initialize Skill contract. Preserve `metadata.title` when it exists;
if you change the displayed title or first heading, keep `metadata.title`
aligned. If `metadata.title` or `metadata.icon` is absent, add a suitable value.

The final skill must not instruct future agents to run `oo search`, `oo
connector search`, or discover capabilities at execution time. Include only the
selected connector service/action identity, command shape, payload rules, result
extraction, common stop conditions, and async or idempotency guidance that
observed metadata, output shape, or documented oo workflow exposes.

Exit condition: a future agent can reach the selected capability without
rediscovery, build a valid payload, read the useful result, and stop on common
failures.

## Final Acceptance Check

Before finishing, verify the generated skill against the Constitution and answer
only the runtime questions that apply:

- Source: how required runtime inputs are obtained, or when to ask.
- Invoke: the exact selected service/action and payload shape.
- Result: the full CLI JSON path for useful output, status, id, or artifact URL.
- Async: terminal success, failure, timeout, and polling rules when applicable.
- Artifact: destination, preview/handoff, and verification when files are
  produced.
- Failure: auth, billing, permission, schema, inaccessible input, not-found, and
  action-specific stop conditions.

If any answer is missing, add only the missing execution guidance.

Keep `SKILL.md` concise. Use `references/workflow.md` only when the workflow
has several steps, decision rules, or examples.

### 7. Validate Before Finishing

After authoring the skill, run `oo skills validate "<skill-directory>"`. If
validation fails, fix the generic skill contract before reporting completion.
