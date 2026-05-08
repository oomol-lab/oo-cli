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
- `--keywords` is optional and refines the connector side while keeping the
  same free-form text query.

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

Rank mixed results in this order:

1. Directness of the action or block relative to the user's goal
2. Whether the target service, destination, or output is explicitly named or
   strongly implied
3. Whether the candidate is ready to run, especially authenticated connector
   readiness
4. How many required inputs and follow-up questions it adds
5. How closely the documented output matches the user's desired outcome

Tie-breakers:

- Prefer a direct connector over a package when the user named a connected
  service and the connector is authenticated.
- Prefer a package when the user wants a managed transform that is not tied to
  an account service.
- If the returned array is empty or no candidate clearly fits, stop the current
  `oo` path and report that the catalog does not expose a good match.

## Build the next contract step

After selecting a candidate, do not execute yet.

- Package-backed candidate: inspect with
  `oo packages info "<packageSpecifier>" --json`, then read
  [package-execution.md](package-execution.md).
- Connector-backed candidate: read the cached schema file at `schemaPath`, then
  read [connector-execution.md](connector-execution.md).

Use the inspected metadata or schema to fill the capability contract fields:
callable id, required inputs, output semantics, and lifecycle.

## Refinement policy

- Refine only after inspecting the first result set.
- Use `--keywords` when the first search captured the general task but missed
  an important connector service, format, language, or destination constraint.
- Do not pass normalized keywords as extra positional arguments.
- If connector signal is still ambiguous after shortlisting, refine with:

```bash
oo connector search "<text>" --json
```

- Use `oo connector search` only to refine a chosen connector path, not to
  restart broad discovery from scratch.
