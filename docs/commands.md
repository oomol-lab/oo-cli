# oo Command Reference

[English](./commands.md) | [简体中文](./commands.zh-CN.md)

Project overview: [README.md](../README.md)

## Global Options

- `--debug`: Print the current log file path to `stderr` when the CLI exits.
- `--lang <lang>`: Override the display language for the current invocation.
  Supported values: `en`, `zh`.
- `-h, --help`: Show help for the current command.
- `-V, --version`: Show the current CLI version, build time, and commit hash.

## JSON Output

Commands that document `--format=json` and `--json` share the following
conventions:

- `--show-schema-version` adds a `schemaVersion` field to the JSON payload.
  The current value is `1.0.0`.
- When the underlying payload is a JSON object, `schemaVersion` is merged
  into it as a top-level field.
- When the underlying payload is a JSON array, the response is wrapped as
  `{ "schemaVersion": "1.0.0", "items": <array> }`.
- `--show-schema-version` has no effect unless JSON output is requested with
  `--format=json` or `--json`.

## Debug Logging

- The CLI writes structured debug logs to a platform-specific persisted log
  directory:
  macOS: `~/Library/Logs/oo`
  Linux: `${XDG_STATE_HOME:-~/.local/state}/oo/logs`
  Windows: `%LOCALAPPDATA%\\oo\\Logs`
- The debug logs include request lifecycles for remote APIs, device-login
  polling events, explicit update checks, persisted settings/auth store
  changes, and sqlite cache activity.
- Error-oriented log entries also include a `category` field so user-facing
  failures, system failures, and recoverable cache issues can be filtered
  quickly.
  Values include `user_error`, `system_error`, and `recoverable_cache`.
- The CLI keeps debug log files from the current local calendar day and the
  previous six local calendar days. Logs outside this seven-day local date
  window are removed first. There is no fixed file-count cap.

## Authentication

### `oo auth login`

Start a device login flow or authenticate with a session token, then save the
authenticated account.

- Notes: the CLI prints the verification URL with the user code in the
  `user_code` query parameter, then waits up to 10 minutes for the device login
  to be verified when `--session-token` is not provided. It exits with a
  timeout error if verification does not complete within that window.
- Options:
  - `--session-token <session-token>`: Authenticate with an existing session
    token. The CLI does not print a device-login URL or poll for verification
    when this option is provided.

### `oo auth logout`

Remove the current account from persisted auth data.

### `oo auth status`

Show the current account and validate its API key.

### `oo auth switch`

Switch to the next saved account.

### `oo login`

Alias for `oo auth login`. Supports the same `--session-token <session-token>`
option.

### `oo logout`

Alias for `oo auth logout`.

## LLM

### `oo llm config`

Print the current account's LLM client configuration as JSON.

- Authentication: requires the current OOMOL account.
- Options: `--format=json` and `--json` are accepted for consistency with other
  structured output commands. The command always prints JSON.
- Output: a JSON object with:
  - `apiKey`: the current account API key.
  - `baseUrl`: the OpenAI-compatible LLM API base URL, including the `/v1`
    API prefix.
  - `chatCompletionsUrl`: the normalized OpenAI-compatible chat completions
    endpoint. Call this URL directly for raw chat completions requests instead
    of appending a path to `baseUrl`.
  - `model`: the default model name, currently `oomol-chat`.
- Production output uses `https://llm.oomol.com/v1` as `baseUrl` and
  `https://llm.oomol.com/v1/chat/completions` as `chatCompletionsUrl`.

### `oo llm json`

Call the configured LLM and require a JSON response that validates against a
provided JSON Schema.

- Authentication: requires the current OOMOL account.
- Options:
  - `--schema <schema>` is required. The value must be a JSON Schema object
    with root type `object`, or `@path/to/schema.json`.
  - `--input <input>` provides input JSON or `@path/to/input.json`. When
    omitted, the input is `{}`.
  - `--system <system>` provides extra system prompt text or `@path/to/system.txt`.
  - `--max-retries <count>` sets retries after the first attempt. Default is
    `2`; supported values are `0` through `5`.
  - `--model <model>` overrides the default model for this call.
  - `--format=json` and `--json` are accepted for consistency. The command
    always prints JSON.
- Behavior: the CLI sends the selected schema and input to the configured
  OpenAI-compatible chat completions endpoint, requests JSON-only output,
  repairs common JSON wrapping such as Markdown fences, validates the parsed
  value against the schema, and retries malformed or schema-invalid model
  output within the retry budget.
- Output: success prints
  `{ ok: true, data, model, attempts }`, where `data` is the validated model
  JSON value.
- Errors: endpoint `404`, authentication `401` or `403`, rate limit `429`,
  invalid schema, non-object root schema, unsupported LLM responses, and
  validation exhaustion are reported as command errors.

## Configuration

- Notes: when the persisted settings file contains unknown keys, the CLI
  ignores those keys and writes a warning entry to the debug log. Known keys
  continue to load normally.

### `oo config list`

List persisted configuration values that are currently set.

### `oo config get <key>`

Read one persisted configuration value.

- Arguments: `<key>` is the configuration key. Supported values:
  `lang`, `file.download.out_dir`, `telemetry.enabled`.

### `oo config path`

Print the path to the persisted configuration file.

### `oo config set <key> <value>`

Persist one configuration value.

- Arguments: `<key>` is the configuration key. Supported values:
  `lang`, `file.download.out_dir`, `telemetry.enabled`.
- Arguments: `<value>` is the value for the selected key.
- Value rules: for `lang`, supported values are `en` and `zh`.
- Value rules: for `file.download.out_dir`, use any non-empty path string. Relative
  paths resolve from the current working directory when `oo file download` runs. A
  leading `~` expands to the current user's home directory.
- Value rules: for `telemetry.enabled`, supported values are lowercase `true`
  and `false`. Other boolean-like spellings such as `1`, `0`, `True`, and `yes`
  are rejected. Setting `telemetry.enabled` to `false` also attempts to purge
  pending telemetry events immediately and the current `config set` invocation is
  not recorded as telemetry.

### `oo config unset <key>`

Remove one persisted configuration value.

