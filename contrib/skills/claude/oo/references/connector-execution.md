# Connector Execution

Read this file only after selecting a connector-backed candidate.

## Inspect the cached schema first

- Use the chosen search result's `service`, `name`, and `schemaPath` as the
  starting point.
- Read the cached JSON file at `schemaPath` before building any payload.
- Use the cache file's exact `service`, `name`, `description`, `inputSchema`,
  and `outputSchema` to confirm the action fit.
- Never invent connector names, action names, defaults, or task results.

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
- The command refreshes schema metadata automatically when the cache is missing
  or unusable.
- Use the action's cached `inputSchema` and normal JSON Schema required-field
  semantics before submitting data.
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

Hard validation limits:

- Unknown input handles are rejected.
- Missing required values are rejected.
- Type mismatches are rejected.
- `--data` must decode to a plain JSON object.
- If an input schema contains `contentMediaType` and the value is not
  `oomol/secret`, current local validation rejects it.

Practical implication:

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
- Stop instead of pretending that raw file bytes, local paths, or unsupported
  special-media handles can be submitted safely through normal JSON payloads.
- If a selected input needs file upload semantics, read
  [file-transfer.md](file-transfer.md) before executing.

## Storage-style connectors

When the connector manages user files (for example Google Drive, Dropbox,
OneDrive), split the task into two steps:

1. Locate the target with a `find_*` or `list_*` action. The output is
   metadata. Fields such as `webViewLink`, edit URLs, or folder URLs cannot be
   downloaded with `oo file download`.
2. Materialize the file with a separate action whose `description` identifies
   it as a download or export action and whose `outputSchema` exposes a
   download URL field (for example `transitUrl` on
   `googledrive.download_file`). Submit that URL to `oo file download`.

Do not collapse these steps by feeding a step-1 browse link directly into
`oo file download`.

## Re-authorization branches

Inspect `errorCode` before broader troubleshooting:

- `scope_missing`: explain that the connector authorization is missing the
  required scope and must be re-authorized
- `credential_expired`: explain that the connector authorization has expired
  and must be re-authorized
- `app_not_ready` / `app_not_found`: explain that the connector has not been authorized yet and
  must be authorized before retrying

For those cases, guide the user to:

```text
https://console.oomol.com/app-connections?provider=${serviceName}
```

Replace `${serviceName}` with the selected connector service.
