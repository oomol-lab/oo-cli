# oo Command Reference

[English](./commands.md) | [简体中文](./commands.zh-CN.md)

Project overview: [README.md](../README.md)

## Global Options

- `--debug`: Print the current log file path to `stderr` when the CLI exits.
- `--lang <lang>`: Override the display language for the current invocation.
  Supported values: `en`, `zh`.
- `-h, --help`: Show help for the current command.
- `-V, --version`: Show the current CLI version, build time, and commit hash.

## Debug Logging

- The CLI writes structured debug logs to a platform-specific persisted log
  directory:
  macOS: `~/Library/Logs/oo`
  Linux: `${XDG_STATE_HOME:-~/.local/state}/oo/logs`
  Windows: `%LOCALAPPDATA%\\oo\\Logs`
- The debug logs include request lifecycles for remote APIs, browser-login
  callback events, explicit update checks, persisted settings/auth store
  changes, and sqlite cache activity.
- Error-oriented log entries also include a `category` field so user-facing
  failures, system failures, and recoverable cache issues can be filtered
  quickly.
  Values include `user_error`, `system_error`, and `recoverable_cache`.
- The CLI keeps only the most recent `20` log files. Older log files are
  removed first.

## Authentication

### `oo auth login`

Start a browser login flow and save the authenticated account.

- Notes: the CLI prints a login URL and waits for the browser callback to
  finish.

### `oo auth logout`

Remove the current account from persisted auth data.

### `oo auth status`

Show the current account and validate its API key.

### `oo auth switch`

Switch to the next saved account.

### `oo login`

Alias for `oo auth login`.

### `oo logout`

Alias for `oo auth logout`.

## Configuration

- Notes: when the persisted settings file contains unknown keys, the CLI
  ignores those keys and writes a warning entry to the debug log. Known keys
  continue to load normally.

### `oo config list`

List persisted configuration values that are currently set.

### `oo config get <key>`

Read one persisted configuration value.

- Arguments: `<key>` is the configuration key. Supported values:
  `lang`, `file.download.out_dir`, `skills.oo.implicit_invocation`,
  `skills.oo-find-skills.implicit_invocation`.

### `oo config path`

Print the path to the persisted configuration file.

### `oo config set <key> <value>`

Persist one configuration value.

- Arguments: `<key>` is the configuration key. Supported values:
  `lang`, `file.download.out_dir`, `skills.oo.implicit_invocation`,
  `skills.oo-find-skills.implicit_invocation`.
- Arguments: `<value>` is the value for the selected key.
- Value rules: for `lang`, supported values are `en` and `zh`.
- Value rules: for `file.download.out_dir`, use any non-empty path string. Relative
  paths resolve from the current working directory when `oo file download` runs. A
  leading `~` expands to the current user's home directory.
- Value rules: for `skills.oo.implicit_invocation`, supported values are
  `true` and `false`.
- Value rules: for `skills.oo-find-skills.implicit_invocation`, supported
  values are `true` and `false`.

### `oo config unset <key>`

Remove one persisted configuration value.

- Arguments: `<key>` is the configuration key. Supported values:
  `lang`, `file.download.out_dir`, `skills.oo.implicit_invocation`,
  `skills.oo-find-skills.implicit_invocation`.

## Updates

### `oo check-update`

Check whether a newer CLI release is available.

- Notes: when a newer release is found, the CLI prints the recommended upgrade
  command for the current package manager.
- Notes: when the current release is already the latest one, the CLI prints a
  confirmation message.
- Notes: transient request failures are retried once before the CLI gives up.
- Notes: successful and failed checks are not cached, so every invocation
  fetches the latest release information from the registry.
- Notes: when the registry is temporarily unavailable, the CLI prints a
  retry-later message instead of exiting with an error.

## Connector

### `oo connector search <text>`

Search connector actions with free-form text.

- Arguments: `<text>` is the semantic search text.
- Options: `--keywords <keywords>` sends a comma-separated keyword list after
  trimming empty and duplicate entries.
- Options: `--format=json` and `--json` print a JSON array of matching action
  entries.
- Output: every match is enriched with `authenticated` and `schemaPath`.
- Output: JSON entries include the stable CLI fields `service`, `name`,
  `description`, `authenticated`, and `schemaPath`.
