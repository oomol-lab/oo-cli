# File Transfer

Read this file only when a selected input needs a file-like value or when a
remote result artifact should be saved locally.

Once this file is in play, `oo file upload` and `oo file download` are the only
approved transfer mechanisms for the corresponding step.

## Upload a local file for URI-compatible inputs

Canonical form:

```bash
oo file upload "<filePath>" --json
```

Facts:

- `<filePath>` is a local file path.
- `--json` is an alias for `--format=json`.
- Successful JSON output includes `downloadUrl`, `expiresAt`, `fileName`,
  `fileSize`, `id`, `status`, and `uploadedAt`.
- The uploaded file expires after one day.
- Files larger than `512 MiB` are rejected.
- Successful uploads persist a local sqlite record.

Use this command when:

- The selected package handle or connector input can safely accept a URI string
- The user currently has only a local file path

Rules:

- Reuse a user-provided remote URL when it already satisfies the same URI input.
- Submit the returned `downloadUrl` in `--data`.
- Do not treat file upload as a way to pass raw bytes or bypass unsupported
  `contentMediaType` validation.
- Do not substitute `curl`, `wget`, Python HTTP code, or any ad hoc uploader.

## Materialize a remote artifact locally

Canonical form:

```bash
oo file download "<url>" [outDir] [--name "<name>"] [--ext "<ext>"]
```

Facts:

- `<url>` must use the `http` or `https` scheme.
- `[outDir]` is optional. When omitted, the CLI uses the configured
  `file.download.out_dir` value if present, otherwise `~/Downloads`.
- Missing directories are created automatically.
- This command does not support `--json` or `--format=json`.
- Successful saves print one localized human-readable line on stdout that
  includes the absolute saved path.

Eligibility rules:

- Use `oo file download` only for explicit download artifacts exposed by the
  current `oo` execution path.
- For package tasks (`oo cloud-task`): the artifact is the `resultURL` field
  returned by `oo cloud-task result --json`. See
  [task-lifecycle.md](task-lifecycle.md). When `resultURL` is `null` or
  absent, there is no downloadable artifact — do not synthesize one from
  `resultData` or log URLs.
- For connector actions (`oo connector run`): the artifact is whatever the
  action's `outputSchema` documents as a download URL, for example
  `transitUrl` on `googledrive.download_file`. Treat browse metadata such as
  `webViewLink`, edit URLs, folder URLs, or console pages as non-downloadable.
  If only metadata came back, run a connector action whose `description`
  identifies it as a download or export action and whose `outputSchema`
  exposes a download URL field first — see
  [connector-execution.md](connector-execution.md) for the storage-connector
  decision tree.

Naming rules:

- Pass `--name "<descriptive base name>"` when the inferred filename would be
  opaque, such as a UUID, hash, task id, or generic `download` label.
- Preserve the inferred extension unless the user explicitly needs a different
  one.
- Omit `[outDir]` unless the user asked for a specific destination.

Execution rules:

- Use `oo file download` as the only downloader for remote artifacts produced by
  `oo`.
- Do not probe the same URL first with `curl`, `wget`, Python, browser
  automation, or any other downloader.
- Do not run `oo file download` in parallel with another download command for
  the same artifact.

Failure cases:

- invalid URL
- non-directory `outDir`
- non-success HTTP response
