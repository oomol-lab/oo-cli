# oo Command Reference

[English](./commands.md) | [简体中文](./commands.zh-CN.md)

Project overview: [README.md](../README.md)

## Global Options

- `--debug`: Print the current log file path to `stderr` when the CLI exits.
- `--lang <lang>`: Override the display language for the current invocation.
  Supported values: `en`, `zh`.
- `-h, --help`: Show help for the current command.
- `-V, --version`: Show the current CLI version, build time, and commit hash.

## Environment Variables

The CLI reads these environment variables to support embedded and automated
use. Truthy values are `1`, `true`, `yes`, or `on` (case-insensitive).

- `OO_CONFIG_DIR`: Override the configuration root directory that holds
  `auth.toml`, `connector.toml`, `settings.toml`, and telemetry data (and,
  unless `OO_DATA_DIR` is set, the `data` subdirectory). Takes precedence over
  `XDG_CONFIG_HOME`.
- `OO_DATA_DIR`: Override the data directory that holds the local cache,
  uploads, and download-session state. Defaults to `<config-root>/data`.
- `OO_LOG_DIR`: Override the debug-log directory. Takes precedence over every
  platform default.
- `OO_API_KEY`: Run execution commands with this API key without an interactive
  login. When set, the CLI builds an in-memory account and does not read,
  require, or write `auth.toml`, and it takes precedence over any saved account.
  Because no saved account can be in effect while it is set, `oo auth logout`,
  `oo auth switch`, `oo team use`, and `oo team clear` become no-ops that leave
  `auth.toml` untouched, and `oo auth login` still saves the account but reports
  that this variable outranks it. `oo auth status` reports the identity this
  variable provides. No saved default team applies either: the key may belong to
  a different account, so commands run under the personal identity unless
  `OO_TEAM_ID` or `OO_TEAM_NAME` selects a team.
- `OO_ENDPOINT`: Base endpoint domain (for example `oomol.com` or `oomol.dev`)
  used to derive every service URL for execution commands. It pairs with
  `OO_API_KEY`, overrides the endpoint of a saved account (including the
  endpoint `oo auth status` reports and validates against), and selects the
  endpoint `oo auth login` authenticates against.
- `OO_CONNECTOR_URL`: Self-hosted connector server URL. It overrides the
  configuration saved by `oo connector login`. Only connector commands
  (`oo connector search/schema/run/proxy/apps` and top-level `oo search`)
  route requests to it; other commands never send requests to it, but
  `oo auth status` and `oo auth login` report the configured self-hosted
  connector, and account-requiring commands mention it in their
  login-required error when no account is available.
- `OO_CONNECTOR_TOKEN`: Optional runtime API token paired with
  `OO_CONNECTOR_URL`. Ignored when `OO_CONNECTOR_URL` is not set.
- Connector commands resolve their target server with this precedence:
  `OO_CONNECTOR_URL` > `OO_API_KEY` > the saved self-hosted connector
  configuration (`oo connector login`) > the active account.
- `OO_TEAM_ID`: Run connector commands (`oo connector run`, `oo connector
  proxy`, `oo connector apps`, `oo connector search` / `oo search`) under the
  team with this id. It takes precedence
  over `OO_TEAM_NAME` and the account's default team; the per-run
  `--team` and `--personal` flags still outrank it. Before execution the CLI
  validates the id and resolves its team name (one extra request per
  invocation), so requests carry both the name and the id; an id the account
  cannot use — not a member, no such team, team deleted — fails with exit
  `1`. If the lookup itself cannot complete, the id is sent on its own and
  the backend stays the judge. Ignored when the connector target is
  self-hosted.
- `OO_TEAM_NAME`: Same as `OO_TEAM_ID`, but selects the team by name. Before
  execution the CLI resolves the name to its team id through the account's
  team memberships (one extra request per invocation), so requests carry both
  the name and the id; a name the account cannot access fails with exit `1`.
  If the lookup itself cannot complete, the name is sent on its own and the
  backend stays the judge. `oo connector run --dry-run` sends no execution
  request and skips the lookup entirely, so it stays offline. Ignored when
  `OO_TEAM_ID` is set or the connector target is self-hosted.
- Connector commands resolve their team identity with this precedence:
  `--personal` / `--team` > `OO_TEAM_ID` > `OO_TEAM_NAME` > the active account's
  default team > your personal identity.
- `OO_SKILLS_SYNC_DISABLED`: A truthy value disables the startup managed-skill
  synchronization, so the CLI writes no skill files into agent home directories
  such as `~/.agents` or `~/.claude`.
- `OO_NO_SELF_UPDATE`: A truthy value disables `oo update`, `oo install`, and
  `oo check-update` and forces self-update PATH modification off.

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

Start a device login flow, authenticate with a session token, or authenticate
with an existing API key, then save the authenticated account.

- Notes: the CLI prints the verification URL with the user code in the
  `user_code` query parameter, then waits up to 10 minutes for the device login
  to be verified when neither `--session-token` nor `--api-key` is provided. It
  exits with a timeout error if verification does not complete within that
  window.
- Options:
  - `--session-token <session-token>`: Authenticate with an existing session
    token. The CLI does not print a device-login URL or poll for verification
    when this option is provided.
  - `--api-key <api-key>`: Authenticate with an existing API key. The CLI
    validates the key against the account profile and saves the account without
    a device-login URL or polling. Exits with an error if the key is invalid or
    expired. `--api-key` and `--session-token` cannot be combined.
  - `--team <name>`: Set the account's default team identity to the named team
    after login. The name must be one of the account's
    team memberships; otherwise the command exits `1` (the account itself is
    still saved). Works with all three login methods.
- Default team: after a successful login the CLI fetches the account's team
  memberships and persists a default team identity on the saved account.
  Without `--team`, a stored default that is still one of the memberships is
  kept (and gains its team id);
  otherwise the backend-provisioned default team (`system_created`) is
  adopted. When neither exists — the membership list carries no
  `system_created` team (an older backend) or is empty — nothing is persisted,
  no default-team line is printed, and login still exits `0`. Otherwise the
  success output prints the resulting default
  (`Default team identity: <name>`), and when the account belongs to more than
  one team it also prints how many teams the account has (naming at most five,
  truncating the rest with an ellipsis) and that `oo team use <name>` switches
  the default. When the membership request fails and no `--team` was given,
  login still exits `0` and prints that the default team is unchanged. When
  `OO_TEAM_ID` / `OO_TEAM_NAME` is set, the default is still saved but a hint
  notes that the env override keeps outranking it.
- Notes: when a self-hosted connector is configured (`oo connector login`), it
  keeps handling connector commands after login; the success output prints a
  hint that `oo connector logout` switches them back to OOMOL.
- When `OO_API_KEY` is set, login still validates and saves the account, but
  that variable keeps outranking it. The success output prints a hint that the
  saved account takes effect only once `OO_API_KEY` is unset.
- `OO_ENDPOINT` selects the host login authenticates against for all three
  methods (device login, session token, and API key), and the saved account
  records that endpoint. Without it the public default is used.

### `oo auth logout`

Remove the current account from persisted auth data.

- When `OO_API_KEY` is set it supplies the credential instead of a saved
  account, so there is nothing for this command to log out of. It exits `0`
  without modifying `auth.toml` and reports that nothing was logged out.

### `oo auth status`

Show every saved auth account and validate the API key of the active one.

- Aliases: `oo auth info`.
- Reports the identity that commands actually run as, which is not always the
  active saved account: `OO_API_KEY` outranks `auth.toml` entirely, and
  `OO_ENDPOINT` redirects the endpoint of a saved account. The reported
  endpoint is the one the API key is validated against.
- When `OO_API_KEY` is set, the status is always `logged-in` (a stale active id
  in `auth.toml` is irrelevant), no saved account is marked `[active]`, and
  text output notes that saved accounts are not in use. `auth.toml` is then
  only a source of the account list, so it is never created when missing, and
  an unreadable one leaves `accounts[]` empty instead of failing the command.
- An unreadable `auth.toml` never fails the command: status renders the report
  with a warning naming the unreadable file, an empty account list, and exit
  code 0. With `--format json` the warning goes to stderr so stdout stays
  machine-readable. A missing file is never created.
- Text output lists all saved accounts under an `Accounts:` block. The active
  account is annotated with `[active]`; the active account additionally shows
  `API key status` resolved from a single profile request to its endpoint.
  Inactive accounts are not validated, so the number of saved accounts never
  changes how many requests are sent.
- The active-identity block also shows a `Default team` line, resolved the same
  way `oo team current` resolves it: the `OO_TEAM_ID` / `OO_TEAM_NAME` env
  override when set (annotated with the variable that supplies it), otherwise
  the active account's default team, otherwise `personal (no default team)`.
  With `OO_API_KEY` set the line always reads `personal (no default team)`
  unless an `OO_TEAM_*` variable selects one.
- When `OO_TEAM_ID` or `OO_TEAM_NAME` supplies the identity, the missing half
  is looked up — the id resolves to its name, the name to its id through the
  account's team memberships — and the line shows `<name> (<id>)`. If the
  lookup does not succeed, the value is still shown and the reason is appended:
  the active account is not a member of the team, no team exists with that id,
  the team has been deleted, or the lookup could not be completed. A failed
  lookup never changes the exit code and never affects the reported `API key
  status`. The account's default team already names its team and is never
  looked up.
- `oo auth status` therefore sends at most two requests: the API key check, plus
  the team lookup when `OO_TEAM_ID` / `OO_TEAM_NAME` is in effect. The two are
  independent and are sent concurrently.