- Output: text output prints one block per action with the service/action
  label, optional description, authenticated state, and schema cache path.
- Notes: the command caches discovered action schemas locally and reports the
  cache path for each result.

### `oo connector run <serviceName>`

Validate input data and run one connector action synchronously.

- Arguments: `<serviceName>` is the service name.
- Options: `-a, --action <action>` selects the action name and is required.
- Options: `-d, --data <data>` accepts inline JSON or `@path` to a JSON file.
- Options: `--dry-run` validates the payload without executing the action.
- Options: `--format=json` and `--json` print a JSON object.
- Output: non-dry-run JSON output mirrors the stable response shape
  `{ data, meta: { executionId } }`.
- Output: dry-run JSON output returns `{ dryRun, ok, schemaPath }`.
- Notes: when local schema cache is unavailable or unusable, the command
  refreshes it automatically before validating and running.

## Codex Skills

### `oo skills list`

List oo-managed skills from the local Codex skills directory.

- Ownership rule: the command scans `${CODEX_HOME:-~/.codex}/skills` and keeps
  only child directories whose `.oo-metadata.json` can be parsed and contains
  a non-empty `version`.
- Output: text output prints a summary line and one block per skill.
- Ordering: `oo` is always listed first when present; the remaining skills are
  ordered by skill name.
- Output: each skill block shows the skill name, source package or bundled
  marker, and recorded version.

### `oo skills search <text>`

Search published skills with free-form text.

- Alias: `oo skills find <text>`.
- Arguments: `<text>` is the search text sent to the skills search service.
- Options: `--keywords <keywords>` sends a comma-separated keyword list as
  repeated `keywords` query parameters after trimming empty entries.
- Options: `--format=json` and `--json` print a JSON array of matching skill
  entries.
- Output: JSON entries include only the stable CLI fields `description`,
  `name`, `packageName`, `packageVersion`, and `skillDisplayName` when present.
- Output: text output prints one block per skill with its title or name,
  optional description, and source package reference when available.
- Notes: every invocation requests at most `5` results.

### `oo skills config get <skill> [key]`

Read skill configuration values.

- Arguments: `<skill>` is the skill name.
- Arguments: `[key]` is optional and selects one configuration key of the
  chosen skill.
- Output: when `[key]` is provided, the command prints the effective value for
  that key followed by a newline.
- Output: when `[key]` is omitted, the command prints one `key=value` line for
  every known key of the selected skill.
- Notes: valid skill names and key sets depend on the CLI version.
- Notes: effective values include bundled defaults when no explicit persisted
  value exists yet.

### `oo skills config set <skill> <key> <value>`

Persist one skill configuration value.

- Arguments: `<skill>` is the skill name.
- Arguments: `<key>` is the configuration key for the selected skill.
- Arguments: `<value>` is the value for the selected skill configuration key.
- Value rules: accepted values depend on `<skill>` and `<key>`.
- Notes: when the target managed skill is already installed, the command
  synchronizes the managed files immediately.
- Notes: when the target managed skill is not installed, the command still
  persists the setting and applies it on the next install or startup
  synchronization.

### `oo skills install [packageName]`

Install bundled skills into supported local skill directories, or install
published skills into the local Codex skills directory.

- Alias: `oo skills add [packageName]`.
- Arguments: `[packageName]` is optional.
- Arguments: when omitted, the command installs all bundled skills.
- Arguments: when `[packageName]` is `oo` or `oo-find-skills`, the command
  installs the corresponding bundled skill.
- Arguments: when `[packageName]` is a published package name, the command
  installs skills from that package.
- Options: `-s, --skill <skills...>` installs one or more named published
  skills from the package.
- Options: `-s, --skill '*'` installs all published skills from the package.
- Options: `--all` is shorthand for installing all published skills from the
  package without a skill-selection prompt.
- Options: `-y, --yes` skips confirmation prompts. When a package publishes
  multiple skills and no explicit `--skill` is provided, `-y` installs all of
  them.
- Notes: when a package publishes exactly one skill and no `--skill` is
  provided, the command installs that skill automatically.
