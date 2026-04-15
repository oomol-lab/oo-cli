# Search and Selection

Read this file before the first `oo search` call and whenever choosing between a
package path and a connector path.

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

## Shortlisting rules

- Do not run `oo search` until this file has been read.
- Use `oo search` as the first substantive lookup.
- The first search call must use exactly one quoted free-form query string plus
  `--json`.
- If extra refinement is needed, use `--keywords` or a later follow-up search
  after inspecting the first result set.
- Do not pass normalized keywords as extra positional arguments.
- Do not launch multiple alternative `oo search` commands in parallel before
  reading and pruning the first result set.
- Keep at most `0` to `2` serious candidates total after ranking the mixed
  results.
- Default to one primary candidate. Keep a second candidate only when it is a
  materially different fallback rather than a noisy duplicate.
- The usual two-item shortlist is one connector plus one package. Never exceed
  `2` total.
- If a package and a connector are both strong matches, keep the connector
  first. Connector is free and lower-friction, so it wins ties.
- If the returned array is empty or contains no suitable candidates, tell the
  user that `oo` does not currently have a matching capability and **end the
  response**.

Rank mixed results in this order:

1. Directness of the action or block relative to the user's goal
2. Whether the service or output target is explicitly named or strongly implied
3. Whether the candidate is already authenticated and ready to run
4. How many required inputs and follow-up questions it adds
5. How closely the expected output matches the user's desired outcome

## Refinement rules

- Inspect only the shortlisted candidates.
- For package-backed candidates, inspect with `oo packages info` before
  execution.
- For connector-backed candidates, read the cached schema file at `schemaPath`
  before building any payload.
- If connector signal is still ambiguous after shortlisting, refine with:

```bash
oo connector search "<text>" --json
```

- Use `oo connector search` only to refine a chosen connector path, not to
  expand the candidate set again.