- API key values are never written to stdout in text or JSON output.
- When a self-hosted connector is configured (`oo connector login` or
  `OO_CONNECTOR_URL`), text output adds a self-hosted connector block showing
  the server URL, whether a token is configured, and the configuration source.
  The token value is never printed.
- Options: `--format=json` and `--json` switch to structured JSON output.
  `--show-schema-version` prepends `schemaVersion` to the payload.
- JSON shape (one of three):

  ```json
  {
    "status": "logged-in",
    "activeAccountId": "user-1",
    "accounts": [
      { "id": "user-1", "name": "Alice", "endpoint": "oomol.com", "active": true, "apiKeyStatus": "valid" },
      { "id": "user-2", "name": "Bob",   "endpoint": "oomol.com", "active": false }
    ]
  }
  ```

  ```json
  { "status": "logged-out", "activeAccountId": null, "accounts": [] }
  ```

  ```json
  {
    "status": "active-account-missing",
    "activeAccountId": null,
    "missingAccountId": "user-1",
    "accounts": [
      { "id": "user-2", "name": "Bob", "endpoint": "oomol.com", "active": false }
    ]
  }
  ```

- When a self-hosted connector is configured, each of the three shapes may
  additionally carry an optional top-level `connector` field:

  ```json
  {
    "connector": { "url": "http://localhost:3000", "tokenConfigured": true, "source": "file" }
  }
  ```

- When a default team identity is in effect, the `oo auth status --json` output
  — specifically its `logged-in` shape above — carries an optional top-level
  `team` field. `source` says which mechanism selected it (`env_id`, `env_name`
  or `account`), and `status` reports the team lookup:

  ```json
  {
    "team": { "name": "acme", "id": null, "source": "account", "status": null }
  }
  ```

  ```json
  {
    "team": {
      "name": "platform",
      "id": "019ed9dd-57b1-77eb-86b7-09724abe8037",
      "source": "env_id",
      "status": "valid"
    }
  }
  ```

  `status` is `null` whenever no lookup was attempted (the `account` source).
  For an env-selected identity it is one of `valid`, `not_a_member`,
  `not_found`, `deleted`, `request_failed`, `request_failed_sandbox`, or
  `no_credential`. The looked-up half is filled only when `status` is `valid`
  — the name under `env_id`, the id under `env_name` — while the env-supplied
  half is always present.

- When `OO_API_KEY` supplies the credential, the `oo auth status --json` output
  is always the `logged-in` shape and carries an optional top-level
  `envOverride` field:

  ```json
  {
    "status": "logged-in",
    "activeAccountId": "oo-env-override",
    "envOverride": { "endpoint": "oomol.dev", "apiKeyStatus": "valid" },
    "accounts": [
      { "id": "user-1", "name": "Alice", "endpoint": "oomol.com", "active": false }
    ]
  }
  ```

- Notes (JSON):
  - The `apiKey` field is **never** emitted, and the JSON payload never
    contains the actual API key string under any field name.
  - `accounts[]` lists every account saved in the local auth file in its
    original order; each entry is `{ id, name, endpoint, active, apiKeyStatus? }`.
  - `activeAccountId` is the active account id, or `null` when no active
    account can be resolved (including the `active-account-missing` state).
    Under `OO_API_KEY` it is the stable synthetic id `oo-env-override`, which
    is deliberately absent from `accounts[]` because it is not a saved account.
  - `accounts[].active` is `true` only for the active account, and is `false`
    for every entry while `OO_API_KEY` is set.
  - `accounts[].apiKeyStatus` is present only on the active entry and uses
    the enum `valid` / `invalid` / `request_failed` / `request_failed_sandbox`.
  - `envOverride` is present only when `OO_API_KEY` is set, in which case the
    status is always `logged-in`. It reports the `endpoint` in effect (from
    `OO_ENDPOINT`, otherwise the public default) and the `apiKeyStatus` of the
    environment credential, using the same enum as `accounts[].apiKeyStatus`.
    The API key value itself is never emitted.
  - `accounts[].endpoint` is the endpoint saved in `auth.toml`. A bare
    `OO_ENDPOINT` (without `OO_API_KEY`) redirects the endpoint used for text
    output and API key validation, but does not rewrite this field.
  - `team` is present only on the `logged-in` shape and only when a default
    team identity is in effect. `source` is `account` (the saved default),
    `env_id` (`OO_TEAM_ID`), or `env_name` (`OO_TEAM_NAME`). An env-selected
    identity spends one request to complete and validate its missing half, so
    on success it carries both `name` and `id`; when the lookup does not
    succeed, the env-supplied half is kept and `status` says why. The `account`
    source stays offline; its `id` is `null` until a command that already holds
    the membership listing (`oo team list`, `oo team use`, `oo auth login`)
    fills it in.
  - `missingAccountId` appears only when the auth file records an active id
    that is no longer present in `accounts[]`.
  - `connector` is present only when a self-hosted connector is configured
    and reports that configuration (the `OO_CONNECTOR_URL` override when set,
    otherwise `connector.toml`): `url`, `tokenConfigured`, and `source`
    (`env` / `file`). Note that when `OO_API_KEY` is set, connector commands
    route to the hosted OOMOL connector service instead of a `source: "file"`
    configuration (only `OO_CONNECTOR_URL` outranks `OO_API_KEY`). The token
    value is never emitted. The block is omitted when `connector.toml`
    cannot be read.
  - All three statuses exit `0` (this is a query command). Argument errors
    (for example `--format xml`) still exit `2`.

### `oo auth switch`

Switch the active auth account.

- With no arguments the command rotates to the next saved account in the
  `auth.toml` order.
- Options: `-u, --user <user>` switches to a specific account. The value is
  matched against `account.id` first (exact match) and then against
  `account.name` (exact match, must be unique). Matching is never fuzzy,
  case-insensitive, or substring-based.
- When `<user>` matches multiple accounts by name, the command exits non-zero
  without rewriting `auth.toml` and asks the caller to pass an account id.
  Account ids are stable strings — use `oo auth status --json` to discover
  them.
- When the requested account is already the active one, the switch is
  idempotent (exit `0`, no rewrite mode change).
- When `OO_API_KEY` is set, no saved account can be in effect, so switching
  would change nothing that a later command honors. The command exits `0`
  without reading or rewriting `auth.toml` and reports that nothing was
  switched. This applies with and without `--user`, and takes precedence over
  the no-saved-accounts error.
- API key values are never written to stdout or stderr in any output path.

### `oo login`

Alias for `oo auth login`. Supports the same `--session-token <session-token>`,
`--api-key <api-key>`, and `--team <name>` options.

### `oo logout`

Alias for `oo auth logout`.

## Teams

Team identity lets connector commands (`oo connector run`, `oo connector proxy`,
`oo connector apps`) act as a team instead of your personal account. One ladder
selects it: the per-run `--personal` (force your personal identity) or `--team
<name>` first, then the `OO_TEAM_ID` / `OO_TEAM_NAME` environment overrides,
then the default saved on the active account. These commands help discover
which teams your account can use and manage that default.

The default team belongs to the saved account, so switching accounts with
`oo auth switch` switches the default with it, and `oo auth logout` removes it
along with the account. An installation that predates account-scoped defaults
carried a single global `identity.team` setting; the CLI moves that value onto
the active account on the next run and removes the setting. Under `OO_API_KEY`
no saved default applies at all — use `OO_TEAM_ID` / `OO_TEAM_NAME` there.

`oo team list` and `oo team use` query OOMOL for your team memberships, so they
require an OOMOL account and are unavailable when only a self-hosted connector
is configured. `oo team current` and `oo team clear` work regardless: they read
and write local state, and `oo team current` only enriches its output with a
team name when an account is available to look one up.

`oo auth login` (and its `oo login` alias) persists the default automatically:
it keeps the account's still-valid stored default, otherwise adopts the
backend-provisioned `system_created` team (when one exists), and accepts
`--team <name>` to pick one explicitly.

### `oo team list`

List the teams the active account can authenticate as. This command is
read-only.

- Options: `--format=json` and `--json` print a JSON array.
- Output: JSON entries include the stable CLI fields `name`, `id`, `role`, and
  `current`. `role` is `creator` or `member`. `current` is `true` for the team
  connector commands use by default: the team selected by `OO_TEAM_ID`
  (matched by id) or `OO_TEAM_NAME` (matched by name) when set, otherwise the
  team matching the account's default.
- Output: pass the `name` value to `--team <name>` (or `oo team use <name>`),
  and the `id` value to `OO_TEAM_ID`.
- Output: text output prints one column-aligned row per team and marks the
  current default. When the account has no teams, it reports that connector
  commands run under your personal identity.
- Behavior: when the account's default team was stored without its id, this
  command fills the id in from the listing it already fetched. No extra
  request is sent, and a failure to write is ignored.

### `oo team current`

Show the team identity used by connector commands when no `--team` /
`--personal` flag is given: the `OO_TEAM_ID` / `OO_TEAM_NAME` environment
override when set, otherwise the active account's default team.

- Sends one request only when `OO_TEAM_ID` or `OO_TEAM_NAME` supplies the
  identity, to complete and validate the missing half: an id resolves to its
  team name, a name to its id through the account's team memberships — the
  same check connector commands apply, so what this command reports is what a
  run would use. The account's default already names its team and stays
  offline.
- Works without an OOMOL account. When no account is configured the lookup is
  skipped rather than failing, and the env-supplied value is reported on its
  own.
- Options: `--format=json` and `--json` print a JSON object.
- Output: JSON is `{ "team": <name|null>, "teamId": <id|null>, "source":
  <"env_id"|"env_name"|"account"|null>, "status": <status|null> }`. `source`
  says which mechanism selects the team, and is `null` when connector commands
  run under your personal identity. `status` reports the team lookup: `null`
  whenever none was attempted (the `account` source, or `--dry-run`-style
  offline paths), otherwise one of `valid`, `not_a_member`, `not_found`,
  `deleted`, `request_failed`, `request_failed_sandbox`, or `no_credential`.
