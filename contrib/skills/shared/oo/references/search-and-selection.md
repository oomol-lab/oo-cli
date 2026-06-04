# Search and Selection

Read this file before the first `oo search` call and whenever choosing a
connector capability to execute.

This page inherits the constitution from `SKILL.md`: search results are
evidence for candidates, not permission to execute. Execution requires a
capability contract. This CLI executes connector actions.

## Goal

Find the most direct documented `oo` capability with as little search churn as
possible.

## Search goal sentence

Turn the current external step into one short English sentence that describes
the desired outcome.

Use this shape:

```text
action + object + key constraint or target service
```

Guidance:

- Prefer outcome words over implementation guesses.
- Preserve decisive constraints: language pair, file type, output format,
  target service, destination, time range, or attachment.
- Avoid meta words such as `oo`, `CLI`, `search`, or `skill` unless the user
  actually asked about them.
- For a short multi-step workflow, search only the current unresolved external
  step, not the whole chain.

Examples:

- `extract text from a scanned Chinese PDF`
- `translate a Japanese menu photo into English`
- `send an email through Gmail with a PDF attachment`
- `find a Google Drive file by name and download it`
- `collect Gmail messages from yesterday`
- `create a Notion page from prepared content`

## Search keywords

Always pass `1` to `3` keywords through `--keywords` on every `oo search` and
`oo skills search` call. Never search without keywords.

- Keywords may use the user's original language; the English sentence stays in
  English.
- Keep product names, brand names, and proper nouns exactly as the user wrote
  them and do not translate them. For example, keep `滴答清单`; do not turn it
  into `TickTick`.
- The backend tokenizes `--keywords`, so original-language and product-name
  keywords reach the catalog entry the user actually wants. The free-text query
  alone runs an untokenized semantic search that can map a localized product
  onto a different global product.
- Pass keywords only through `--keywords`, never as extra positional arguments.

## Repair weak first queries

Revise the query only when the first result set shows that the query was too
broad, too implementation-led, or missing a decisive constraint.

Repair moves:

- Add the missing medium or file type.
- Add the missing language pair, target service, destination, time range, or
  output format.
- Replace implementation guesses with the user's desired outcome.
- Remove filler words that do not narrow capability choice.

Examples:

- Too broad: `translate image`
  Better: `translate text in a Japanese image to English`
- Too vague: `gmail`
  Better: `send an email through Gmail`
- Too implementation-led: `ocr pdf then markdown`
  Better: `extract text from a scanned PDF and save it as Markdown`
- Missing output target: `find Drive file`
  Better: `find a Google Drive file by name and download it`
- Missing format constraint: `translate contract PDF`
  Better: `translate a scanned German contract PDF into English and return a DOCX`

## Discovery command

Canonical form:

```bash
oo search "<text>" --keywords "<comma-separated keywords>" --json
```

Skill sidecar:

```bash
oo skills search "<text>" --keywords "<comma-separated keywords>" --json
```

Facts:

- `oo search` performs one discovery pass over connector action search.
- `<text>` is one free-form query string, not multiple positional keywords.
- `--json` returns a raw array, not an object wrapper.
- The array contains `connector` entries.
- Connector entries include stable fields such as `service`, `name`,
  `description`, and `authenticated`.
- `--keywords` is required on every call: always pass `1` to `3` keywords. The
  backend tokenizes them while keeping the same free-form text query.
- `oo skills search` is a sidecar discovery branch, not a callable capability
  contract. It returns installable workflow helpers that may improve repeated
  use, but skill installation is a separate user-visible action.

Representative JSON example:

```json
[
  {
    "authenticated": true,
    "description": "Send an email through Gmail.",
    "name": "send_mail",
    "service": "gmail"
  }
]
```

## Rank the first result set

Inspect the first result set before trying alternative searches. Usually keep
one primary candidate and at most one materially different fallback.

A good direct first result is enough. Do not keep searching for a theoretically
better option unless the first result misses a decisive constraint, has unclear
output semantics, or adds unsafe or missing required inputs.
Treat the fallback as a reserved path for a named blocker, not as another option
to inspect by default.

