# Package Execution

Read this file only after selecting a package-backed candidate.

## Inspect package metadata

Canonical form:

```bash
oo packages info "<packageSpecifier>" --json
```

Supported package specifier examples:

- `pdf`
- `pdf@1.0.0`
- `@foo/epub`
- `@foo/epub@1.0.0`

Facts:

- If no version is provided, the CLI resolves the latest version.
- `@latest` is valid for `oo packages info`, but not for `oo cloud-task run`.
- For execution, always use the resolved `packageVersion`.
- Use `blocks[].blockName` for `--block-id`.
- Do not confuse block `title` with `blockName`.
- Never invent package IDs, versions, block IDs, defaults, or task results.

Expected JSON shape:

```json
{
  "blocks": [
    {
      "blockName": "main",
      "description": "string",
      "inputHandle": {
        "inputName": {
          "description": "string",
          "nullable": false,
          "schema": {
            "type": "string"
          },
          "value": "optional default value"
        }
      },
      "outputHandle": {
        "outputName": {
          "description": "string",
          "schema": {
            "type": "string"
          }
        }
      },
      "title": "Main"
    }
  ],
  "description": "string",
  "displayName": "Readable package title",
  "packageName": "package-name",
  "packageVersion": "1.2.3"
}
```

## Optionality and payload rules

Treat an input handle as optional only when metadata proves it:

- `value` exists and is not `null`
- `nullable` is `true` and `value` is `null`
- `schema.default` exists

These signals only show that omission may pass local validation. They do not
prove that the package-provided value is correct for the current user request.

- Override sample values, placeholders, empty strings, and defaults whenever
  the user request implies a specific input.
- Use only fields the selected block actually exposes.
- Stop when the selected block depends on an input shape that `oo-cli` cannot
  safely submit.
- If a file-like handle expects a URI-compatible string, read
  [file-transfer.md](file-transfer.md) before building the payload.

## Execute the package path

Canonical form:

```bash
oo cloud-task run "<packageName>@<version>" \
  --block-id "<blockName>" \
  --data '<json object>' \
  --json
```

Facts:

- The package specifier must contain an explicit semver version.
- `@latest` is not valid for `oo cloud-task run`.
- `--block-id` is required.
- `--data` must be a JSON object string or `@path/to/file.json`.
- If `--data` is omitted, the CLI uses `{}`.
- Local validation runs before task creation, even for the direct run command.

Expected success JSON:

```json
{
  "taskID": "task-id"
}
```

Hard validation limits:

- Unknown input handles are rejected.
- Missing required values are rejected.
- Type mismatches are rejected.
- `--data` must decode to a plain JSON object.
- File widget validation is patched to require URI strings instead of local
  paths or binary payloads.
- If an input handle schema contains `contentMediaType` and the value is not
  `oomol/secret`, current local validation rejects it.
