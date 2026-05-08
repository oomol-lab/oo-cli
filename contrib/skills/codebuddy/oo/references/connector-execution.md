# Connector Execution

Read this file only after selecting a connector-backed candidate.

This page inherits the constitution from `SKILL.md`: connector schema is the
only source of service names, action names, input fields, output fields, and
artifact semantics.

## Goal

Turn a connector candidate into a callable connector contract, then send the
smallest sufficient JSON payload that matches the user's real intent.

## Confirm the action contract

- Use the chosen search result's `service`, `name`, and `schemaPath` as the
  starting point.
- Read the cached JSON file at `schemaPath` before building any payload.
- Use the cache file's exact `service`, `name`, `description`, `inputSchema`,
  and `outputSchema` to confirm the action fit.
- Prefer the action whose description most directly matches the user's desired
  outcome, especially when the user named the target service.
- If the selected schema directly satisfies the outcome and required inputs are
  available, build the payload and execute; do not rediscover adjacent actions.
- If schema evidence does not prove the action can satisfy the user outcome,
  refine discovery or stop with a catalog miss.

Representative cache file shape:

```json
{
  "description": "Send a Gmail message.",
  "inputSchema": {},
  "name": "send_mail",
  "outputSchema": {},
  "service": "gmail"
}
```

## Build connector payload

- Use the cached `inputSchema` and normal JSON Schema required-field semantics.
- Use only declared input fields.
- Prefer concrete user values over placeholders, broad guesses, or defaults.
- Preserve service-specific constraints such as recipient, folder, file id,
  time range, calendar, channel, label, format, or destination.
- If an input can accept a URI and the user only has a local file, read
  [file-transfer.md](file-transfer.md) before executing.
- If the task depends on raw file bytes, local paths, or unsupported
  special-media handles that cannot be submitted safely through normal JSON,
  stop the current `oo` path.

## External side effects

Actions that send, post, invite, update, delete, move, share, or otherwise
change third-party state need high confidence before execution.

Proceed directly only when the user's intent and all required payload values are
unambiguous. Otherwise ask one focused question or confirmation. Do not use
`--dry-run` as a substitute for completing an explicitly requested action, but
honor user requests to validate without executing.

An explicit user instruction plus complete required payload values is sufficient
confidence for non-destructive send, post, create, or invite actions. Ask before
destructive actions, broad sharing, or ambiguous recipient, content, or
destination choices.

## Execute the connector path

Canonical form:

```bash
oo connector run "<serviceName>" \
  --action "<actionName>" \
  --data '<json object>' \
  --json
```

Facts:

- `serviceName` is the only positional argument.
- `--action` is required and selects the connector action name.
- `--data` must be a JSON object string or `@path/to/file.json`.
- If `--data` is omitted, the CLI uses `{}`.
- `--json` returns a stable JSON object for execution output.
- In execution responses, the execution id is nested under
  `meta.executionId`, not a top-level field.

Expected execution JSON:

```json
{
  "data": {},
  "meta": {
    "executionId": "execution-id"
  }
}
```

## Interpret outputs by schema semantics

- Interpret connector output fields by their documented meaning, not by URL
  shape alone.
- If an output field is documented as a download URL, read
  [file-transfer.md](file-transfer.md) before saving it locally.
- Treat browse metadata such as `webViewLink`, edit URLs, folder URLs, or
  console URLs as non-downloadable unless the schema or action description says
  they return file content.
- If only metadata came back, report metadata as metadata. Do not synthesize a
  download URL.

## Storage-style connectors

Storage connectors such as Google Drive, Dropbox, and OneDrive often separate
locating a file from materializing its bytes.

State model:

1. Locate
   Use a `find_*`, `list_*`, or similarly described action when the user needs
   to identify a file or folder. Treat the result as metadata.
2. Select
   If the locate action returns multiple candidates and the user's target is
   ambiguous, ask one focused question. If the locator clearly identifies one
   item, use its stable id or documented locator field.
3. Materialize
   Discover or choose an action whose description identifies it as download or
   export and whose `outputSchema` exposes a download URL field, such as
   `transitUrl` on `googledrive.download_file`.
   Prefer refining within the same connector service first, using the selected
   service as a keyword or constraint.
4. Save
   Feed that documented download URL to `oo file download`. Do not feed
   `webViewLink`, edit URLs, folder URLs, or console URLs to file download.

If the same connector offers several find-style actions, prefer the one whose
filters match the user's locator by name, id, folder, type, or time range so
the result is as narrow as possible.

## Re-authorization branches

Inspect `errorCode` before broader troubleshooting:

- `scope_missing`: explain that the connector authorization is missing the
  required scope and must be re-authorized
- `credential_expired`: explain that the connector authorization has expired
  and must be re-authorized
- `app_not_ready` / `app_not_found`: explain that the connector has not been
  authorized yet and must be authorized before retrying

For those cases, guide the user to:

```text
https://console.oomol.com/app-connections?provider=${serviceName}
```

Replace `${serviceName}` with the selected connector service.

## Known connector caveats

- Unknown input handles, missing required values, wrong types, or non-object
  `--data` payloads are rejected.
- If an input schema contains `contentMediaType` and the value is not
  `oomol/secret`, current local validation rejects it.