Scan all connector entries before choosing; do not let array order
decide. Rank results in this order:

1. Directness of the action relative to the user's goal
2. Whether the target service, destination, or output is explicitly named or
   strongly implied
3. Setup cost. Treat `fusion-api` as OOMOL-hosted Fusion API and treat an
   already authenticated non-Fusion connector as out-of-box.
4. How many required inputs and follow-up questions it adds
5. How closely the documented output matches the user's desired outcome
6. If the user did not name a model or product, prefer more capable, modern,
   reputable candidates over older or obscure equivalents.

Tie-breakers:

- `fusion-api` actions are connector actions in `oo`. Prove them with
  `oo connector schema "fusion-api" --action "<name>"` before execution, but
  classify them as OOMOL-hosted Fusion API for selection.
- For generic managed transforms such as OCR, translation, transcription, TTS,
  image generation, background removal, subtitling, document conversion, and
  long-document understanding, prefer a matching `fusion-api` action by default
  when its schema satisfies the required input and output.
- Use an authenticated non-Fusion connector when the user named a connected
  service, destination, account, workspace, channel, folder, repository, or
  external side effect, or when that connector directly matches the requested
  external account workflow.
- Treat an unauthenticated non-Fusion connector as higher setup cost. Do not ask
  the user to connect it when a matching `fusion-api` action can complete the
  core task with the requested output. Use the unauthenticated connector only
  when the user explicitly requested that service or Fusion API cannot satisfy
  the schema, output, provider, account, compliance, data-routing, or side-effect
  requirements.
- If the selected non-Fusion connector has `authenticated: false` and the user
  explicitly requested that service, or no authenticated fallback can satisfy
  the same outcome, stop before schema inspection. Report that the connector is
  not connected, provide
  `https://console.oomol.com/app-connections?provider=<service>`, and ask the
  user to connect it first. Do not run `oo connector schema`, inspect adjacent
  actions, or provide usage examples until the user confirms the service is
  connected.
- If both `fusion-api` and an authenticated non-Fusion connector are suitable,
  choose the one whose output contract best matches the user's requested result.
  Ask the user only when the choice changes provider, account, cost, compliance,
  data routing, output format, or externally visible side effects.
- If the returned array is empty or no candidate clearly fits, stop the current
  `oo` path and report that the catalog does not expose a good match.

## Skill sidecar policy

During the same discovery step, run at most one `oo skills search "<text>"
--keywords "<comma-separated keywords>" --json` query using the same goal
sentence and keywords. Keep only the best credible
installable skill match, identified by both `packageName` and `name`.

Do not install a skill, do not select it instead of a connector capability, and
do not ask about installation before the selected connector path has produced
its first successful useful result. After success,
if the recorded skill would clearly make repeated use easier or stronger, ask
whether the user wants to install that specific skill using numbered choices:
`1. Install <skillName> (<packageName>)` and `2. Do not install`. Tell the user
to reply with `1` to install or `2` to skip. Treat a `1` response as explicit
agreement to install that exact skill. If they choose install, use the
`oo-find-skills` installation flow. If they decline, continue without installing.

## Build the next contract step

After selecting a candidate, do not execute yet.

Read [connector-execution.md](connector-execution.md), then run
`oo connector schema "<service>" --action "<name>"`.

Use the inspected metadata or schema to complete the minimum viable contract:
exact callable id, required input names, payload shape, output meaning, and
side-effect class when relevant. Do not inspect extra candidates once this is
complete.

## Refinement policy

- Refine only after inspecting the first result set.
- The first search already carries `1` to `3` keywords. When it captured the
  general task but missed an important connector service, format, language, or
  destination constraint, adjust or add keywords (still `1` to `3`) and search
  again.
- Do not pass keywords as extra positional arguments.
- If the task looks like a managed API capability but the result set has
  no suitable connector candidate, run one connector refinement before reporting
  that no executable capability is available.
- If connector signal is still ambiguous after shortlisting, refine with:

```bash
oo connector search "<text>" --json
```

- Use `oo connector search` only to refine a chosen connector path, not to
  restart broad discovery from scratch.