- Output: under `OO_TEAM_ID` / `OO_TEAM_NAME` text output shows `<name> (<id>)`
  once both halves are known. If the lookup does not succeed the env-supplied
  value is still shown and the reason is appended; the command still exits `0`.
- Output: text output names the environment variable when one is set, and
  notes that the account's default team is not in use while the override is
  active.

### `oo team use <name>`

Set the default team identity to `<name>` after checking the active account can
access it.

- Arguments: `<name>` is the team name, as shown by `oo team list`.
- Behavior: the name is validated against the teams the account can access; an
  inaccessible name is rejected with exit `1` and the default is left unchanged.
  On success the team name and id are saved on the active account.
- Behavior: when `OO_TEAM_ID` / `OO_TEAM_NAME` is set, the default is still
  saved, but the output reports that the environment variable keeps outranking
  it until unset.
- Behavior: with `OO_API_KEY` set the command saves nothing, exits `0`, and
  reports that this variable has no saved default team.

### `oo team clear`

Clear the active account's default team identity. Connector commands then run
under your personal identity, unless `OO_TEAM_ID` / `OO_TEAM_NAME` still
selects a team — this command removes only the saved default and does not
affect the environment override. This command is offline.

- Behavior: removes the default team from the active account. When no default
  is saved it reports that connector commands already run under your personal
  identity.
- Behavior: with `OO_API_KEY` set the command clears nothing, exits `0`, and
  reports that this variable already runs under your personal identity.
- Behavior: when `OO_TEAM_ID` / `OO_TEAM_NAME` is set, the output reports that
  the environment variable still selects a team for connector commands, so
  clearing the default does not switch them to your personal identity. Unset
  the variable to do that.

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
  installed CLI version.
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
  installed CLI version.
- Notes: when the current version is `0.0.0-development`, the CLI prints the
  managed install/update unsupported message and exits successfully.

### `oo upgrade`

Alias for `oo update`.

### `oo uninstall`

Uninstall the managed `oo` runtime and its built-in skills.

- Arguments: none.
- Options: `-y, --yes` skips the confirmation prompt and is required in
  non-interactive terminals.
- Options: `--dry-run` prints what would be removed (and retained) without
  deleting anything.
- Options: `--purge` additionally removes user data (auth, settings, cache,
  logs, telemetry) and **all** oo-managed registry skills.
- Default removal: the managed executable (`~/.local/bin/oo`), all installed
  versions, self-update staging and locks, and bundled skills.
- Default retention: PATH configuration is left untouched; registry skills,
  local skills, and any same-name directory that is not oo-managed are
  retained, as is user data (removed only with `--purge`).
- Skill safety: a skill is removed only when its `.oo-metadata.json` proves
  oo ownership (`kind: "bundled"`, or `kind: "registry"` under `--purge`).
  Directories with missing, invalid, local, or non-matching metadata are never
  deleted, so user-authored same-name skills are safe.
- Installation method: when `oo` was installed via a package manager
  (npm/bun/pnpm/yarn), the command removes oo-managed skills, prints the
  matching `npm uninstall -g @oomol-lab/oo-cli` (or equivalent) command, and
  exits non-zero so callers know the binary still needs manual removal. When the
  executable is at an unknown location, it removes oo-managed skills only and
  asks the user to remove the binary manually.
- Windows: files that cannot be removed while `oo uninstall` is running are
  removed after the process exits. Other runtime paths, skills, and user data
  selected by the uninstall plan are cleaned up during command execution. On
  Unix, cleanup happens during the command.
- Safety: the command refuses to run while another live `oo` process is
  running, and it never writes API keys or other secrets to stdout/stderr.

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
- Options: `--format=json` and `--json` switch to structured JSON output. The
  shape is one of:

  ```json
  { "status": "update-available", "currentVersion": "1.2.3", "latestVersion": "1.3.0" }
  ```

  ```json
  { "status": "up-to-date", "currentVersion": "1.2.3", "latestVersion": "1.2.3" }
  ```

  ```json
  { "status": "failed", "currentVersion": "1.2.3", "message": "Cannot reach update service." }
  ```

- Notes (JSON): `status` is the stable machine-readable enum. `message` is a
  human-readable English string and should not be parsed by scripts. The
  command exits `0` even when `status` is `"failed"` because the failure is a
  query result; scripts should branch on `status`. Argument errors (for example
  `--format xml`) still exit `2`.

### `oo version`

Print the CLI version.

- Notes: text output is identical to `oo --version` / `oo -V`. Use `oo version`
  when you want a command-style invocation, particularly in combination with
  `--json` for script consumption.
- Options: `--format=json` and `--json` switch to structured JSON output. The
  payload mirrors the same data the text output prints (version, build time,
  and commit hash) so callers can switch formats without losing fields:

  ```json
  { "version": "1.2.3", "buildTime": "2026-05-26T00:00:00.000Z", "commit": "abc12345" }
  ```

  `buildTime` is the build timestamp formatted as ISO 8601, or `null` when the
  binary was built without an embedded build timestamp. `commit` is the first
  eight characters of the git commit hash recorded at build time, or `null`
  when unknown.

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
    `universal`, `claude`, `hermes`). `skillDir` is the agent's resolved skill
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
- Options: `--format=json` and `--json` print a JSON array of matching action
  entries.
- Options: `--team <name>` reports each result's `authenticated` state under the
  given team identity instead of your personal identity. When omitted, the
  effective identity follows `OO_TEAM_ID` / `OO_TEAM_NAME`, then the
  active account's default team, otherwise your personal identity.
- Options: `--personal` reports `authenticated` under your personal identity and
  ignores the `OO_TEAM_ID` / `OO_TEAM_NAME` environment variables and any
  configured default team. It cannot be combined with `--team`.
- Output: every match includes `authenticated`.
- Output: JSON entries include the stable CLI fields `service`, `name`,
  `description`, and `authenticated`.
- Output: text output prints one block per action with the service/action
  label, optional description, and authenticated state.
- Notes: the action list itself does not depend on identity; only each result's
  `authenticated` state reflects the effective identity's connected apps, so an
  app connected under a team appears as authenticated only when that team is the
  effective identity.
- Notes: use `oo connector schema "<service>.<action>"` to inspect the selected
  action contract.
- Notes: search results also warm the local action schema cache when schema
  data is available, so a following `oo connector schema` for a returned
  action is usually answered locally without a fresh metadata request.

### `oo connector schema <actionId...>`

Show the stable schema contract for one or more connector actions.

- Arguments: `<actionId...>` is one or more action identifiers in the form
  `<service>.<action>`, for example `cal.create_schedule`.
- Options: `-a, --action <action>` selects the action name and treats the single
  positional argument as a bare service name. This legacy form is retained for
  backwards compatibility; it accepts exactly one bare service name and rejects
  both additional positional arguments and the `<service>.<action>` form.
- Options: `--refresh` fetches fresh metadata from the connector metadata API.
- Options: `--format <format>` and `--json` are accepted for consistency with
  other commands; the command always prints JSON. `--show-schema-version` adds
  the `schemaVersion` field following the shared JSON output conventions.
- Output: for a single requested action, the command prints a JSON object with
  the stable CLI fields `service`, `name`, `description`, `inputSchema`, and
  `outputSchema`; with `--show-schema-version` the object gains a top-level
  `schemaVersion` field. For two or more requested actions, it prints a JSON
  array of those objects in request order; with `--show-schema-version` the
  array is wrapped as `{ "schemaVersion": "1.0.0", "items": [...] }` per the
  shared conventions.
- Notes: `--refresh` forces a fresh schema fetch for every selected action.
- Notes: schemas cached by an earlier lookup or connector search are reused
  until they expire; use `--refresh` when the latest remote contract is
  required.

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
- Options: `--connection-name <connection-name>` runs the action with the
  connector app connection name. Use `oo connector apps <serviceName>` to list
  available connection names.
- Options: `--wait` polls the selected action until it reaches a terminal state.
  This option is only valid when the selected action schema declares an async
  result lifecycle.
- Options: `--wait-result` submits an async submit action and then polls its
  configured result action. This option is only valid when the selected action
  schema declares an async submit lifecycle.
- Options: `--team <name>` runs the action under the given team identity
  instead of your personal identity. When omitted, the action runs under the
  team selected by `OO_TEAM_ID` / `OO_TEAM_NAME` if set, then the
  active account's default team, otherwise your personal identity.
- Options: `--personal` runs the action under your personal identity and
  ignores the `OO_TEAM_ID` / `OO_TEAM_NAME` environment variables and any
  configured default team. It cannot be combined with `--team`.
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
  and `errorCode` when the failure response provides them. When the response
  carries neither, the raw response body is included (trimmed and length
  bounded) so the failure detail is not lost.
- Notes: the command validates the input against the selected action contract
  before executing.
- Notes: while waiting for an async result action in text mode, interactive
  terminals show progress on stderr. JSON output does not include progress text.
- Notes: against a self-hosted connector, `--team` is rejected with
  exit `2`, the account's default team and the `OO_TEAM_ID` /
  `OO_TEAM_NAME` environment variables are ignored, and `--personal` is
  accepted. `--wait` and `--wait-result` fail with the existing unsupported
  errors because the self-hosted runtime does not expose the async lifecycle
  contract.

### `oo connector apps [serviceName]`

List connected connector apps under the effective identity. This command is
read-only.

