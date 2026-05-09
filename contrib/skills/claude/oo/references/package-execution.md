# Package Execution

Read this file only after selecting a package-backed candidate.

This page inherits the constitution from `SKILL.md`: package metadata is the
only source of package names, versions, block names, handles, defaults, and
output semantics.

## Goal

Turn a package candidate into a callable package contract, run it through
`oo cloud-task`, then continue through task lifecycle.

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
- `@latest` is accepted by `oo packages info`, but `oo cloud-task run` rejects
  it and requires an explicit semver version.
- For execution, always use the resolved `packageVersion`.
- Use `blocks[].blockName` for `--block-id`.
- Do not confuse block `title` with `blockName`.
- Use the package and block descriptions to confirm fit before building data.

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

## Choose the block

- Prefer the block whose description, input handles, and expected output most
  directly match the user's requested result.
- Choose the first block whose metadata directly satisfies the user outcome;
  inspect alternatives only when the primary block is ambiguous, unsafe, or
  output-mismatched.
- Do not assume `main` is the right block unless metadata supports that.
- If two blocks are plausible, keep one primary block and at most one fallback.
- If metadata is insufficient to choose safely, stop and report the ambiguity
  instead of guessing.

## Build package payload

Treat an input handle as optional only when metadata proves it:

- `value` exists and is not `null`
- `nullable` is `true` and `value` is `null`
- `schema.default` exists

These signals only show that omission may pass local validation. They do not
prove that the package-provided value is correct for the current user request.

Rules:

- Use only fields exposed by the selected block's `inputHandle`.
- Preserve user constraints such as exact file type, language pair, target
  format, destination, style, or time range.
- Override sample values, placeholders, empty strings, and defaults whenever the
  user request implies a specific input.
- Do not submit a local file path or local `file://...` URI where the handle
  expects a URI-compatible string. Read [file-transfer.md](file-transfer.md)
  first, upload the file with `oo file upload`, and submit the returned
  `downloadUrl`.
- Stop when the selected block depends on an input shape that `oo-cli` cannot
  safely submit.

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
- `--block-id` is required.
- `--data` must be a JSON object string or `@path/to/file.json`.
- If `--data` is omitted, the CLI uses `{}`.
- `oo cloud-task run` returns a task handle, not the final task result.

Expected success JSON:

```json
{
  "taskID": "task-id"
}
```

After success, read [task-lifecycle.md](task-lifecycle.md). Continue with a
bounded wait or result inspection when the user needs the final result or
artifact, instead of stopping at the `taskID` unless the user only asked to
start the task.

## Known package caveats

- Unknown input handles, missing required values, wrong types, or non-object
  `--data` payloads are rejected.
- File-like inputs usually need a remote URI string, not a local path or raw
  bytes.
- If an input handle schema contains `contentMediaType` and the value is not
  `oomol/secret`, current local validation rejects it.
