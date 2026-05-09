# File Transfer

Read this file only when a selected input needs a file-like value or when a
remote result artifact should be saved locally.

This page owns the detailed URI and artifact rules for the `oo` skill.

## Goal

Move files into or out of the selected `oo` path without inventing alternate
transfer workflows.

## Transfer constitution

- Upload only when the selected contract expects a URI-compatible value and the
  user currently has a local file.
- Download only when the selected contract or task result exposes an explicit
  artifact URL.
- Reuse a suitable user-provided remote URL instead of uploading the same
  content again.
- Use `oo file upload` and `oo file download` for transfers inside this skill.
- Do not use `curl`, `wget`, Python, browser automation, ad hoc HTTP calls, or
  third-party SDKs as replacement transfer paths.

## Upload a local file for a URI-compatible input

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
- Local `file://...` URIs are local filesystem references, not cloud-accessible
  artifacts.

Use this command when:

- The selected package handle or connector input can safely accept a URI string
- The user currently has only a local file path

Rules:

- Submit the returned `downloadUrl` in the cloud payload.
- Do not submit local absolute paths or local `file://...` URIs in cloud
  payloads unless the selected schema explicitly supports local paths; they may
  pass URI validation but fail when the cloud task tries to fetch or upload the
  file.
- Do not treat file upload as a way to pass raw bytes or bypass unsupported
  `contentMediaType` validation.
- If the selected input does not accept a URI-compatible string, stop at an
  unsupported input-shape blocker.

## Download a remote artifact locally

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

## What counts as a downloadable artifact

- Package task artifact: the `resultURL` field returned by
  `oo cloud-task result --json`. When `resultURL` is `null` or absent, there is
  no downloadable artifact. Do not synthesize one from `resultData` or logs.
- Connector artifact: an output field whose `outputSchema` or action
  description documents it as a download URL, for example `transitUrl` on
  `googledrive.download_file`.
- Non-artifacts: browse links, edit links, folder links, console URLs, web view
  links, logs, metadata ids, and any URL whose schema meaning is not file
  content.

If the user wants a local copy and the current connector result is only
metadata, return to [connector-execution.md](connector-execution.md) and choose
or discover a download/export action first.

## Naming guidance

- Pass `--name "<descriptive base name>"` when the inferred filename would be
  opaque, such as a UUID, hash, task id, or generic `download` label.
- Preserve the inferred extension unless the user explicitly needs a different
  one.
- Omit `[outDir]` unless the user asked for a specific destination.

## Failure cases

Stop and report the blocker when transfer fails because of:

- invalid URL
- non-directory `outDir`
- non-success HTTP response
- local file missing or too large
- `oo file upload` did not return a usable `downloadUrl`
- selected input not accepting URI-compatible values