- Arguments: `[serviceName]` is optional. When omitted, the command lists every
  connected app across all providers. When provided, the listing is scoped to
  that one service.
- Options: `--team <name>` lists connected apps under the given team identity
  instead of your personal identity. When omitted, the listing uses the team
  selected by `OO_TEAM_ID` / `OO_TEAM_NAME` if set, then the account's default
  team, otherwise your personal identity.
- Options: `--personal` lists connected apps under your personal identity and
  ignores the `OO_TEAM_ID` / `OO_TEAM_NAME` environment variables and any
  configured default team. It cannot be combined with `--team`.
- Options: `--format=json` and `--json` print a JSON array.
- Output: JSON entries include the stable CLI fields `service`,
  `connectionName`, `displayName`, `accountLabel`, `status`, `authType`,
  `isDefault`, and `scopes`. App id fields are not included.
- Output: when an app has no connection name, JSON output uses `null` and text
  output prints `-`.
- Output: text output prints one column-aligned row per app. The listing across
  all providers leads with a `Service` column; the single-service listing omits
  it because the service is fixed by the argument. On a color-capable terminal
  the status and default columns are color-coded; piped or `NO_COLOR` output is
  plain aligned text.
- Notes: use the listed `connectionName` value with
  `oo connector run <serviceName> --connection-name <connection-name>`.
- Notes: against a self-hosted connector, `--team` is rejected with exit
  `2`, the account's default team and the `OO_TEAM_ID` /
  `OO_TEAM_NAME` environment variables are ignored, and `--personal` is
  accepted.

### `oo connector proxy <serviceName>`

Proxy a provider API request through a connected connector app.

- Arguments: `<serviceName>` is the service name.
- Options: `-d, --data <data>` accepts a complete proxy request JSON object or
  `@path` to a JSON file. The object shape is
  `{ endpoint, method, query?, headers?, body? }`.
- Options: `--input <data>` is an alias for `--data <data>`.
- Options: without `--data`, use `--endpoint <endpoint>` and
  `--method <method>` plus optional `--query <json>`, `--headers <json>`, and
  `--body <json>` to build the same request object. The `--data` form cannot
  be combined with these split request options.
- Options: `--endpoint` is a provider endpoint path relative to the provider
  proxy base URL, or an allowed absolute HTTPS URL.
- Options: `--method` must be one of `GET`, `POST`, `PUT`, `PATCH`, or
  `DELETE`. Values are case-insensitive.
- Options: `--query` must be a JSON object whose values are strings, numbers,
  booleans, or `null`.
- Options: `--headers` must be a JSON object with string values.
  Authentication headers are injected by the connector service from the
  connected app; callers should not pass provider credentials through CLI
  options.
- Options: `--body` is parsed as JSON. To send a text body, pass a JSON string
  such as `"hello"`.
- Options: `--team <name>` runs the proxy request under the given team identity
  instead of your personal identity. When omitted, the request runs under the
  team selected by `OO_TEAM_ID` / `OO_TEAM_NAME` if set, then the
  active account's default team, otherwise your personal identity.
- Options: `--personal` runs the proxy request under your personal identity and
  ignores the `OO_TEAM_ID` / `OO_TEAM_NAME` environment variables and any
  configured default team. It cannot be combined with `--team`.
- Options: `--format=json` and `--json` print a JSON object.
- Output: JSON output keeps the stable shape
  `{ data: { status, headers, data }, meta: { executionId, service } }`.
- Errors: stderr prints the connector proxy HTTP status and includes the server
  `message` and `errorCode` when the failure response provides them. When the
  response carries neither, the raw response body is included (trimmed and
  length bounded) so the failure detail is not lost.
- Notes: `oo connector proxy` does not use connector action schemas or schema
  cache. Use it when the selected connector supports proxy execution and no
  purpose-built connector action is available.
- Notes: against a self-hosted connector, `--team` is rejected with
  exit `2` and the account's default team and the `OO_TEAM_ID` /
  `OO_TEAM_NAME` environment variables are ignored. Proxy execution depends on
  server support; the open-source runtime currently returns an error.

### `oo connector login <url>`

Validate and save a self-hosted connector server so connector commands use it
instead of the OOMOL-hosted connector.

- Arguments: `<url>` is the self-hosted connector server URL, for example
  `http://localhost:3000`.
- Options: `--token <token>` provides a runtime API token for the server,
  created on the server's `/access` page.
- Output: text output confirms the connected server URL, reports whether the
  token was verified, and points to `<url>/access` for managing runtime
  tokens.
- Notes: the command validates the server through its health endpoint before
  saving the configuration. After a successful login, all connector commands —
  `oo connector search/schema/run/proxy/apps` and top-level `oo search` — use
  this server instead of the OOMOL-hosted connector.
- Notes: when the server accepts unauthenticated requests, a provided token
  cannot be verified; the configuration is still saved and a notice is
  printed.
- Notes: when no OOMOL account is logged in and `OO_API_KEY` is unset, the
  command prints a note that non-connector commands still require
  `oo auth login`.
- Errors: an invalid URL (not an http(s) URL) or an invalid token (empty, or
  containing whitespace or control characters) exits `2`. An unreachable
  server, an HTTP 401 response, or an unexpected/non-connector response exits
  `1`; the 401 error includes a hint to create a runtime token at
  `<url>/access`.

### `oo connector logout`

Remove the saved self-hosted connector configuration.

- Arguments: none.
- Output: text output confirms which server was disconnected. Connector
  commands fall back to the active OOMOL account unless `OO_CONNECTOR_URL`
  is still set.
- Notes: when no self-hosted connector is configured, the command prints a
  notice instead of failing.
- Notes: the command only removes the saved configuration; the
  `OO_CONNECTOR_URL` environment variable is not affected.
- Notes: a corrupt `connector.toml` is cleared as well, so `oo connector
  logout` always leaves the configuration removed.

## Search

### `oo search <text>`

Search connector actions with one free-form query.

- Arguments: `<text>` is the semantic search text.
- Options: `--format=json` and `--json` print a JSON array of matching action
  entries.
- Options: `--team <name>` reports each result's `authenticated` state under the
  given team identity instead of your personal identity. When omitted, the
  effective identity follows `OO_TEAM_ID` / `OO_TEAM_NAME`, then the
  active account's default team, otherwise your personal identity.
- Options: `--personal` reports `authenticated` under your personal identity and
  ignores the `OO_TEAM_ID` / `OO_TEAM_NAME` environment variables and any
  configured default team. It cannot be combined with `--team`.
- Output: every match includes `authenticated`.
- Output: JSON entries include the stable CLI fields `service`, `name`,
  `description`, and `authenticated`.
- Output: text output prints one block per action with the service/action
  label, optional description, and authenticated state.
- Notes: the action list itself does not depend on identity; only each result's
  `authenticated` state reflects the effective identity's connected apps, so an
  app connected under a team appears as authenticated only when that team is the
  effective identity.
- Notes: use `oo connector schema "<service>.<action>"` to inspect the full
  connector action contract.
- Notes: search results also warm the local action schema cache when schema
  data is available, so a following `oo connector schema` for a returned
  action is usually answered locally without a fresh metadata request.

## AI Agent Skills

Before running a command, `oo` silently synchronizes bundled and registry skills
for the universal `~/.agents` host, which is always provisioned (created when
missing), and for every other supported host directory that already exists.

- Bundled skills: `oo` ensures `oo`, `oo-find-skills`, `oo-create-skill`, and
  `oo-publish-skill` are installed for the universal `~/.agents` host and each
  detected Claude Code, Hermes, CodeBuddy, WorkBuddy, Trae, Trae CN, OpenClaw,
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
- Unusable host directories: a supported host is skipped when its skill
  directory path is occupied by something `oo` cannot create a directory at,
  such as a symbolic link whose target has been removed or a regular file. The
  remaining hosts still install, and `oo info` keeps reporting the host so the
  broken path stays visible.
- Shared host directories: supported hosts whose skill directories resolve to
  the same location — for example `~/.claude/skills` symlinked to
  `~/.agents/skills` — are one host. The skill is installed there once and is
  reported under the more specific agent: the universal `~/.agents` host yields
  to a detected agent that shares its directory.
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
  `universal`, `claude`, `hermes`, `codebuddy`, `workbuddy`, `trae`,
  `trae-cn`, `openclaw`, `qoderwork`, or `deepseek-tui`.
- Options: `--json` / `--format json` emits a structured JSON payload (see JSON
  output below). `--show-schema-version` (only meaningful with JSON output)
  adds a top-level `schemaVersion` field; without it, the payload starts at
  `summary`.
- Managed ownership rule: the command scans each existing supported local skill root:
  `~/.agents/skills`, `~/.claude/skills`,
  `${HERMES_HOME:-~/.hermes}/skills`, `~/.codebuddy/skills`,
  `~/.workbuddy/skills`, `~/.trae/skills`, `~/.trae-cn/skills`,
  `${OPENCLAW_HOME:-~/.openclaw}/skills`, `~/.qoderwork/skills`, and
  `~/.deepseek/skills`. It keeps only child
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
  follow `Universal`, `Claude Code`, `Hermes`, `CodeBuddy`,
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
          "agentId": "universal",
          "status": "installed",
          "path": "/Users/name/.agents/skills/oo",
          "sourcePath": "/Users/name/Library/Application Support/oo/skills/bundled/universal/oo",
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
  `universal`, `claude`, `hermes`, `codebuddy`, `workbuddy`, `trae`,
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
  `universal`, `claude`, `hermes`, `codebuddy`, `workbuddy`, `trae`,
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
  to write. Accepted values are `universal`, `claude`, `hermes`,
  `codebuddy`, `workbuddy`, `trae`, `trae-cn`, `openclaw`, `qoderwork`, and
  `deepseek-tui`.