- Arguments: `<key>` is the configuration key. Supported values:
  `lang`, `file.download.out_dir`, `telemetry.enabled`.

## Telemetry

The CLI records privacy-constrained command usage telemetry by default. Events do
not include free-form input text, paths, usernames, hostnames, IP addresses,
error messages, real OOMOL account ids, account names, `$set`, or `$identify`.
Each event uses a local random device id and sets `$process_person_profile` to
`false`. Package names and skill ids can be included in telemetry events,
including private package names, because they are treated as published product
artifacts.

- Environment: setting `OO_TELEMETRY_DISABLED` to a truthy value (`1`, `true`,
  `yes`, `on`, case-insensitive) disables telemetry for the current invocation.
- Environment: setting `DO_NOT_TRACK` to a truthy value (`1`, `true`, `yes`,
  `on`, case-insensitive) also disables telemetry for the current invocation.
- Persistence: `oo telemetry disable` and
  `oo config set telemetry.enabled false` persist telemetry disablement in
  `settings.toml`.
- Boundary: disabling telemetry prevents future telemetry sends and attempts to
  purge pending local telemetry events immediately. If the local telemetry store
  is temporarily unavailable, disabling still takes effect before future sends.
  It cannot retract bytes that were already sent over an active TCP connection.

### `oo telemetry status`

Show the effective telemetry state, local device id prefix if one already
exists, pending event count, and last successful flush time.

- Output: `enabled: true` when telemetry is enabled.
- Output: `enabled: false (env)` when disabled by `OO_TELEMETRY_DISABLED` or
  `DO_NOT_TRACK`.
- Output: `enabled: false (config)` when disabled by persisted
  `telemetry.enabled = false`.
- Output: `device_id` is `none` until telemetry has created a local device id.
- Output: `pending` is the number of local telemetry events queued for sending,
  including events already being sent but not yet confirmed.
- Notes: `status` does not create a device id and is not recorded as telemetry.

### `oo telemetry enable`

Persist `telemetry.enabled = true`.

- Notes: enabling telemetry does not purge pending events and is not recorded as
  telemetry.

### `oo telemetry disable`

Persist `telemetry.enabled = false` and attempt to purge all pending local
telemetry events immediately.

- Notes: disabling telemetry is not recorded as telemetry.

## Updates

### `oo install [version]`

Install one managed `oo` release into the local self-managed runtime.

- Arguments: `[version]` is optional. When omitted, `oo` installs the latest
  published release.
- Options: `--force` forces a reinstall even when the requested version is
  already installed.
- Options: `--no-modify-path` skips automatic PATH configuration; install will
  still print a setup note when the executable directory is not on `PATH`.
- Environment: setting `OO_NO_MODIFY_PATH` to a truthy value (`1`, `true`,
  `yes`, `on`, case-insensitive) is equivalent to `--no-modify-path`. The flag
  and the env var combine with OR semantics: either one being set skips PATH
  configuration.
- Environment: setting `OO_HIDE_PATH_SHADOWING_WARNING` to a truthy value hides
  the shadowing note for users who intentionally keep another `oo` earlier on
  `PATH`. It does not change managed installation, PATH setup, or legacy
  cleanup behavior.
- Output: on success, the CLI prints the installed version and the final
  executable path.
- Output: when `stderr` is an interactive TTY, the CLI also renders colored
  progress stages to `stderr` while the install is running.
- Notes: install verifies that the installed `oo` command is usable before
  reporting success.
- Notes: after a successful install, the CLI best-effort removes legacy global
  `@oomol-lab/oo-cli` package-manager installs that appear anywhere on `PATH`;
  when `PATH` yields no `oo` candidates, the CLI falls back to the current
  command path. For npm installs, cleanup targets the detected global prefix
  when it can be inferred. Cleanup failures do not change the command result.
- Notes: after PATH setup and legacy cleanup, if the current `PATH` still
  resolves `oo` to another executable before the managed executable directory,
  install prints a shadowing note that identifies that path and the managed
  directory.
- Notes: when automatic PATH modification is enabled, install ensures zsh
  startup profiles `.zprofile` and `.zshenv` contain the managed PATH snippet,
  even if the current `PATH` already contains the executable directory. When the
  executable directory is not on `PATH`, install also attempts to persist it for
  future shells. When automatic PATH configuration succeeds, install tells the
  user to restart their shell; when it fails, install prints a setup note that
  tells the user which directory to add.
- Notes: when some shell profiles were updated and others could not be,
  install lists both — the profiles that were updated and the profiles that
  could not be updated — followed by the restart-shell note. The user can
  then decide whether to update the failed profiles manually.
- Notes: after a successful install workflow, the CLI silently runs
  `oo skills add` with the managed executable so bundled skills refresh to the
  installed CLI version. That command also includes any successfully installed
  preset registry skills in the same skill summary.
- Notes: when the current version is `0.0.0-development`, the CLI prints the
  managed install/update unsupported message and exits successfully.

### `oo update`

Update the managed `oo` install to the latest published release.

- Arguments: none.
- Options: `--no-modify-path` skips automatic PATH configuration; update will
  still print a setup note when the executable directory is not on `PATH`.
- Environment: setting `OO_NO_MODIFY_PATH` to a truthy value (`1`, `true`,
  `yes`, `on`, case-insensitive) is equivalent to `--no-modify-path`. The flag
  and the env var combine with OR semantics: either one being set skips PATH
  configuration.
- Environment: setting `OO_HIDE_PATH_SHADOWING_WARNING` to a truthy value hides
  the shadowing note for users who intentionally keep another `oo` earlier on
  `PATH`. It does not change managed installation, PATH setup, or legacy
  cleanup behavior.
- Output: when the current version is already the latest published release, the
  CLI prints the up-to-date message.
- Output: when a newer published release is available, the CLI prints the
  version change result.
- Output: when `stderr` is an interactive TTY, the CLI also renders colored
  progress stages to `stderr` while the update is running.
- Notes: `oo update` ensures the managed install is current and usable, and
  does not expose a separate `--force` flag.
- Notes: when the latest published release matches the current version, update
  still runs `oo skills add` for the active managed version before printing the
  up-to-date message.
