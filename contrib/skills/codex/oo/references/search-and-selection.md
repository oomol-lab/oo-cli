# Search and Selection

Read this file before the first `oo search` call and whenever choosing between a
package path and a connector path.

## Goal

Find the most direct documented `oo` capability with as little search churn as
possible.

## Start with one English goal sentence for the current external step

Turn the user request into one short English sentence that describes the
desired outcome for the current search step.

For short multi-step workflows, do not force the whole workflow into one search
query. Break the task into a short ordered chain of subgoals and search the
current unresolved external step first.

Guidance:

- Prefer `action + object + key constraint or target service`.
- Keep the first search intent outcome-oriented rather than implementation-led.
- Preserve useful constraint words such as language pair, file type, output
  format, or target service.
- Avoid meta words such as `oo`, `CLI`, `search`, or `skill` unless the user
  actually asked about them.

Examples:

- `extract text from a scanned Chinese PDF`
- `translate a Japanese menu photo into English`
- `send an email through Gmail with a PDF attachment`
- `find a Google Drive file by name and download it`
- `collect Gmail messages from yesterday`
- `create a Notion page from prepared content`

## Repair a weak first query

Revise the first query when the result set shows that the query was too broad,
too implementation-led, or missing a decisive constraint.

Common repair moves:

- Add the missing medium or file type.
- Add the missing language pair, target service, or output format.
- Replace implementation guesses with the user's actual desired outcome.
- Remove filler words that do not narrow the capability choice.

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

## Mixed discovery entrypoint

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

## How to rank the first result set

- Use `oo search` as the default first substantive lookup.
- The first search call should use one quoted free-form query string plus
  `--json`.
- For short multi-step workflows, the query should describe the current
  external step, not the whole chain.
- Inspect the first result set before trying alternative searches.
- Revise the query only when the first result set clearly missed a decisive
  constraint or pulled the search toward the wrong capability family.
- Usually keep one primary candidate and at most one materially different
  fallback.
- If a package and a connector are equally direct, prefer the authenticated
  connector as a tie-breaker because it is usually lower friction and cheaper.
- If the returned array is empty or no candidate clearly fits, explain that the
  current `oo` catalog does not expose a good match and stop the current `oo`
  path.

Rank mixed results in this order:

1. Directness of the action or block relative to the user's goal
2. Whether the service or output target is explicitly named or strongly implied
3. Whether the candidate is already authenticated and ready to run
4. How many required inputs and follow-up questions it adds
5. How closely the expected output matches the user's desired outcome

## Refinement moves

- Inspect only the shortlisted candidates.
- For package-backed candidates, inspect with `oo packages info` before
  execution.
- For connector-backed candidates, read the cached schema file at `schemaPath`
  before building any payload.
- If extra refinement is needed, use `--keywords` or a later follow-up search
  after inspecting the first result set.
- Do not pass normalized keywords as extra positional arguments.
- Use `--keywords` when the first search captured the general task but missed an
  important service, format, or language constraint.
- If connector signal is still ambiguous after shortlisting, refine with:

```bash
oo connector search "<text>" --json
```

- Use `oo connector search` only to refine a chosen connector path, not to
  restart broad discovery from scratch.
