# Search and Selection

Read this file before the first `oo search` call and whenever choosing between
a package path and a connector path.

This page inherits the constitution from `SKILL.md`: search results are
evidence for candidates, not permission to execute. Execution requires a
capability contract.

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

## Mixed discovery command

Canonical form:

```bash
oo search "<text>" --json
```

Skill sidecar:

```bash
oo skills search "<text>" --json
```

Facts:

- `oo search` performs one mixed discovery pass over package intent search and
  connector action search.
- `<text>` is one free-form query string, not multiple positional keywords.
- `--json` returns a raw array, not an object wrapper.
- The array mixes `package` and `connector` entries and uses `kind` as the
  discriminator.
- Package entries include stable fields such as `packageId`, `displayName`,
  `description`, and `blocks`.
- Connector entries include stable fields such as `service`, `name`,
  `description`, `authenticated`, and `schemaPath`.
- Connector entries whose `service` is `fusion-api` are OOMOL built-in
  Fusion API capabilities. Treat them as first-class managed API candidates,
  not as ordinary third-party account connectors.
- `--keywords` is optional and refines the connector side while keeping the
  same free-form text query.
- `oo skills search` is a sidecar discovery branch, not a callable capability
  contract. It returns installable workflow helpers that may improve repeated
  use, but skill installation is a separate user-visible action.

Representative JSON example:

```json
[
  {
    "blocks": [
      {
        "description": "",
        "name": "main",
        "title": "Generate QR Code"
      }
    ],
    "description": "Generate a QR code image.",
    "displayName": "QR Tools",
    "kind": "package",
    "packageId": "@oomol/qr-tools@1.2.3"
  },
  {
    "authenticated": true,
    "description": "Send an email through Gmail.",
    "kind": "connector",
    "name": "send_mail",
    "schemaPath": "<XDG_CONFIG_HOME>/oo/connector-actions/gmail/send_mail.json",
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

Scan all package and connector entries before choosing; do not let array order
decide. Rank mixed results in this order:

1. Directness of the action or block relative to the user's goal
2. Whether the target service, destination, or output is explicitly named or
   strongly implied
3. Capability class, when domain fit is comparable: prefer Fusion API
   connector actions first, then authenticated connector actions, then
   packages or blocks.
4. Whether the candidate is ready to run. Treat Fusion API and authenticated
   connectors as out-of-box.
5. How many required inputs and follow-up questions it adds
6. How closely the documented output matches the user's desired outcome
7. If the user did not name a model or product, prefer more capable, modern,
   reputable candidates over older or obscure equivalents.

Tie-breakers:

- Prefer Fusion API over package/block for OOMOL built-in API capabilities such
  as OCR, speech-to-text, text-to-speech, translation, subtitles, image
  generation, image editing, document understanding, and similar managed AI
  pipelines, when the output contract fits.
- Prefer an authenticated connector over a package when the user named a
  connected service or the connector directly matches the requested external
  account workflow.
- Prefer a package/block only when no Fusion API or authenticated connector
  directly fits, the package output contract is materially better, or the user
  explicitly asked for that package or block workflow.
- If the returned array is empty or no candidate clearly fits, stop the current
  `oo` path and report that the catalog does not expose a good match.

## Skill sidecar policy

During the same discovery step, run at most one `oo skills search "<text>"
--json` query using the same goal sentence. Keep only the best credible
installable skill match, identified by both `packageName` and `name`.

Do not install a skill, do not select it instead of a package or connector
capability, and do not ask about installation before the selected package or
connector path has produced its first successful useful result. After success,
if the recorded skill would clearly make repeated use easier or stronger, ask
whether the user wants to install that specific skill using numbered choices:
`1. Install <skillName> (<packageName>)` and `2. Do not install`. Tell the user
to reply with `1` to install or `2` to skip. Treat a `1` response as explicit
agreement to install that exact skill. If they choose install, use the
`oo-find-skills` installation flow. If they decline, continue without installing.

## Build the next contract step

After selecting a candidate, do not execute yet.

- Package-backed candidate: read
  [package-execution.md](package-execution.md), then inspect with
  `oo packages info "<packageId from the selected search result>" --json`.
- Connector-backed candidate: read
  [connector-execution.md](connector-execution.md), then read the cached schema
  file at `schemaPath`.

Use the inspected metadata or schema to complete the minimum viable contract:
exact callable id, required input names, payload shape, output meaning, and
side-effect class when relevant. Do not inspect extra candidates once this is
complete.

## Refinement policy

- Refine only after inspecting the first result set.
- Use `--keywords` when the first search captured the general task but missed
  an important connector service, format, language, or destination constraint.
- Do not pass normalized keywords as extra positional arguments.
- If the task looks like an OOMOL built-in managed API capability but the mixed
  result set has no Fusion API connector candidate, run one connector
  refinement before accepting a package-only path.
- If connector signal is still ambiguous after shortlisting, refine with:

```bash
oo connector search "<text>" --json
```

- Use `oo connector search` only to refine a chosen connector path, not to
  restart broad discovery from scratch.