- Notes: after a successful update, the CLI best-effort removes legacy global
  `@oomol-lab/oo-cli` package-manager installs that appear anywhere on `PATH`;
  when `PATH` yields no `oo` candidates, the CLI falls back to the current
  command path. For npm installs, cleanup targets the detected global prefix
  when it can be inferred. Cleanup failures do not change the command result.
- Notes: after PATH setup and legacy cleanup, if the current `PATH` still
  resolves `oo` to another executable before the managed executable directory,
  update prints a shadowing note that identifies that path and the managed
  directory.
- Notes: when automatic PATH modification is enabled, update ensures zsh
  startup profiles `.zprofile` and `.zshenv` contain the managed PATH snippet,
  even if the current `PATH` already contains the executable directory. When the
  executable directory is not on `PATH`, update also attempts to persist it for
  future shells. When automatic PATH configuration succeeds, update tells the
  user to restart their shell; when it fails, update prints a setup note that
  tells the user which directory to add.
- Notes: when some shell profiles were updated and others could not be,
  update lists both — the profiles that were updated and the profiles that
  could not be updated — followed by the restart-shell note. The user can
  then decide whether to update the failed profiles manually.
- Notes: after a successful update workflow, the CLI silently runs
  `oo skills add` with the managed executable so bundled skills refresh to the
  installed CLI version. That command also includes any successfully installed
  preset registry skills in the same skill summary.
- Notes: when the current version is `0.0.0-development`, the CLI prints the
  managed install/update unsupported message and exits successfully.

### `oo upgrade`

Alias for `oo update`.

### `oo check-update`

Check whether a newer CLI release is available.

- Notes: when a newer release is found, the CLI prints the recommended upgrade
  command `oo update`.
- Notes: when the current release is already the latest one, the CLI prints a
  confirmation message.
- Notes: transient request failures are retried twice before the CLI gives up.
- Notes: successful and failed checks are not cached, so every invocation
  checks the latest published release.
- Notes: when the update check is temporarily unavailable, the CLI prints a
  retry-later message instead of exiting with an error.

## Environment

### `oo info`

Print CLI environment details, persisted store paths, and detected skill
agents.

- Options: `--format=json` and `--json` switch to structured JSON output.
  Without those flags, the command prints a human-readable colored summary.
- Output (JSON): a single object with three top-level fields:
  - `cli`: an object with the following string fields. `version` is the
    running CLI version. `platform` is the Node-style platform identifier
    (`darwin`, `linux`, `win32`, etc.). `arch` is the Node-style architecture
    identifier (`arm64`, `x64`, etc.). `storeDir` is the root directory of
    the persisted store. `logDir` is the persisted debug log directory.
    `authFile` is the persisted auth file path. `settingsFile` is the
    persisted configuration file path.
  - `agents`: an array of `{ id, skillDir, status }` entries, one per
    supported skill agent. `id` is the stable agent identifier (for example
    `codex`, `claude`, `hermes`). `skillDir` is the agent's resolved skill
    directory. `status` is one of `available`, `no_skills`, or
    `not_installed`. `available` means both the agent home directory and
    its skill directory exist locally. `no_skills` means the agent home
    directory exists but the skill directory has not been created yet (for
    example when `oo` could not write skills into the agent). `not_installed`
    means the agent home directory itself is missing, so `oo` has nowhere to
    install skills.
  - `features`: a reserved array for optional CLI capability flags. The CLI
    currently always returns an empty array.

## Connector

### `oo connector search <text>`

Search connector actions with free-form text.

- Arguments: `<text>` is the semantic search text.
- Options: `--keywords <keywords>` sends a comma-separated keyword list after
  trimming empty and duplicate entries.
- Options: `--format=json` and `--json` print a JSON array of matching action
  entries.
- Output: every match is enriched with `authenticated`.
- Output: JSON entries include the stable CLI fields `service`, `name`,
  `description`, and `authenticated`.
- Output: text output prints one block per action with the service/action
  label, optional description, and authenticated state.
- Notes: use `oo connector schema "<service>" --action "<action>"` to inspect
  the selected action contract.

### `oo connector schema <serviceName>`

Show the stable schema contract for one connector action.

- Arguments: `<serviceName>` is the service name.
- Options: `-a, --action <action>` selects the action name and is required.
- Options: `--refresh` fetches fresh metadata from the connector metadata API.
- Options: `--json` is accepted for compatibility and does not change output.
- Output: the command always prints a JSON object with the stable CLI fields
  `service`, `name`, `description`, `inputSchema`, and `outputSchema`.
- Notes: `--refresh` forces a fresh schema fetch for the selected action.

### `oo connector schema refresh`

Clear all locally cached connector action schemas.

- Arguments: none.
- Output: text output prints a single success line.
- Notes: the command does not require authentication and does not fetch new
  metadata immediately; later `oo connector schema` or `oo connector run`
  invocations fetch and cache schemas again when needed.

### `oo connector run <serviceName>`

Validate input data and run one connector action.

- Arguments: `<serviceName>` is the service name.
- Options: `-a, --action <action>` selects the action name and is required.
- Options: `-d, --data <data>` accepts inline JSON or `@path` to a JSON file.
  `--input <data>` is an alias for `--data <data>`.
- Options: `--dry-run` validates the payload without executing the action.
- Options: `--wait` polls the selected action until it reaches a terminal state.
  This option is only valid when the selected action schema declares an async
  result lifecycle.
- Options: `--wait-result` submits an async submit action and then polls its
  configured result action. This option is only valid when the selected action
  schema declares an async submit lifecycle.
- Options: `--format=json` and `--json` print a JSON object.
- Output: non-dry-run JSON output mirrors the stable response shape
  `{ data, meta: { executionId } }`.
- Output: for async submit actions, the default output is the submit result,
  such as a handle or session id. The CLI does not wait automatically.
- Output: with `--wait-result`, JSON output uses the completed result in `data`
  and includes `meta.pollAction`, `meta.pollCount`, `meta.submitExecutionId`,
  and `meta.handle`.