- Notes: when a package publishes multiple skills and no `--skill`, `--all`, or
  `-y` is provided, the command opens an interactive picker in a TTY.
- Notes: in the interactive picker, skills already installed from the same
  package start selected. Clearing such a selection removes that installed
  skill when the command completes.
- Canonical directory: bundled Codex skills are materialized to
  `<config-dir>/skills/<skill-id>`, where `<config-dir>` is the directory that
  contains `settings.toml`.
- Canonical directory: bundled Claude Code skills are materialized to
  `<config-dir>/claude-skills/<skill-id>`.
- Canonical directory: published skills are materialized to
  `<config-dir>/skills/<skill-id>`.
- Target directory: bundled skills are published to each existing supported
  host directory, currently `${CODEX_HOME:-~/.codex}/skills/<skill-id>` and
  `~/.claude/skills/<skill-id>`.
- Target directory: published skills are published to
  `${CODEX_HOME:-~/.codex}/skills/<skill-id>`.
- Path rule: published skill names are accepted only when their resolved
  canonical and target directories remain under those local `skills` roots.
- Installation mode: `oo` publishes the target directory as a symlink to the
  canonical directory when the current platform and environment allow it. When
  symlink creation fails, `oo` falls back to copying the canonical files into
  the Codex skills directory.
- Metadata: bundled skills write a hidden `.oo-metadata.json` file whose
  `version` field matches the current `oo` version.
- Metadata: published skills write a hidden `.oo-metadata.json` file whose
  `version` field matches the package version and whose `packageName` field
  records the source package.
- Metadata: the Codex copy of bundled `oo` and `oo-find-skills` writes
  `agents/openai.yaml` using the persisted skill-specific
  `implicit_invocation` value when configured; otherwise the bundled default is
  used.
- Notes: all registry requests for published skills send the active account's
  `Authorization` header.
- Notes: when a package publishes multiple skills and the command runs outside
  an interactive terminal, you must provide `--skill <name>` or `--all -y`.
- Notes: when an explicitly requested published skill conflicts with an
  existing same-name skill, the command asks for `yes` or `no` before
  overwriting it in an interactive terminal.
- Notes: in the interactive picker, conflicting skills are marked in the list;
  selecting one means it will be overwritten.
- Notes: the command exits with an error when neither a supported Codex nor
  Claude Code home directory exists.
- Notes: an existing bundled skill installation is considered managed by `oo`
  only when its `.oo-metadata.json` file can be parsed and contains a
  non-empty `version`. Otherwise `oo` treats it as a different skill and will
  not overwrite it.
- Notes: on the first `oo` run, when there is no existing config, auth, or log
  data yet, `oo` silently installs missing bundled managed skills
  automatically into every supported host whose home directory already exists.
- Notes: when a bundled skill is already installed, every `oo` startup checks
  whether the recorded metadata `version` matches the current CLI version and
  silently refreshes the installed files when needed.

### `oo skills update [skills...]`

Update installed oo-managed Codex skills.

- Arguments: when omitted, the command checks every installed oo-managed
  published skill.
- Arguments: when one or more skill names are provided, only those named skills
  are checked and updated.
- Bundled skills: bundled skills such as `oo` and `oo-find-skills` are
  excluded from this command because the CLI synchronizes them automatically
  during startup when needed.
- Published skills: registry-backed skills derive their package identity from
  `.oo-metadata.json`, then fetch package info without an explicit version to
  determine the latest available package version.
- Update order: the command refreshes the canonical
  `<config-dir>/skills/<skill-id>` copy before republishing to
  `${CODEX_HOME:-~/.codex}/skills/<skill-id>`.
- Interactive terminals: renders live progress while checking and updating
  skills.
- Non-interactive terminals: prints one status line per processed skill.

### `oo skills uninstall [skill]`

Remove bundled skills from supported local skill directories, or remove one
oo-managed published skill from the local Codex skills directory.

- Alias: `oo skills remove [skill]`.
- Arguments: when `[skill]` is omitted, the command removes all bundled skills.
- Ownership rule: a bundled skill is removable from a supported host only when
  that host's installed directory has a `.oo-metadata.json` file that can be
  parsed and contains a non-empty `version`.