- Options: `--description <text>` is required and writes the generated
  `SKILL.md` frontmatter description.
- Generated `SKILL.md` frontmatter includes `compatibility: "Requires the oo
  CLI."`.
- Generated `SKILL.md` frontmatter includes nested `metadata.title` and
  `metadata.icon`. When `--title` is omitted, the title is generated from the
  skill id. When `--icon` is omitted, a generic local workflow icon is used.
- Generated `SKILL.md` body includes editable local workflow placeholder
  sections for when to use the skill, inputs, execution, result handling, and
  failure handling.
- Metadata: the created skill directory includes `.oo-metadata.json`
  identifying the skill as a local skill managed by `oo`.
- Options: `--icon <icon>` writes a non-empty icon reference to `metadata.icon`
  in the generated `SKILL.md` frontmatter. The value may be an emoji, an image
  URL, or `:collection:icon:` where `collection` and `icon` are names from
  <https://icones.js.org/>.
- Options: `--title <title>` writes `metadata.title` to the generated
  `SKILL.md` frontmatter.
- Target directory: the skill is created at the selected agent's
  `<agent-home>/skills/<skill-id>`.
- Publication mode: the command does not copy the new local skill to other
  agents.
- Failure behavior: if the selected agent home does not exist, or if the target
  directory already exists, the command exits non-zero before writing the skill
  and suggests `oo skills adopt` for existing workflow directories.
- Output: text output prints the initialized skill id and target path.

### `oo skills adopt <path>`

Turn an existing local workflow directory into an oo-managed local skill without
overwriting the workflow implementation.

- Arguments: `<path>` must be an existing directory. Relative paths resolve from
  the current working directory.
- Skill id: when `--name <name>` is provided, it is normalized to lowercase
  hyphen-case and used as the skill id and frontmatter `name`. Otherwise the
  command uses an existing `SKILL.md` frontmatter `name` when present, falling
  back to the source directory name.
- Options: `--agent <agent>` selects an agent skill directory. Accepted values
  are `universal`, `claude`, `hermes`, `codebuddy`, `workbuddy`, `trae`,
  `trae-cn`, `openclaw`, `qoderwork`, and `deepseek-tui`.
- Target behavior: without `--agent`, the command adopts `<path>` in place.
  With `--agent`, if `<path>` is already the selected agent's
  `<agent-home>/skills/<skill-id>` directory, the command adopts it in place.
  Otherwise it copies the existing directory to that target path before
  adopting it. The source directory is not removed.
- Content behavior: existing workflow files are preserved. Existing `SKILL.md`
  body content is preserved; the command only patches frontmatter fields needed
  for the skill contract. If `SKILL.md` is missing, the command creates one with
  local workflow placeholder sections.
- Description: `--description <text>` writes frontmatter `description`. It is
  required only when the existing `SKILL.md` does not already contain a
  non-empty frontmatter `description`.
- Presentation metadata: `--title <title>` writes `metadata.title`, and
  `--icon <icon>` writes `metadata.icon`. When omitted, existing nested
  metadata values are preserved; top-level `title` or `icon` are copied into
  nested `metadata` when present; otherwise default display metadata is used.
- Metadata: the adopted skill directory includes `.oo-metadata.json`
  identifying the skill as a local skill managed by `oo`.
- Safety: the command refuses to adopt a directory whose `.oo-metadata.json`
  identifies a bundled or registry skill, or whose oo metadata is invalid.
  With `--agent`, the command refuses to copy over an existing different target
  directory.
- Validation: after writing the skill contract and local metadata, the command
  validates the adopted skill directory and prints validation warnings to
  stderr.
- Output: text output prints the adopted skill id and target path.

### `oo skills validate <path>`

Validate a local skill directory against the generic skill contract.

- Arguments: `<path>` is the skill directory containing `SKILL.md`.
- Validation: `SKILL.md` frontmatter must be a dictionary with string `name`
  and non-empty string `description` fields.
- Validation: nested `metadata` is optional, but when present it must be a
  dictionary. Nested `metadata.icon` and `metadata.title` are optional, but when
  present they must be non-empty strings.
- Warnings: missing `metadata.icon` or `metadata.title` prints a warning, but
  does not make validation fail. If top-level `icon` or `title` exists while
  nested `metadata.icon` or `metadata.title` is missing, the warning explains
  that top-level fields do not satisfy display metadata.
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
  an interactive terminal prompts for `private` or `public`; non-interactive
  first-time publishes must pass `--visibility private` or
  `--visibility public`.
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
  state before running the install command. Both skill-target and package-target
  prompts continue through `oo skills install <packageName>` for public
  packages, or `oo skills install <packageName>#<shareID>` for private
  packages.
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

### `oo skills install [packageName...]`

Install bundled or published skills into supported local skill directories.

- Alias: `oo skills add [packageName...]`.
- Arguments: `[packageName...]` accepts zero or more package names.
- Arguments: when omitted, the command installs all bundled skills.
- Arguments: when several package names are given, each is installed in order.
  Installs that already completed are kept even if a later package fails.
- Arguments: when a package name is `oo`, `oo-find-skills`,
  `oo-create-skill`, or `oo-publish-skill`, the command installs the
  corresponding bundled skill.
- Arguments: when a package name is a published package name, the command
  installs skills from that package. A package name may include an explicit
  version as `<packageName>@<version>`, including scoped package forms such as
  `@scope/name@1.2.3`.
- Arguments: a package name may also use `<packageName>#<shareID>`. In that
  form, the command reads the package skill list from `<packageName>` and
  downloads the package archive through the share identified by `<shareID>`.
- Behavior: the command installs every published skill in each package by
  default; the optional `-s, --skill` filter narrows which skills are installed.
- Options: `-s, --skill <skills...>` limits the install to the named skills. The
  option is optional and accepts multiple values (for example `-s foo bar`).
  Matching is case-insensitive and accepts either the skill name or its
  directory name. Names that match no skill are ignored. With several packages
  the filter spans all of them: a package that publishes none of the requested
  skills is silently skipped, and the command fails only when **no** package
  (or, for the no-argument bundled install, no bundled skill) matches any
  requested name — listing the available skills. An explicitly named bundled
  skill is already a single-skill selection and is not further narrowed by
  `--skill`.
- Options: because `-s, --skill` accepts multiple values, put any package names
  **before** it (for example `oo skills install @scope/pkg -s foo bar`). Tokens
  that follow `--skill` are read as skill names, not package names, until the
  next option such as `--json`.
- Options: `-f, --force` overrides install when the target directory exists
  with the same skill name but is **not** managed by oo (no valid `oo`
  metadata). The previous directory contents are removed before the
  new skill is written; a `warn` log records the overwrite. `--force` does
  **not** bypass path containment, package validation, auth, or download
  validation; and it does **not** affect startup auto-sync, `oo skills update`,
  `oo skills sync`, `oo skills uninstall`, or `oo skills publish`.
- Options: `--out-dir <dir>` exports skills into `<dir>` instead of installing
  them into local agent skill directories. This is a pure export: it writes only
  inside `<dir>` and does not modify oo's managed storage or any agent home
  directory. Each selected skill is written to `<dir>/<skill-id>/`; an existing
  `<dir>/<skill-id>` directory is replaced, while other contents of `<dir>` are
  left untouched. Exported skills are keyed only by skill id, so when more than
  one selected skill resolves to the same id (across packages, or a registry
  skill that shares a bundled skill name) the last one written wins. Both bundled
  skills and published registry packages can be exported: a bundled skill name
  (or the no-argument form) is materialized offline, while a published package
  name is downloaded, extracted, and written in its published form. Registry exports send the active account's
  `Authorization` header. The `-s, --skill` filter narrows which skills are
  exported from each registry package and, in the no-argument form, which
  bundled skills are exported; an explicit bundled skill name argument exports
  just that skill. `--force` has no effect in export mode.
- Options: `--agent-format <agent>` selects the render format for exported
  bundled skills and only applies together with `--out-dir`; using it without
  `--out-dir` fails. It does not reshape exported registry skills, which are
  always written in their published form. The default is `universal` (the
  `~/.agents` format). Accepted values are `universal`, `claude`, `hermes`,
  `codebuddy`, `workbuddy`, `trae`, `trae-cn`, `openclaw`, `qoderwork`, and
  `deepseek-tui`.
- Output: with `--out-dir`, the command prints the exported skills and their
  target directory; `--json` / `--format json` emits an export report with
  `command: "skills.install.export"` that lists each exported skill's `kind`
  (`bundled` or `registry`), source `packageName` (`null` for bundled skills),
  `path`, and written `files`, plus the resolved `agentFormat` and
  `outputDirectory`. When a requested registry package cannot be exported, the
  failure is reported in the report's `errors[]` and the command exits `1`.
  Skills exported before a later failure within the same package are still
  listed in the report's exported skills, yielding a `partial-failure` status.
- Path rule: under `--out-dir`, a registry skill name is accepted only when it
  is a single safe path segment that stays inside the output directory;
  otherwise the export is rejected with `invalid_path` before anything is
  downloaded or written.
- Output: successful non-interactive installs print a compact summary grouped by
  installed skills and target AI agents. When exactly one target is written, the
  summary includes that target path. With several package names, each package
  prints its own summary in order.
- Notes: when a package publishes multiple skills, the command installs all of
  them; when it publishes exactly one skill, that single skill is installed.