- Output: for async result actions, the default output is one result action
  response. With `--wait`, JSON output uses the completed result in `data` and
  includes `meta.pollCount`.
- Output: dry-run JSON output returns `{ dryRun, ok }`.
- Errors: stderr prints the HTTP status and includes the server `message`
  and `errorCode` when the failure response provides them.
- Notes: the command validates the input against the selected action contract
  before executing.
- Notes: while waiting for an async result action in text mode, interactive
  terminals show progress on stderr. JSON output does not include progress text.

## Search

### `oo search <text>`

Search packages and connector actions with one free-form query.

- Arguments: `<text>` is the search text sent to both discovery sources.
- Options: `--keywords <keywords>` sends a comma-separated keyword list after
  trimming empty and duplicate entries when searching connector actions.
- Options: `--format=json` and `--json` print one JSON array that mixes
  `package` and `connector` items and uses `kind` as the discriminator.
- Output: package JSON entries include the stable CLI fields `kind`,
  `packageId`, `displayName`, `description`, and `blocks`.
- Output: connector JSON entries include the stable CLI fields `kind`,
  `service`, `name`, `description`, and `authenticated`.
- Output: text output prints one block per result and includes a `Kind` line
  for each block instead of source section headers.
- Notes: use `oo connector schema "<service>" --action "<action>"` to inspect
  the full connector action contract.

## AI Agent Skills

Before running a command, `oo` silently synchronizes bundled and registry skills
for every supported host directory that already exists.

- Bundled skills: `oo` ensures `oo`, `oo-find-skills`, `oo-create-skill`, and
  `oo-publish-skill` are installed for each detected Universal, Codex,
  Claude Code, Hermes, CodeBuddy, WorkBuddy, Trae, Trae CN, OpenClaw,
  QoderWork, and DeepSeek TUI host.
  Existing oo-managed bundled skill targets are refreshed to the current `oo`
  version, except that `0.0.0-development` startup runs do not refresh
  existing bundled targets, and installed `0.0.0-development` bundled targets
  are left untouched.
- Registry skills: when a published skill already has a local canonical copy
  under `<config-dir>/skills/registry/<skill-id>`, `oo` publishes that copy to
  any newly detected supported host that is missing it.
- Local skills: agent-native local skills are not synchronized during startup.
  A local skill belongs to the agent skill directory where it was created.
- Migration: startup synchronization does not rewrite same-version legacy
  symlink targets. Use `oo skills add` for bundled skills and
  `oo skills update` for registry skills to replace legacy symlinks explicitly.
  Successful `oo install` and `oo update` workflows run both maintenance steps.
- Safety: startup synchronization does not fetch registry data, does not
  require authentication, does not print additional command output, and does
  not overwrite same-name targets that are not managed by `oo`.

### `oo skills info`

Show bundled and registry skills by default. Local skills are listed only when
requested. `oo skills list` is accepted as an alias for backwards compatibility.

- Options: `--source <source>`, `-s <source>` filters the list to one source:
  `bundled`, `registry`, or `local`.
- Options: `--agent <agent>` narrows the scan to one supported agent:
  `universal`, `codex`, `claude`, `hermes`, `codebuddy`, `workbuddy`, `trae`,
  `trae-cn`, `openclaw`, `qoderwork`, or `deepseek-tui`.
- Options: `--json` / `--format json` emits a structured JSON payload (see JSON
  output below). `--show-schema-version` (only meaningful with JSON output)
  adds a top-level `schemaVersion` field; without it, the payload starts at
  `summary`.
- Managed ownership rule: the command scans each existing supported local skill root:
  `~/.agents/skills`, `${CODEX_HOME:-~/.codex}/skills`,
  `~/.claude/skills`, `${HERMES_HOME:-~/.hermes}/skills`,
  `~/.codebuddy/skills`, `~/.workbuddy/skills`, `~/.trae/skills`,
  `~/.trae-cn/skills`, `${OPENCLAW_HOME:-~/.openclaw}/skills`,
  `~/.qoderwork/skills`, and `~/.deepseek/skills`. It keeps only child
  directories whose `.oo-metadata.json` identifies an oo-managed bundled,
  registry, or local skill. A child directory with the same name but without
  `.oo-metadata.json` is surfaced as a `non-managed` host of the matching
  managed skill (it is not listed as a separate top-level skill).
- Local source rule: `--source local` lists oo-managed local skills from agent
  skill directories. `--source local --agent <agent>` lists only that agent's
  local skills.
- Identity: top-level skill identity is `kind + name + packageName`. Version
  differences across hosts do not split a skill into separate entries;
  per-host versions are reflected in the JSON output's `hosts[].version`.
- Ordering: bundled skills are listed first when present, with `oo` before
  `oo-find-skills` before `oo-create-skill` before `oo-publish-skill`; the
  remaining skills are ordered by skill name. Host entries within a skill
  follow `Universal`, `Codex`, `Claude Code`, `Hermes`, `CodeBuddy`,
  `WorkBuddy`, `Trae`, `Trae CN`, `OpenClaw`, `QoderWork`, `DeepSeek TUI`
  order.
- Text output: text output prints a summary line and one block per visible
  skill, then per-host rows showing the agent, install status, and
  `controlState` (see below). Local paths and source paths are never printed
  in text output; use JSON for machine-readable detail.
- `controlState` values (per host):
  - `controlled` — the host directory is oo-managed and its contents match the
    canonical source.
  - `modified` — the host directory is oo-managed but its contents have been
    edited locally.
  - `non-managed` — the host directory exists with the same name as an
    oo-managed skill but has no `.oo-metadata.json` of its own.
  - `unknown` — metadata cannot be parsed, the source path is unavailable, or
    the directory comparison failed.

#### JSON output

When `--json` or `--format json` is supplied, the command writes a single line
of JSON to stdout. With `--show-schema-version`, the top-level object is
prefixed with `"schemaVersion": "1.0.0"`.