- Canonical directory removed: bundled Codex skills remove
  `<config-dir>/skills/<skill>`, bundled Claude Code skills remove
  `<config-dir>/claude-skills/<skill>`, and published skills remove
  `<config-dir>/skills/<skill>`.
- Target directory removed: bundled skills are removed from every existing
  supported host directory, currently `${CODEX_HOME:-~/.codex}/skills/<skill>`
  and `~/.claude/skills/<skill>`. Published skills are removed from
  `${CODEX_HOME:-~/.codex}/skills/<skill>`.
- Path rule: `[skill]` must resolve to child directories under those local
  `skills` roots. Names that escape those roots are rejected.
- Notes: when the target directory is missing, or its `.oo-metadata.json` file
  is missing or invalid, the command exits with an error and does not remove
  anything.

## Logs

### `oo log path`

Print the current persisted debug log directory path.

### `oo log print`

Print one previous persisted debug log file.

- Arguments: `[index]` is optional and must be an integer greater than or equal
  to `1`. `1` means the previous log file, `20` means the twentieth previous
  log file.
- Notes: the current `oo log print` invocation creates its own log file, so the
  command always skips the current run and reads earlier logs.

## Files

### `oo file download <url> [outDir]`

Download one file from `http` or `https` and save it locally.

- Arguments: `<url>` is required and must use the `http` or `https` scheme.
- Arguments: `[outDir]` is optional. When omitted, the CLI uses the configured
  `file.download.out_dir` value if present, otherwise `~/Downloads`. Missing
  directories are created automatically. If the path already exists and is not
  a directory, the command fails.
- Notes: `[outDir]` and `file.download.out_dir` may start with `~`, which expands
  to the current user's home directory.
- Options: `--name <name>` overrides only the saved base name. The value must
  be non-empty, must not be `.` or `..`, and must not contain path separators.
- Options: `--ext <ext>` overrides only the saved extension. The value may be
  written with or without a leading `.`, but it must be non-empty, must not be
  `.` or `..`, and must not contain path separators.
- Notes: when `--name` or `--ext` is not provided, the CLI infers the saved
  file name from the final response metadata and URL.
- Notes: if the inferred saved file name would be opaque, use `--name` to pick
  a clearer base name while keeping the inferred extension.
- Notes: known composite extensions such as `.tar.gz` and `.pkg.tar.zst` are
  preserved as one full extension when they can be inferred automatically.
- Notes: downloads are written through a temporary file in the target directory,
  then promoted to the final path only after the transfer completes.
- Notes: if a download stops partway through, rerunning the same command against
  the same output directory will attempt to resume with HTTP Range. If the
  server does not resume safely, the CLI restarts the transfer from byte `0`.
- Notes: resume sessions older than 14 days are discarded when `oo file download`
  starts, so very old `.oodownload` files are no longer resumed automatically.
- Notes: if the final target path already exists, the CLI never overwrites it
  and instead appends `_1`, `_2`, and so on before the full extension.
- Notes: `oo file download` does not support `--format=json` or `--json`.
- Notes: successful `stdout` output is one localized human-readable line that
  includes the absolute saved path, followed by a newline. When `stderr` is a
  TTY, human-readable progress is rendered there.

### `oo file upload <filePath>`

Upload one file to the temporary file cache.

- Arguments: `<filePath>` is the local file path to upload.
- Options: `--format <format>` returns structured output. Supported value:
  `json`.
- Options: `--json` is an alias for `--format=json`.
- Notes: the uploaded file expires after one day and is deleted on the server.
- Notes: files larger than `512 MiB` are rejected.
- Notes: successful uploads persist a local sqlite record with the upload time,
  file name, file size, signed download URL, expiry time, and a UUID v7 id.

### `oo file list`

List previously uploaded files from the local sqlite store.

- Options: `--status <status>` filters records by expiry state. Supported
  values: `active`, `expired`.
- Options: `--limit <limit>` limits the number of returned records. The value
  must be an integer greater than or equal to `1`.
- Options: `--format <format>` returns structured output. Supported value:
  `json`.
- Options: `--json` is an alias for `--format=json`.
- Notes: the command does not delete expired records implicitly.