- Canonical directory: bundled skills are materialized under
  `<config-dir>/skills/bundled/<agent>/<skill-id>`, where `<config-dir>` is the
  directory that contains `settings.toml` and `<agent>` is `universal`,
  `claude`, `hermes`, `codebuddy`, `workbuddy`, `trae`, `trae-cn`,
  `openclaw`, `qoderwork`, or `deepseek-tui`.
- Canonical directory: published skills are materialized to
  `<config-dir>/skills/registry/<skill-id>`.
- Migration: on first run after upgrading, `oo skills install` removes legacy
  canonical directories left over from earlier releases (`claude-skills/`,
  `openclaw-skills/`, and any bundled or registry skill directory that
  lived directly under `skills/`). Bundled skills are rebuilt automatically in
  the new layout; previously-installed published skills must be reinstalled
  with `oo skills install <packageName>`.
- Target directory: bundled and published skills are published to the universal
  `~/.agents` host (created when missing) and each other existing supported host
  directory, currently
  `~/.agents/skills/<skill-id>`,
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
  the source package and package version. Metadata files from older releases
  that lack the schema version marker are no longer recognized as `oo`
  metadata.
- Notes: all registry requests for published skills send the active account's
  `Authorization` header.
- Notes: a same-name target directory without valid `oo` metadata is treated as a
  non-OOMOL skill; the install fails with `name_conflict` for that skill unless
  `--force` is used (which overwrites it). A same-name skill already managed by
  `oo` is overwritten, including when it was installed from a different package.
  An empty target directory holds no skill, so it never conflicts: the install
  writes into it and reports `previousState: "absent"`.
- Notes: the universal `~/.agents` host is available whenever its skill
  directory can be created (the directory itself is created when missing), so
  the command normally has at least one install target. It drops out only when
  something `oo` cannot create a directory at occupies `~/.agents/skills`, and
  the command reports `no_supported_hosts` when that leaves no usable host.
- Notes: an existing bundled or registry skill installation is considered
  managed by `oo` only when its `.oo-metadata.json` identifies that source.
  Otherwise `oo` treats it as a different skill and will not overwrite it.