```json
{
  "schemaVersion": "1.0.0",
  "summary": {
    "registrySkills": 3,
    "localSkills": 2,
    "bundledSkills": 4
  },
  "skills": [
    {
      "id": "oo",
      "name": "oo",
      "kind": "bundled",
      "packageName": null,
      "version": "1.2.3",
      "description": "Use OOMOL hosted capabilities",
      "hosts": [
        {
          "agentId": "codex",
          "status": "installed",
          "path": "/Users/name/.codex/skills/oo",
          "sourcePath": "/Users/name/Library/Application Support/oo/skills/bundled/codex/oo",
          "version": "1.2.3",
          "controlState": "controlled"
        }
      ]
    }
  ]
}
```

Field semantics:

- `summary` always reflects the full inventory and is **not** affected by
  `--source` or `--agent` filters. Use it to see how many skills exist in
  total even when the `skills` view is filtered.
- `skills` reflects the current filtered view. By default, local skills are
  hidden from `skills` (matching legacy `oo skills list` behavior); pass
  `--source local` to view them.
- `skills[].packageName` is `null` for bundled and local skills. Bundled
  skills are not distributed via a registry package, so no virtual
  `packageName` is invented in JSON. Text output displays `<internal>` /
  `<local>` as human-facing placeholders.
- `skills[].version` is the top-level version. When the same skill is
  installed at different versions across hosts, the top-level is one entry;
  per-host versions appear in `hosts[].version`.
- `hosts[].status` is `"installed"` in this release. The field is reserved
  for future host states.
- `hosts[].sourcePath` is the canonical source directory for bundled and
  registry skills, `null` for local skills, and `null` for non-managed host
  entries.

### `oo skills locate <skill-id>`

Print the local path for an installed skill.

- Arguments: `<skill-id>` is the directory name to locate under supported
  skill roots. Path-shaped values are rejected; pass paths directly to
  `oo skills publish`.
- Options: `--agent <agent>` narrows the scan to one supported agent:
  `universal`, `codex`, `claude`, `hermes`, `codebuddy`, `workbuddy`, `trae`,
  `trae-cn`, `openclaw`, `qoderwork`, or `deepseek-tui`.
- Resolution: with `--agent`, the command checks only that agent's
  `<agent-home>/skills/<skill-id>` path. Without `--agent`, it checks all
  available supported agent skill roots plus canonical registry storage under
  `<config-dir>/skills/registry/<skill-id>`.
- Match rule: a candidate matches when it contains `SKILL.md`. The command does
  not validate skill frontmatter or `.oo-metadata.json`; publish performs that
  validation.
- Output: when exactly one candidate matches, stdout is that path plus a
  newline. When no candidates match, or multiple candidates match, the command
  exits non-zero. Ambiguous errors list the candidate paths and tell callers to
  pass `--agent` or publish one path directly.

### `oo skills preflight`

Check whether this environment has permission to author local skills for one
agent.

- Options: `--agent <agent>` is required and selects one supported agent:
  `universal`, `codex`, `claude`, `hermes`, `codebuddy`, `workbuddy`, `trae`,
  `trae-cn`, `openclaw`, `qoderwork`, or `deepseek-tui`.
- Host check: the selected agent home directory must already exist.
- Storage check: the command creates the selected agent's skills root, such as
  `<agent-home>/skills`, when needed. It writes and removes a temporary probe
  file in that directory.
- Output: on success, text output prints the writable storage path and number
  of checked supported hosts. The count is `1` for a successful agent check. On
  failure, the command exits non-zero.

### `oo skills init <name>`

Initialize one local skill in the selected agent's own skill directory.

- Arguments: `<name>` is normalized to lowercase hyphen-case and used as the
  skill id, target directory name, and frontmatter `name`.
- Options: `--agent <agent>` is required and selects the agent skill directory
  to write. Accepted values are `universal`, `codex`, `claude`, `hermes`,
  `codebuddy`, `workbuddy`, `trae`, `trae-cn`, `openclaw`, `qoderwork`, and
  `deepseek-tui`.
- Options: `--description <text>` is required and writes the generated
  `SKILL.md` frontmatter description.
- Generated `SKILL.md` frontmatter includes `compatibility: "Requires the oo
  CLI."`.
- Generated `SKILL.md` body includes the managed oo execution notice and
  editable placeholder sections for when to use the skill, inputs, execution,
  result handling, and failure handling.
- Metadata: the created skill directory includes `.oo-metadata.json`
  identifying the skill as a local skill managed by `oo`.
- Options: `--icon <icon>` writes a non-empty icon reference to `metadata.icon`
  in the generated `SKILL.md` frontmatter. The value may be an emoji, an image
  URL, or `:collection:icon:` where `collection` and `icon` are names from
  <https://icones.js.org/>.
- Options: `--title <title>` writes `metadata.title` to the generated
  `SKILL.md` frontmatter. When omitted, `metadata.title` is not generated.
- Target directory: the skill is created at the selected agent's
  `<agent-home>/skills/<skill-id>`.
- Publication mode: the command does not copy the new local skill to other
  agents.
- Failure behavior: if the selected agent home does not exist, or if the target
  directory already exists, the command exits non-zero before writing the skill.
- Output: text output prints the initialized skill id and target path.

### `oo skills validate <path>`

Validate a local skill directory against the generic skill contract.

- Arguments: `<path>` is the skill directory containing `SKILL.md`.
- Validation: `SKILL.md` frontmatter must be a dictionary with string `name`
  and non-empty string `description` fields.
- Validation: nested `metadata` is optional, but when present it must be a
  dictionary. Nested `metadata.icon` and `metadata.title` are optional, but when
  present they must be non-empty strings.
- Warnings: missing `metadata.icon` or `metadata.title` prints a warning, but
  does not make validation fail.
- Output: on success, the command prints a concise success message. On failure,
  it prints the validation error and exits non-zero.

### `oo skills publish <path>`

Convert one skill into an OOMOL package and run the publish step.

- Arguments: `<path>` must be a skill directory containing `SKILL.md`, or the
  `SKILL.md` file itself. Relative paths resolve from the current working
  directory. Bare skill ids are not resolved by this command; use
  `oo skills locate <skill-id>` first when needed.
- Options: `--visibility <visibility>` sets the registry package visibility.
  Accepted values are `private` and `public`. When omitted, an existing package
  keeps its current registry visibility. If no existing visibility can be read,
  an interactive terminal prompts for `private` or `public`.