### `oo file cleanup`

Delete expired upload records from the local sqlite store.

- Options: `--format <format>` returns structured output. Supported value:
  `json`.
- Options: `--json` is an alias for `--format=json`.
- Notes: only local records with `expiresAt <= now` are deleted.
- Notes: the JSON response shape is `{ "deletedCount": number }`.

## Package Discovery

### `oo packages search <text>`

Search packages with free-form intent text.

- Arguments: `<text>` is the search query.
- Options: `--format <format>` returns structured output. Supported value:
  `json`.
- Options: `--json` is an alias for `--format=json`.
- Options: `--only-package-id` returns only package IDs.
- Notes: queries longer than 200 characters are truncated before the request is
  sent.

### `oo packages info <packageSpecifier>`

Show package metadata for one package.

- Arguments: `<packageSpecifier>` is the package name with an optional version.
  Examples: `foo/bar`, `foo/bar@latest`, `foo/bar@1.2.3`.
- Options: `--format <format>` returns structured output. Supported value:
  `json`.
- Options: `--json` is an alias for `--format=json`.
- Notes: if no version is provided, the CLI resolves the latest version.

## Cloud Tasks

### `oo cloud-task run <packageSpecifier>`

Validate input values and create a cloud task for a package block.

- Arguments: `<packageSpecifier>` is required and must use
  `PACKAGE_NAME@SEMVER`, for example `foo/bar@1.2.3`.
- Options: `-b, --block-id <block-id>` selects the target block. This option is
  required.
- Options: `-d, --data <data>` provides input values as a JSON object string or
  `@path/to/file.json`.
- Options: `--dry-run` validates the request without creating a task.
- Options: `--format <format>` returns structured output. Supported value:
  `json`.
- Options: `--json` is an alias for `--format=json`.
- Notes: when `--data` is omitted, the command uses `{}`.

### `oo cloud-task list`

List cloud tasks with optional filters.

- Options: `--format <format>` returns structured output. Supported value:
  `json`.
- Options: `--json` is an alias for `--format=json`.
- Options: `--size <size>` sets page size. Supported values are integers from
  `1` to `100`.
- Options: `--nextToken <nextToken>` requests the next page with a pagination
  token.
- Options: `--status <status>` filters by task status. Supported values:
  `queued`, `scheduling`, `scheduled`, `running`, `success`, `failed`.
- Options: `--package-id <package-id>` filters by package ID.
- Options: `--package-name <package-name>` is an alias for `--package-id`.
- Options: `--block-id <block-id>` filters by block ID. This option requires
  `--package-id` or `--package-name`.
- Options: `--block-name <block-name>` is an alias for `--block-id`.
- Notes: if both an option and its alias are provided, their values must match.

### `oo cloud-task log <taskId>`

Show paginated logs for one task.

- Arguments: `<taskId>` is the task ID.
- Options: `--page <page>` selects the log page. Supported values are integers
  greater than or equal to `1`.
- Options: `--format <format>` returns structured output. Supported value:
  `json`.
- Options: `--json` is an alias for `--format=json`.

### `oo cloud-task result <taskId>`

Show the current result for one task.

- Arguments: `<taskId>` is the task ID.
- Options: `--format <format>` returns structured output. Supported value:
  `json`.
- Options: `--json` is an alias for `--format=json`.

### `oo cloud-task wait <taskId>`

Wait for one task to reach a terminal state by polling its result every
`3 seconds`.

- Arguments: `<taskId>` is the task ID.
- Options: `--timeout <timeout>` sets the wait timeout. The default is `6h`.
  The minimum is `10s` and the maximum is `24h`. Supported formats include
  `1m`, `4h`, `120s`, and `360` (seconds are used when no suffix is provided).
- Notes: the command exits when the task succeeds, fails, or the timeout is
  reached.
- Notes: while the task is still running, the CLI prints a status snapshot
  immediately, then every `1 minute` during the first hour, every `3 minutes`
  from `1h` to `3h`, and every `5 minutes` after `3h`.

## Shell Completion

### `oo completion <shell>`

Generate a shell completion script.

- Arguments: `<shell>` is the target shell. Supported values: `bash`, `zsh`,
  `fish`.