- Options: `--json` / `--format json` emits a structured payload (see "JSON
  output for mutation commands" below).
- `error.code` enum (install JSON): `not_authenticated` / `no_supported_hosts` /
  `invalid_path` / `invalid_package_specifier` / `package_lookup_failed` /
  `package_download_failed` / `invalid_package_archive` /
  `skill_not_found_in_package` / `name_conflict` / `storage_conflict` /
  `publication_failed` / `skill_filter_no_match` / `unknown`.
- `targets[].previousState` is one of `absent | managed | unmanaged | unknown`.
  With `--force`, an overwritten unmanaged target is reported as `installed`
  with `previousState: "unmanaged"`.

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
- Options: `--json` / `--format json` emits a structured payload. Unlike the
  other mutation commands, `oo skills sync upload --json` uses a top-level
  `records[]` instead of `skills[]`/`targets[]`, because the operation unit is
  the sync record, not an agent-side install target. The payload still includes
  `command`, `status`, `summary`, and `errors[]`.
- `error.code` enum (sync upload JSON): `not_authenticated` / `no_supported_hosts`
  / `sync_upload_failed` / `sync_invalid_response` / `unknown`.
- Behavior: when the upload request fails, the JSON payload still includes the
  `records[]` that would have been uploaded, and the command exits `1`.

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
- Options: `--json` / `--format json` emits a structured payload with
  `skills[]` (one entry per applied record). Single-record install/lookup
  failures are reported in `skills[].status = "failed"` with a stable
  `error.code`; only sync-protocol failures (manifest download, response
  schema) go to top-level `errors[]`.
- `error.code` enum (sync apply JSON): `not_authenticated` /
  `no_supported_hosts` / `invalid_path` / `package_lookup_failed` /
  `package_download_failed` / `invalid_package_archive` / `publication_failed`
  / `sync_download_failed` / `sync_invalid_response` / `unknown`.

### `oo skills update [packageName...]`

Update installed oo-managed published skills.

- Arguments: `[packageName...]` accepts zero or more package names. **Breaking
  change**: in earlier releases these positional arguments were skill ids; they
  are now package names.
- Arguments: when omitted, the command updates every installed oo-managed
  registry skill.
- Arguments: when one or more package names are given, the command updates every
  installed skill that belongs to each named package. All installed skills of a
  package are updated together.
- Unknown package: a package name that has no installed oo-managed skill fails
  with `package_not_installed`. In text mode the command aborts with an error;
  with `--json` the failure is reported per entry and the command exits `1`.
- Bundled skills: bundled skills such as `oo`, `oo-find-skills`,
  `oo-create-skill`, and `oo-publish-skill` are excluded from this command.
  Passing a bundled name as a package argument fails with `bundled_unsupported`.
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
- Options: `-s, --skill <skills...>` limits the update to the named skills. The
  option is optional and accepts multiple values (for example `-s foo bar`).
  Matching is case-insensitive and accepts either the skill name or its
  directory name. Names that match no installed skill are ignored. When none of
  the requested names match the resolved skills, the command fails (text mode
  aborts with an error listing the resolved skills; `--json` reports
  `skill_filter_no_match` and exits `1`).
- Options: because `-s, --skill` accepts multiple values, put any package names
  **before** it (for example `oo skills update @scope/pkg -s foo`). Tokens that
  follow `--skill` are read as skill names, not package names, until the next
  option such as `--json`.
- Options: `--json` / `--format json` emits a structured payload (see "JSON
  output for mutation commands" above).
- `skills[].status` (update JSON): `updated | repaired | current | failed`.
  - `updated`: the version was bumped on at least one host.
  - `repaired`: the version did not change, but a host publication was
    rewritten (legacy symlink, metadata drift, etc.).
  - `current`: no host needed any write.
- `error.code` enum (update JSON): `not_authenticated` / `no_supported_hosts`
  / `invalid_path` / `bundled_unsupported` / `package_not_installed`
  / `package_lookup_failed` / `package_download_failed` /
  `invalid_package_archive` / `publication_failed` / `skill_filter_no_match` /
  `unknown`.

### `oo skills check-update [packageName...]`

Check whether installed oo-managed registry skills have a newer published
version, or have drifted from their canonical content. Read-only: the
command **never** downloads a package archive or writes to any skill
directory.

- Arguments: `[packageName...]` accepts zero or more package names. **Breaking
  change**: in earlier releases `--skill` took skill ids and was the primary
  selector; that role is now filled by these positional package-name arguments.
  (`--skill` still exists as an optional filter — see Options.)
- Arguments: when omitted, the command checks every installed oo-managed
  registry skill.
- Arguments: when one or more package names are given, the command checks every
  installed skill that belongs to each named package. Duplicate package names
  are de-duplicated; the original input order is preserved in the output.
- Options: `-s, --skill <skills...>` limits the check to the named skills. The
  option is optional and accepts multiple values (for example `-s foo bar`).
  Matching is case-insensitive and accepts either the skill name or its
  directory name. Names that match no resolved skill are ignored. When none of
  the requested names match the resolved registry skills, the command fails and
  exits `1` with an error listing the available skills (no JSON payload is
  emitted in that case).
- Options: because `-s, --skill` accepts multiple values, put any package names
  **before** it (for example `oo skills check-update @scope/pkg -s foo`). Tokens
  that follow `--skill` are read as skill names, not package names, until the
  next option such as `--json`.
- Options: `--format=json` and `--json` switch to a structured payload.
  `--show-schema-version` (only meaningful with JSON) prepends
  `schemaVersion`.
- Scope: only `registry` kind skills are checked. A bundled name, or a package
  name with no installed oo-managed skill, is reported as a `failed` entry whose
  `skillId` echoes the requested package name (each carries a stable
  `error.code`).
- Network: requires the current OOMOL account because the latest package
  version is fetched from the registry's package-info endpoint. The
  command does **not** download package tarballs.
- JSON shape:

  ```json
  {
    "summary": {
      "registrySkills": 3,
      "registrySkillUpdates": 1,
      "registrySkillRepairs": 1,
      "registrySkillsCurrent": 1,
      "registrySkillFailures": 0
    },
    "skills": [
      {
        "skillId": "demo",
        "packageName": "@alice/demo",
        "currentVersion": "0.1.0",
        "latestVersion": "0.2.0",
        "status": "update-available"
      },
      {
        "skillId": "foo",
        "packageName": "@alice/foo",
        "currentVersion": "0.2.0",
        "latestVersion": "0.2.0",
        "status": "up-to-date"
      },
      {
        "skillId": "bar",
        "packageName": "@alice/bar",
        "currentVersion": "0.2.0",
        "latestVersion": "0.2.0",
        "status": "repair-required"
      }
    ]
  }
  ```

- `status` values:
  - `update-available` — registry latest is newer than the installed
    version; `oo skills update` will upgrade.
  - `up-to-date` — installed version matches the registry latest, **and**
    all host directories match the canonical publication.
  - `repair-required` — installed version equals the registry latest, but
    the host publication has drifted from the canonical layout in a way
    that `oo skills update` would rewrite. Concretely this fires when the
    host directory is a legacy symlink (instead of a real copy) or when
    its `.oo-metadata.json` records a different package/version than the
    canonical metadata. **Content-level changes to host files are not
    detected here**; run `oo skills info --json` to inspect host
    `controlState` for content drift.
  - `failed` — the skill could not be checked. The entry includes
    `error.code` (machine-readable enum) and `error.message` (English
    template).
- `currentVersion` is the highest version among the skill's installed copies
  (the shared canonical copy and every agent host copy); copies left behind by
  a partial update are reported through `status`, not by lowering
  `currentVersion`. `oo skills sync upload` reports the same version.
- Exit code: the command exits `0` even when individual entries are
  `failed`, because failure is encoded in the payload. Argument errors
  (for example `--format xml`) still exit `2`.
- `error.code` enum: `bundled_unsupported` / `package_not_installed` /
  `package_lookup_failed` / `unknown`.

#### JSON output for mutation commands

`oo skills install`, `oo skills uninstall`, `oo skills update`, and
`oo skills sync apply` share a common JSON envelope:

```json
{
  "command": "skills.install",
  "status": "completed",
  "summary": { /* per-command counters */ },
  "skills": [
    {
      "skillId": "demo",
      "kind": "bundled | registry | local | unknown",
      "packageName": "@alice/demo",
      "previousVersion": "0.1.0",
      "version": "0.2.0",
      "status": "<per-command enum>",
      "targets": [
        {
          "agentId": "universal",
          "status": "<per-command enum>",
          "path": "/Users/.../.agents/skills/demo",
          "sourcePath": "/Users/.../oo/skills/managed/demo",
          "version": "0.2.0",
          "previousVersion": "0.1.0",
          "previousState": "absent | managed | unmanaged | unknown",
          "error": { "code": "<stable code>", "message": "..." }
        }
      ],
      "error": { "code": "<stable code>", "message": "..." }
    }
  ],
  "errors": [{ "code": "<command-level code>", "message": "..." }]
}
```

`oo skills sync upload` uses `records[]` instead of `skills[]`/`targets[]`,
because the operation unit is the sync record, not an install target.

Common rules:

- `command` is one of `skills.install` / `skills.uninstall` / `skills.update` /
  `skills.sync.upload` / `skills.sync.apply`.
- `status` is `completed` / `partial-failure` / `failed` / `noop`.
- `targets[]` is per-agent. For `uninstall`/`update`, each target may include
  `previousVersion`; `install` typically uses `previousState`.
- `error.message` is a fixed English template; it is not localized.
- `--show-schema-version` prepends a top-level `schemaVersion` field.
- Argument errors (for example `--format xml`) still exit `2` and do not
  produce JSON. Other failures still emit the JSON payload and exit `1`.
- The JSON payload never includes `apiKey`, raw HTTP request/response bodies,
  stack traces, or unredacted endpoint secrets.

### `oo skills auto-trigger`

Control whether agents may load a bundled skill without being asked to. This is
a command group with three subcommands, and it applies only to the four bundled
skills (`oo`, `oo-find-skills`, `oo-create-skill`, `oo-publish-skill`). Registry
and local skills are unaffected.

Turning auto-trigger off leaves the skill installed and still invocable by name
— `/oo` in Claude Code and Claude-compatible agents, `$oo` in Codex. What
changes is that the agent no longer offers to use it on its own.

- Scope: the setting is per skill, not per agent. One run applies it to every
  supported agent host, using whichever mechanism that agent understands.
- Persistence: the choice is stored in the CLI settings file under
  `[skills.auto_trigger]` and survives across sessions.
- Application: the setting is an input to skill publication, not a runtime
  switch. `off`/`on` republish the bundled skills immediately. Startup
  synchronization does not detect a hand-edited `[skills.auto_trigger]`; apply
  one with `oo skills repair --skill oo --skill oo-find-skills --skill
  oo-create-skill --skill oo-publish-skill` (`--skill` is required).
- `--all` is a standing policy, not a snapshot: bundled skills added by later
  releases are covered by it without a further command. While it is in force, a
  per-skill `off`/`on` still updates the stored list but changes nothing an
  agent can see, and the text output says so.
- Consequence: with auto-trigger off, an agent that hides a skill's description
  from its own context can no longer act on it unprompted. The bundled `oo`
  skill's end-of-session suggestions are one such behavior and stop happening
  until auto-trigger is turned back on.

#### `oo skills auto-trigger off [skillName...]`

Make bundled skills manual-only.

- Arguments: `[skillName...]` bundled skill names to make manual-only; they are
  added to a persisted list, de-duplicated and sorted.
- Options: `--all` makes every bundled skill manual-only, now and in future
  releases, and clears the per-skill list because it supersedes it.
  `--json` / `--format json` / `--show-schema-version` control output.
- Validation: pass skill names **or** `--all`, not both and not neither; either
  misuse exits `2`. A name that is not a bundled skill exits `2` and lists the
  accepted names.
- Safety: a same-name skill directory that `oo` does not manage is left
  untouched and reported as skipped. This differs from `oo skills install`,
  which fails the run on such a directory: changing a preference must still
  reach the other agents.
- Exit code: `1` when the setting was saved but one or more skill targets could
  not be republished; the message names them and gives the `oo skills repair`
  command to finish applying it.

#### `oo skills auto-trigger on [skillName...]`

Let agents load bundled skills on their own again.

- Arguments: `[skillName...]` bundled skill names to remove from the list.
- Options: `--all` restores the shipped default for every bundled skill,
  clearing both the standing policy and the per-skill list, so nothing is left
  silently manual-only. Output options match `off`.
- Validation: as `off`, except that `on` also accepts a name the stored
  `disabled` list already holds even when it is not a bundled skill in this
  release. Removing an entry is the command's job, and a bundled skill dropped
  by a later release would otherwise be unclearable except with `--all`.
- Safety and exit codes match `off`.

#### `oo skills auto-trigger status`

Show the configured auto-trigger policy for every bundled skill.

- Options: `--json` / `--format json` / `--show-schema-version`.
- Text output: a headline stating the overall state, then one line per bundled
  skill reading `auto`, `manual`, or `manual (all)`.
- Scope: this reports the stored setting, not what is currently published. The
  two agree unless the settings file was edited by hand without republishing —
  see Application above.

#### JSON output

`status` emits the state; `off` and `on` emit the same state plus what they
published.

```json
{
  "disabled": ["oo-create-skill"],
  "disabledAll": false,
  "skills": [
    { "autoTrigger": true, "name": "oo", "reason": "default" },
    { "autoTrigger": true, "name": "oo-find-skills", "reason": "default" },
    { "autoTrigger": false, "name": "oo-create-skill", "reason": "skill" },
    { "autoTrigger": true, "name": "oo-publish-skill", "reason": "default" }
  ],
  "publications": [
    { "agent": "universal", "skill": "oo", "status": "published" },
    { "agent": "claude", "skill": "oo", "status": "skipped" }
  ]
}
```

- `disabled` echoes the persisted per-skill list verbatim, including a name that
  no longer matches a bundled skill in this release. Such an entry has no
  effect; clear it with `on <name>`, which accepts a name the list already
  holds.
- `reason` is `default` (auto-trigger on), `skill` (this skill was named), or
  `all` (the standing policy covers it). `all` outranks `skill`.
- `publications` is present on `off` and `on` only. `status` is one of
  `published`, `skipped` (target not managed by `oo`), or `failed`.

### `oo skills recommend`

End-of-session skill suggestions for the bundled `oo` skill, plus controls to
silence them. The bundled `oo` skill calls these commands, but they can also be
run directly. This is a command group with three subcommands.

#### `oo skills recommend plan [connectorService...]`

Given the connector services used during a session, decide which skills to
suggest installing or updating and which to skip.

- Arguments: `[connectorService...]` accepts zero or more connector service
  identifiers (the `service` field from `oo search`). Each is mapped to one
  skill package by prepending `oo-` and replacing underscores with hyphens
  (`github` → `oo-github`, `aliyun_oss` → `oo-aliyun-oss`). Blank entries are
  ignored; the derived packages are de-duplicated and their input order is
  preserved in the output. With no arguments the plan is empty.
- Options: `--format=json` and `--json` switch to a structured payload.
  `--show-schema-version` (only meaningful with JSON) prepends `schemaVersion`.
  `--force` re-surfaces suggestions that the session cooldown would otherwise
  suppress (see below).
- Behavior: each derived `oo-<service>` package is confirmed against the
  registry. It is suggested for `install` when it is published but not installed
  locally; for `update` when an installed package has a newer published version;
  and skipped when it is already current, not published, previously dismissed,
  or globally muted. When suggestions are globally muted, the plan returns
  `muted: true` with no recommendations.
- Session cooldown: once a suggestion is surfaced, the same suggestion is
  suppressed on later runs for a short window so a repeated wrap-up does not
  re-surface it every time. A suppressed suggestion is returned under `skipped`
  with reason `recently-suggested` instead of `recommendations`. The window is
  per suggestion: switching to a different service, or a suggestion whose content
  changes (for example `install` becoming `update`, or a newer latest version),
  surfaces again, as does passing `--force`. Globally muted plans surface nothing
  and do not start a cooldown. This suppression is best-effort: if its on-disk
  state is unavailable the plan is returned without de-duplication.
- Network: every non-dismissed, non-muted package is verified with a public
  registry package-info request (existence + latest version). This endpoint
  needs no login, so no account or API key is required — the active account's
  endpoint is used when present, otherwise the default. Requests run with a
  small bounded concurrency. Dismissed and muted packages need no network. A
  `404` is treated as "not published" (silently skipped); any other failed
  lookup skips that package instead of failing the command.
- JSON shape:

  ```json
  {
    "muted": false,
    "recommendations": [
      { "packageName": "oo-gmail", "action": "install" },
      {
        "packageName": "oo-notion",
        "action": "update",
        "currentVersion": "1.0.0",
        "latestVersion": "1.2.0"
      }
    ],
    "skipped": [
      { "packageName": "oo-drive", "reason": "up-to-date" },
      { "packageName": "oo-slack", "reason": "dismissed" }
    ]
  }
  ```

- `action` values: `install` / `update`.
- `reason` values: `up-to-date` / `not-published` / `dismissed` / `muted` /
  `lookup-failed` / `recently-suggested`.
- Exit code: `0` even when a lookup fails or a package is unpublished (both are
  encoded as skips). Argument errors (for example `--format xml`) exit `2`.

#### `oo skills recommend mute [packageName...]`

Stop suggesting packages so later sessions no longer surface them.

- Arguments: `[packageName...]` package names to stop suggesting; they are added
  to a persisted dismissal list, de-duplicated and sorted.
- Options: `--all` mutes every future suggestion instead of specific packages.
  `--format=json` / `--json` / `--show-schema-version` control output.
- Validation: pass package names **or** `--all`, not both and not neither;
  either misuse exits `2`.
- Persistence: the choice is stored in the CLI settings file under
  `[skills.recommend]` and survives across sessions.
- JSON shape: `{ "muted": <bool>, "dismissed": ["oo-gmail", ...] }` — the
  resulting persisted state.

#### `oo skills recommend unmute [packageName...]`

Resume suggesting packages.

- Arguments: `[packageName...]` package names to remove from the dismissal list.
- Options: `--all` clears the global mute instead of specific packages. Output
  options match `mute`.
- Validation: pass package names **or** `--all`, not both and not neither;
  either misuse exits `2`.
- JSON shape: `{ "muted": <bool>, "dismissed": [...] }` — the resulting
  persisted state.

### `oo skills uninstall [skills...]`

Remove oo-managed skills from supported local skill directories.

- Alias: `oo skills remove [skills...]`.
- Arguments: when no name is provided, the command removes all bundled skills.
- Arguments: one or more names may be provided and may mix skill names and
  package names, e.g. `oo skills remove @scope/pkg other-skill`.
- Options: `--agent <agent>` narrows local skill removal to one supported
  agent. It is used to disambiguate same-name local skills across agents.
- Name resolution: each name is first treated as a skill name. The command
  checks bundled skills, agent-native local skills, and published registry
  installations for that name. When a registry and a local skill share the
  name, both are removed, and registry installations are removed before local
  installations.
- Package fallback: when a name matches no installed skill, it is treated as a
  package name and every installed registry skill that belongs to that package
  is removed. A name that starts with `@` and contains `/` (a scoped package
  identity, e.g. `@scope/pkg`) is always treated as a package and is never
  tried as a skill name.
- Package ownership: package matching uses each installed skill's recorded
  package identity. A skill installed from a different package is never removed,
  even when another package publishes a skill with the same name.
- Multiple names: with `--json` every name is attempted and per-name outcomes
  are aggregated into the report. In text output the names are processed in
  order and the first failure stops the run.
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
  `~/.agents/skills/<skill>`,
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
- Options: `--json` / `--format json` emits a structured payload (see "JSON
  output for mutation commands" above).
- `skills[].status` (uninstall JSON): `removed | failed`. `targets[].status`:
  `removed | absent | unmanaged | failed`.
- `error.code` enum (uninstall JSON): `no_supported_hosts` / `invalid_path` /
  `not_installed` / `not_managed` / `ambiguous_local_skill` / `remove_failed`
  / `unknown`.
- Behavior with `--json` and no `[skill]` argument: the command still only
  uninstalls bundled skills; the existing scope is preserved verbatim.

### `oo skills repair`

Force re-deploy one or more oo-managed skills from their trusted source into one
or more agent skill directories. Always overwrites the target directory.

This is **not** `oo skills update`: the command never goes to the network, never
fetches a new registry package version, and never changes the package or
version that is recorded for an installed skill. It only rewrites the agent
copy from the trusted local source.

- Options: `--skill <skill>` is required and may be repeated to repair multiple
  skills. Inputs are de-duplicated; input order is preserved.
- Options: `--agent <agent>` may be repeated to choose target agents. When
  omitted, the command targets every currently-available supported agent (the
  same set used by `oo skills install` defaults). Inputs are de-duplicated.
- Options: `--json` / `--format json` emits a structured payload (see JSON
  output below). `--show-schema-version` (only meaningful with JSON output)
  prepends `schemaVersion`.
- Source priority:
  - If `<skill>` is a bundled skill name (`oo`, `oo-find-skills`,
    `oo-create-skill`, `oo-publish-skill`), the command re-materializes the
    per-agent bundled canonical source from the CLI's embedded assets, then
    publishes that canonical source to the target agent. A repair on a bundled
    skill therefore **also** refreshes the canonical bundled storage at
    `<config-dir>/skills/bundled/<agent>/<skill>`.
  - Otherwise, the command checks
    `<config-dir>/skills/registry/<skill>` for managed registry metadata. If
    found, the command publishes the canonical registry source to the target
    agent. Registry repair never refreshes the canonical registry directory.
  - If the skill is only known as a local skill in an agent's `skills`
    directory, the command exits with `errors.skills.repair.localUnsupported`.
    `repair` does not copy local skills across agents.
  - If neither bundled nor managed registry source can be found, the affected
    `(skill, agent)` pair surfaces as a per-pair failure with
    `error.code: source_not_found`. The command does not fall back to copying
    from one host's installed directory into another.
- Overwrite semantics: the target host directory is rewritten regardless of
  whether it is currently managed, manually modified, has corrupt metadata, or
  is an unmanaged same-name directory. `repair` carries `--force`-style
  semantics for the exact `(source, target agent, skill)` pair that it
  resolves.
- Safety: `repair` does not bypass path containment checks, the supported-agent
  name list, registry canonical metadata validation, startup auto-sync rules,
  or the existing safety borders for `oo skills add`, `oo skills update`,
  `oo skills sync`, `oo skills publish`, and `oo skills uninstall`.
- Fail-soft execution: each `(skill, agent)` pair is attempted independently.
  If any pair fails, the command continues with the remaining pairs, prints a
  summary of successes and failures, and finally exits non-zero.
- Failure inputs that abort up-front (no JSON payload, normal CLI error):
  - Missing `--skill` -> `errors.skills.repair.skillRequired`.
  - `--agent` value outside the supported list -> existing
    `errors.skills.list.invalidAgent`.
  - Explicit `--agent` whose home directory does not exist ->
    `errors.skills.agentNotInstalled`.
  - Skill resolves only as a local skill ->
    `errors.skills.repair.localUnsupported`.
- Text output: text output prints the success summary, a per-skill agent
  list, and any failures. Text output never prints filesystem paths;
  consumers that need machine-readable paths should use `--json`.

#### JSON output

```json
{
  "schemaVersion": "1.0.0",
  "summary": {
    "requestedSkills": 2,
    "targetAgents": 3,
    "repaired": 5,
    "failed": 1
  },
  "results": [
    {
      "skill": "oo",
      "kind": "bundled",
      "agentId": "universal",
      "status": "repaired",
      "path": "/Users/name/.agents/skills/oo",
      "sourcePath": "/Users/name/Library/Application Support/oo/skills/bundled/universal/oo",
      "version": "1.2.3"
    },
    {
      "skill": "chatgpt",
      "kind": "registry",
      "agentId": "claude",
      "status": "failed",
      "path": "/Users/name/.claude/skills/chatgpt",
      "sourcePath": "/Users/name/Library/Application Support/oo/skills/registry/chatgpt",
      "version": "0.4.0",
      "error": {
        "code": "write_failed",
        "message": "Failed to write the skill source to the target agent directory."
      }
    }
  ]
}
```

`schemaVersion` is included only when `--show-schema-version` is set.

`error.code` values are an enumerated, machine-readable set:

- `source_not_found`
- `source_invalid`
- `invalid_path`
- `write_failed`
- `unknown`

`error.message` is a templated, scrubbed string; it never contains stack
traces, raw exception messages, or filesystem paths beyond what already
appears in the surrounding `path` / `sourcePath` fields.

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

## Variables

Store and read named string variables for the current account in the
OOMOL cloud. Aliases: `oo variable`, `oo var`, `oo vars`. All subcommands
require the current account; values are stored as strings (serialize JSON
yourself if needed).

### `oo variables list`

List all variables for the current account, most recently updated first (no
pagination; up to 200 per account).

- Text output: one line per variable, `name` and `updatedAt` only. Full values
  are not printed; use `oo variables get` or `--json` to read a value.
- Options: `--format <format>` / `--json` return structured output as
  `{ "variables": [{ "name", "value", "updatedAt" }] }` with full values.

### `oo variables get <name>`

Read the value of a variable.

- Arguments: `<name>` is required (1-256 characters; no `/` or control
  characters).
- Text output: the raw value followed by a newline.
- Options: `--format <format>` / `--json` return `{ "name", "value", "updatedAt" }`.
- Notes: exits non-zero if the variable does not exist.

### `oo variables create <name> [value]` (alias: `oo variables update`)

Create or replace a variable for the current account (last-write-wins).
`create` and `update` are identical.

- Arguments: `<name>` is required. `[value]` is an optional positional value.
- Value source: exactly one of `[value]`, `--from-file <path>`, or `--stdin`
  must be provided. An empty string is allowed.
- Options: `--from-file <path>` reads the value verbatim from a UTF-8 file.
- Options: `--stdin` reads the value verbatim from standard input until EOF;
  it errors if stdin is an interactive terminal.
- Options: `--format <format>` / `--json` return `{ "name", "value", "updatedAt" }`.
- Notes: the value is limited to 64 KiB (65536 bytes, UTF-8).

### `oo variables delete <name>`

Delete a variable for the current account. Idempotent: succeeds even if the
name does not exist.

- Arguments: `<name>` is required.
- Options: `--json` returns `{ "name", "deleted": true }`.

## Shell Completion

### `oo completion <shell>`

Generate a shell completion script.

- Arguments: `<shell>` is the target shell. Supported values: `bash`, `zsh`,
  `fish`.