- Options: `-y, --yes` answers publish confirmation prompts with yes.
- Options: `--force` is accepted for compatibility with older workflows.
- Source resolution: `.oo-metadata.json` determines whether the path is an
  oo-managed local skill, an oo-managed registry skill, or an unmanaged path
  source. Invalid oo metadata fails before publishing. Bundled skills are
  rejected because they are managed by the oo CLI release.
- Registry source resolution: when the path has registry metadata with a scoped
  package name, that package name is used as the target. If no scoped package
  name is available and the installed metadata package name differs from the
  target package name, an interactive `[y/N]` confirmation is required before
  publishing under the current account scope unless `-y, --yes` is provided.
- Authentication: the command requires the current OOMOL account. If the source
  has an existing scoped `metadata.packageName`, that package name is preserved;
  otherwise the package name is `@<lowercase-account.name>/<lowercase-skill-id>`.
- Validation: the source directory must contain `SKILL.md` with frontmatter
  `name` matching `<skill-id>` and a non-empty string `description`.
  Optional `metadata.title`, `metadata.icon`, `metadata.packageName`, and
  `metadata.version` must be non-empty strings when present, and
  `metadata.version` must be semver.
- Package metadata: missing `metadata.title` falls back to a title generated
  from `<skill-id>`. Missing `metadata.version` falls back to `0.0.1`.
- Package contents: the skill directory's `.gitignore` controls which local
  files are excluded from the published package. When the skill has no
  `.gitignore`, the built-in package template is used. Symbolic links are
  rejected during packaging. `.oo-metadata.json` is always excluded from the
  published package.
- Registry safety: before publishing, the command looks up the latest remote
  package metadata. If the remote package already contains blocks, an
  interactive terminal prompts for confirmation with the standard `[y/N]`
  confirmation style unless `-y, --yes` is provided. Answering no, pressing
  Enter, or running without an interactive stdin stops before conversion, PUT,
  or local metadata writeback.
- Visibility resolution: explicit `--visibility` is used as-is. Without it, the
  command preserves a latest remote package marked `public` as public and a
  private/restricted remote package as private. If the latest package metadata
  is missing or does not include visibility, the command asks for `private` or
  `public`; non-interactive runs must pass `--visibility`.
- Version resolution: if the requested version is not greater than the latest
  remote package version, the command publishes the next patch version.
- Writeback: after the publish step succeeds, `SKILL.md` frontmatter is updated
  with the final `metadata.packageName` and `metadata.version`.
- Registry writeback: after publishing an oo-managed registry skill, the command
  updates registry ownership metadata. If the source path is not canonical
  registry storage, it replaces `<config-dir>/skills/registry/<skill-id>` with
  the published source, then copies canonical storage to every available
  supported agent. If no supported agent home is available, publish and
  canonical writeback still succeed.
- Output: on success, text output prints the skill id, final package specifier,
  selected visibility (`private` or `public`), and the Hub package URL
  for the current account endpoint, for example
  `https://hub.oomol.com/package/<packageName>` for production accounts. On
  failure, the command exits non-zero and leaves `SKILL.md` unchanged.

### `oo skills share [skill]`

Share a published skill package, confirm the exact skill being shared, and
print a prompt that can be copied to another user. Public packages are shared
directly. Private or restricted packages are shared through a temporary
registry share id.

- Arguments: `[skill]` is optional in an interactive terminal. It may be a local
  skill id, an installed registry skill id, a path to a skill directory
  containing `SKILL.md`, or a package name. When omitted, the command prompts for
  the skill id, package name, or path.
- Options: `--downloads <downloads>` limits temporary private-package installs.
  When omitted, installs are unlimited. Non-numeric values fail. Numeric values
  that are not positive safe integers use the default unlimited value.
- Options: `--days <days>` sets the temporary private-package share duration.
  The default is `7` days and the maximum is `7` days. Non-numeric values fail.
  Numeric values outside the valid range use the default `7`.
- Options: `-y, --yes` skips the final `[y/N]` confirmation after the command
  resolves the skill id and package name.
- Resolution: the argument may identify a local skill, an installed registry
  skill, a skill directory path, or a package name. Skill ids are resolved by
  checking local skills first, then installed registry skills. Path-like
  references are resolved as skill directories. If no skill or path can be
  resolved, or if the resolved skill does not identify a package, the argument
  is treated as a package name.
- Package check: the command requests latest package metadata for the resolved
  package. Public packages use `<packageName>` directly in the prompt. Private
  packages create a temporary share and display the share token as
  `<packageName>#<shareID>`. Missing visibility metadata is treated as public.
  Unpublished packages are rejected before any share prompt is printed.
- Output: on success, text output prints a single copyable plain text code
  block, with no nested command fences. The prompt language follows the active
  CLI language (`--lang en` or `--lang zh`). The prompt states the skill or
  package is already published, includes the package name, Hub URL, and skill
  id for skill targets, links to the general install preparation guide at
  `https://static.oomol.com/oo-cli/skill-install-guide/install.md`, and then
  prints the final install command.
  The prompt tells the recipient to follow that guide to check OO CLI and login
  state before running the install command. Skill-target prompts continue
  through `oo skills install <packageName> --skill <skill-id> -y` for public
  packages, or
  `oo skills install <packageName>#<shareID> --skill <skill-id> -y` for private
  packages. Package-target prompts continue through
  `oo skills install <packageName> -y` for public packages, or
  `oo skills install <packageName>#<shareID> -y` for private packages.
  Private-package prompts identify the exact temporary install specifier
  `<packageName>#<shareID>` and do not present the target as already public.

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

### `oo skills install [packageName]`

Install bundled or published skills into supported local skill directories.

- Alias: `oo skills add [packageName]`.
- Arguments: `[packageName]` is optional.
- Arguments: when omitted, the command installs all bundled skills, then
  best-effort installs all skills from preset registry skill packages.
- Arguments: when `[packageName]` is `oo`, `oo-find-skills`,
  `oo-create-skill`, or `oo-publish-skill`, the command installs the
  corresponding bundled skill.
