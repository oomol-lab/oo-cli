# oo Command Reference

[English](./commands.md) | [简体中文](./commands.zh-CN.md)

Project overview: [README.md](../README.md)

## Global Options

- `--lang <lang>`: Override the display language for the current invocation.
  Supported values: `en`, `zh`.
- `-h, --help`: Show help for the current command.
- `-V, --version`: Show the current CLI version.

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

### `oo config list`

List persisted configuration values that are currently set.

### `oo config get <key>`

Read one persisted configuration value.

- Arguments: `<key>` is the configuration key. Supported value: `lang`.

### `oo config path`

Print the path to the persisted configuration file.

### `oo config set <key> <value>`

Persist one configuration value.

- Arguments: `<key>` is the configuration key. Supported value: `lang`.
- Arguments: `<value>` is the value for the selected key.
- Value rules: for `lang`, supported values are `en` and `zh`.

### `oo config unset <key>`

Remove one persisted configuration value.

- Arguments: `<key>` is the configuration key. Supported value: `lang`.

## Package Discovery

### `oo search <text>`

Search packages with free-form intent text.

- Arguments: `<text>` is the search query.
- Options: `--format <format>` returns structured output. Supported value:
  `json`.
- Options: `--only-package-id` returns only package IDs.
- Notes: queries longer than 200 characters are truncated before the request is
  sent.

### `oo package info <packageSpecifier>`

Show package metadata for one package.

- Arguments: `<packageSpecifier>` is the package name with an optional version.
  Examples: `foo/bar`, `foo/bar@latest`, `foo/bar@1.2.3`.
- Options: `--format <format>` returns structured output. Supported value:
  `json`.
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
- Notes: when `--data` is omitted, the command uses `{}`.

### `oo cloud-task list`

List cloud tasks with optional filters.

- Options: `--format <format>` returns structured output. Supported value:
  `json`.
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

### `oo cloud-task result <taskId>`

Show the current result for one task.

- Arguments: `<taskId>` is the task ID.
- Options: `--format <format>` returns structured output. Supported value:
  `json`.

## Shell Completion

### `oo completion <shell>`

Generate a shell completion script.

- Arguments: `<shell>` is the target shell. Supported values: `bash`, `zsh`,
  `fish`.
