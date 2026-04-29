# Connector Execution

Read this file only after selecting a connector-backed candidate.

## Goal

Confirm the connector action from the cached schema, then send the smallest
JSON payload that matches the user's real intent.

## Confirm the action from the cached schema

- Use the chosen search result's `service`, `name`, and `schemaPath` as the
  starting point.
- Read the cached JSON file at `schemaPath` before building any payload.
- Use the cache file's exact `service`, `name`, `description`, `inputSchema`,
  and `outputSchema` to confirm the action fit.
- Never invent connector names, action names, defaults, or task results.
- Prefer the action whose description most directly matches the user's desired
  outcome, especially when the user named the target service.

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

## Build the smallest valid payload

- Use the action's cached `inputSchema` and normal JSON Schema required-field
  semantics before submitting data.
- Prefer concrete user values over broad placeholders or guessed defaults.
- If an input can accept a URI and the user only has a local file, read
  [file-transfer.md](file-transfer.md) before executing.
- If the task depends on raw file bytes, local paths, or unsupported
  special-media handles that cannot be submitted safely through normal JSON,
  stop the current `oo` path instead of pretending it will work.

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
- Once the payload is ready, execute the action directly instead of stopping at
  a validation-only preflight.
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

## Known connector caveats

- Unknown input handles, missing required values, wrong types, or non-object
  `--data` payloads are rejected.
- If an input schema contains `contentMediaType` and the value is not
  `oomol/secret`, current local validation rejects it.

## Interpret outputs by meaning, not by URL shape

- If a handle is URI-compatible, a previously uploaded file's `downloadUrl`
  may be submitted as the JSON value.
- Interpret connector output fields by their documented meaning, not by URL
  shape alone.
- Treat browse metadata such as `webViewLink`, edit URLs, folder URLs, or
  console URLs as non-downloadable unless the schema or action description says
  they return file content.
- For authenticated storage connectors, if the user wants a local copy of a
  private file, prefer a dedicated action whose `description` identifies it as
  a download or export action and whose `outputSchema` exposes a download URL
  field before `oo file download`.

## Storage-style connectors

### Goal

When the connector manages user files (for example Google Drive, Dropbox,
OneDrive), separate locating the target from materializing its bytes so the
download step receives a real file URL, not a browse link.

### Heuristics

- Treat `find_*` and `list_*` outputs as metadata: they answer "which file",
  not "give me the bytes".
- Reach for a dedicated download or export action whose `description` says it
  returns file content and whose `outputSchema` exposes a download URL field
  (for example `transitUrl` on `googledrive.download_file`).
- Feed that download URL — not `webViewLink`, edit URLs, or folder URLs — to
  `oo file download`.
- If the same connector offers several find-style actions, prefer the one whose
  filters match the user's locator (by name, by id, by folder) so the result is
  a single file rather than a list to pick from later.

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