- Arguments: when `[packageName]` is a published package name, the command
  installs skills from that package. `[packageName]` may include an explicit
  version as `<packageName>@<version>`, including scoped package forms such as
  `@scope/name@1.2.3`.
- Arguments: `[packageName]` may also use `<packageName>#<shareID>`. In that
  form, the command reads the package skill list from `<packageName>` and
  downloads the package archive through the share identified by `<shareID>`.
- Options: `-s, --skill <skills...>` installs one or more named published
  skills from the package.
- Options: `-s, --skill '*'` installs all published skills from the package.
- Options: `--all` is shorthand for installing all published skills from the
  package without a skill-selection prompt.
- Options: `-y, --yes` skips confirmation prompts. When a package publishes
  multiple skills and no explicit `--skill` is provided, `-y` installs all of
  them.
- Options: `-f, --force` overrides install when the target directory exists
  with the same skill name but is **not** managed by oo (no readable
  `.oo-metadata.json`). The previous directory contents are removed before the
  new skill is written; a `warn` log records the overwrite. `--force` does
  **not** bypass path containment, package validation, auth, or download
  validation; it does **not** affect startup auto-sync, `oo skills update`,
  `oo skills sync`, `oo skills uninstall`, or `oo skills publish`; and it does
  **not** implicitly select all skills inside a multi-skill package (use
  `--skill` or `--all -y` together with `--force`).
- Output: successful non-interactive installs print a compact summary grouped by
  installed skills and target AI agents. When exactly one target is written, the
  summary includes that target path.
- Output: when omitted `[packageName]` also installs preset registry skills
  successfully, those skill names are included in the same `Installed ...`
  summary and `Skills:` list.
- Notes: when a package publishes exactly one skill and no `--skill` is
  provided, the command installs that skill automatically.
- Notes: preset registry skill package failures are ignored and do not change
  the command result.
- Notes: when a package publishes multiple skills and no `--skill`, `--all`, or
  `-y` is provided, the command opens an interactive picker in a TTY.
- Notes: in the interactive picker, skills already installed from the same
  package start selected. Clearing such a selection removes that installed
  skill when the command completes.
- Canonical directory: bundled skills are materialized under
  `<config-dir>/skills/bundled/<agent>/<skill-id>`, where `<config-dir>` is the
  directory that contains `settings.toml` and `<agent>` is `universal`,
  `codex`, `claude`, `hermes`, `codebuddy`, `workbuddy`, `trae`, `trae-cn`,
  `openclaw`, `qoderwork`, or `deepseek-tui`.
- Canonical directory: published skills are materialized to
  `<config-dir>/skills/registry/<skill-id>`.
- Migration: on first run after upgrading, `oo skills install` removes legacy
  canonical directories left over from earlier releases (`claude-skills/`,
  `openclaw-skills/`, and any Codex-bundled or registry skill directory that
  lived directly under `skills/`). Bundled skills are rebuilt automatically in
  the new layout; previously-installed published skills must be reinstalled
  with `oo skills install <packageName>`.
- Target directory: bundled and published skills are published to each existing
  supported host directory, currently
  `~/.agents/skills/<skill-id>`,
  `${CODEX_HOME:-~/.codex}/skills/<skill-id>`,
  `~/.claude/skills/<skill-id>`,
  `${HERMES_HOME:-~/.hermes}/skills/<skill-id>`,
  `~/.codebuddy/skills/<skill-id>`,
  `~/.workbuddy/skills/<skill-id>`,
  `~/.trae/skills/<skill-id>`,
  `~/.trae-cn/skills/<skill-id>`,
  `${OPENCLAW_HOME:-~/.openclaw}/skills/<skill-id>`,
  `~/.qoderwork/skills/<skill-id>`, and
  `~/.deepseek/skills/<skill-id>`.
- Target directory: if an existing supported host is missing its `skills` root,
  the command creates that root before publishing the selected skill.
- Path rule: published skill names are accepted only when their resolved
  canonical and target directories remain under those local `skills` roots.
- Installation mode: bundled and published skills are copied into every target
  skills directory. Existing oo-managed symlink targets from older releases are
  replaced with copied directories when the skill is installed, refreshed, or
  updated explicitly.
- Metadata: new bundled and registry writes include a hidden
  `.oo-metadata.json` file with an oo source marker and schema version.
  Bundled metadata records the current `oo` version; registry metadata records
  the source package and package version. Existing legacy bundled and registry
  metadata remains readable.
- Notes: all registry requests for published skills send the active account's
  `Authorization` header.
- Notes: when a package publishes multiple skills and the command runs outside
  an interactive terminal, you must provide `--skill <name>` or `--all -y`.
- Notes: when an explicitly requested published skill conflicts with an
  existing same-name skill, the command asks for `yes` or `no` before
  overwriting it in an interactive terminal.
- Notes: existing target directories without valid `oo` metadata are treated as
  non-OOMOL skills and are not overwritten.
- Notes: in the interactive picker, conflicting skills are marked in the list;
  selecting one means it will be overwritten.
- Notes: the command exits with an error when none of the supported Universal,
  Codex, Claude Code, Hermes, CodeBuddy, WorkBuddy, Trae, Trae CN, OpenClaw,
  QoderWork, or DeepSeek TUI home directories exist.
- Notes: an existing bundled or registry skill installation is considered
  managed by `oo` only when its `.oo-metadata.json` identifies that source.
  Otherwise `oo` treats it as a different skill and will not overwrite it.

### `oo skills sync upload`

Upload installed oo-managed registry skills to the skills sync service.

- Options: `--source <source>` selects the sync source. The only supported value
  is `registry`; when omitted, the command uses `registry`.
- Options: `-i, --ignore <patterns...>` excludes registry skills from upload by
  matching patterns against either `packageName` or skill name. The option may
  be repeated, and each value may contain comma-separated patterns. Patterns use
  gitignore-style matching.
- Scope: the command uploads only installed published registry skills whose
  `.oo-metadata.json` identifies registry ownership and package identity.
  Bundled and local skills are never uploaded.
- Request: the command sends `PUT https://api.<endpoint>/v1/skills` with a JSON
  array of `{ "packageName": string, "version": string, "skillName": string }`.
  The active account's `Authorization` header is included.
- Behavior: the server-side manifest is overwritten, including with an empty
  array when no registry skills remain after filtering.
- Output: on success, text output prints the number of uploaded registry skills.

### `oo skills sync apply`

Install uploaded oo-managed registry skills into supported local skill
directories.

- Aliases: `oo skills sync download`, `oo skills sync install`.
- Options: `--source <source>` selects the sync source. The only supported value
  is `registry`; when omitted, the command uses `registry`.
- Request: the command reads `GET https://api.<endpoint>/v1/skills`. The active
  account's `Authorization` header is included.
- Behavior: each uploaded entry is installed from its recorded `packageName` and
  `version`, and only the recorded `skillName` is selected from that package.
- Scope: only registry skills are applied. Bundled and local skills are never
  restored by this command.
- Output: when the uploaded manifest is empty, text output reports that no
  uploaded registry skills were found. Otherwise, regular install summaries are
  printed, followed by a final applied-count line.

### `oo skills update [skills...]`

Update installed oo-managed published skills.

- Arguments: when omitted, the command checks every installed oo-managed
  published skill.
- Arguments: when one or more skill names are provided, only those named skills
  are checked and updated.
- Bundled skills: bundled skills such as `oo`, `oo-find-skills`,
  `oo-create-skill`, and `oo-publish-skill` are excluded from this command.
  Refresh them with `oo skills add`, or let a
  successful `oo install` or `oo update` refresh them automatically.
- Ownership rule: a skill is considered managed for update only when its
  `.oo-metadata.json` identifies registry ownership and package identity;
  bundled and local metadata are ignored by this command.
- Published skills: registry-backed skills derive their package identity from
  `.oo-metadata.json`, then fetch package info without an explicit version to
  determine the latest available package version.
- Update order: the command refreshes the canonical
  `<config-dir>/skills/registry/<skill-id>` copy before republishing to
  each existing supported host directory.
- Interactive terminals: renders live progress while checking and updating
  skills.
- Non-interactive terminals: prints one status line for each current or failed
  skill, and one success line for each updated host target path.

### `oo skills uninstall [skill]`

Remove oo-managed skills from supported local skill directories.

- Alias: `oo skills remove [skill]`.
- Arguments: when `[skill]` is omitted, the command removes all bundled skills.
- Options: `--agent <agent>` narrows local skill removal to one supported
  agent. It is used to disambiguate same-name local skills across agents.
- Arguments: when `[skill]` is provided, the command checks published registry
  installations and agent-native local skills for that skill name. If both
  match, both are removed. Registry installations are removed before local
  installations.
- Ownership rule: a bundled skill is removable from a supported host only when
  that host's installed directory has a `.oo-metadata.json` file that
  identifies bundled ownership.
- Ownership rule: a local skill is removable when its agent skill directory
  contains `.oo-metadata.json` identifying local ownership.
- Local ambiguity: when no `--agent` is provided and multiple agent-native local
  skills with the requested name exist, the command prints an error, exits
  non-zero, and does not remove any local skill. If exactly one local match
  exists, it is removed.
- Canonical directory removed: bundled skills remove
  `<config-dir>/skills/bundled/<agent>/<skill>` for each installed agent.
  Published skills remove `<config-dir>/skills/registry/<skill>`.
- Target directory removed: bundled and published skills are removed from every
  existing supported host directory, currently
  `~/.agents/skills/<skill>`, `${CODEX_HOME:-~/.codex}/skills/<skill>`,
  `~/.claude/skills/<skill>`, `${HERMES_HOME:-~/.hermes}/skills/<skill>`,
  `~/.codebuddy/skills/<skill>`, `~/.workbuddy/skills/<skill>`,
  `~/.trae/skills/<skill>`,
  `~/.trae-cn/skills/<skill>`,
  `${OPENCLAW_HOME:-~/.openclaw}/skills/<skill>`,
  `~/.qoderwork/skills/<skill>`, and `~/.deepseek/skills/<skill>`. Local skills
  remove only the selected agent-native local directory.
- Path rule: `[skill]` must resolve to child directories under those local
  `skills` roots. Names that escape those roots are rejected.
- Notes: when no supported target has a managed installation and no matching
  agent-native local skill exists for the requested skill, or an existing same-name
  target is not managed by `oo`, the command exits with an error.

## Logs

### `oo log path`

Print the current persisted debug log directory path.

### `oo log print`

Print one previous persisted debug log file.

- Arguments: `[index]` is optional and must be an integer greater than or equal
  to `1`. `1` means the previous log file, and larger values continue walking
  backward through retained logs.
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
- Notes: each in-progress download owns an isolated temporary file in the target
  directory. Concurrent downloads of the same URL and output directory do not
  merge or append to one another's partial files.
- Notes: if a download stops partway through, rerunning the same command against
  the same output directory will attempt to resume with HTTP Range. If the
  server does not resume safely, the CLI restarts the transfer from byte `0`.
- Notes: resume metadata is best-effort. If local resume metadata cannot be
  read or written, the current download can still complete, but later resume may
  not be available.
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
- Notes: the uploaded file expires after seven days and is deleted on the server.
- Notes: files larger than `500 MiB` are rejected.
- Notes: successful uploads persist a local sqlite record with the upload time,
  file name, file size, signed download URL, expiry time, and a UUID v7 id.
- Notes: JSON and text output return `downloadUrl` as a URI-safe signed URL.
  The `fileName` field keeps the original uploaded file name.

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
- Notes: output normalizes legacy signed download URLs when possible, while
  leaving `fileName` unchanged.

### `oo file cleanup`

Delete expired or stale file transfer records.

- Options: `--format <format>` returns structured output. Supported value:
  `json`.
- Options: `--json` is an alias for `--format=json`.
- Notes: local upload records with `expiresAt <= now` are deleted.
- Notes: download resume sessions older than 14 days are deleted when they are
  not owned by an active download process.
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
  `@path/to/file.json`. `--input <data>` is an alias for `--data <data>`.
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
