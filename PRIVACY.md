# Privacy

`oo` records privacy-constrained command usage telemetry by default. Telemetry is
used to understand command adoption, error rates, update health, and package or
skill usage distribution.

Telemetry events are sent to OOMOL's telemetry endpoint and are backed by
PostHog Cloud in the EU region. Each event disables PostHog person profile
processing and uses a random local device id for device-level aggregation.
The device id is not derived from an OOMOL account.

## Data Not Collected

Telemetry events do not include:

- free-form input text, such as search queries or connector payloads
- file paths, working directories, filenames, usernames, or hostnames
- IP addresses
- real OOMOL account ids, account names, or account emails
- account pseudonyms, `$set`, `$set_once`, or `$identify` properties
- full error messages, stack traces, crash dumps, or performance profiles
- URL hosts or full URLs

The CLI only records account state as `authenticated`, `anonymous`, or
`unknown`.

## Data That Can Be Collected

Telemetry events can include:

- command name, exit code, success state, duration, argument count, and flag count
- CLI version, commit, install method, operating system, architecture, runtime,
  language, CI state, and TTY state
- package names, package versions, skill ids, bundled skill names, connector
  service names, connector action names, and public enum-like option values
- bucketed counts, byte sizes, and string lengths

## User Control

Disable telemetry for the current invocation with either environment variable:

- `OO_TELEMETRY_DISABLED=1`
- `DO_NOT_TRACK=1`

Disable telemetry persistently with:

- `oo telemetry disable`
- `oo config set telemetry.enabled false`

Re-enable telemetry persistently with:

- `oo telemetry enable`
- `oo config set telemetry.enabled true`
- `oo config unset telemetry.enabled`

Inspect the effective state, local device id prefix if it already exists,
pending local event count, and last flush time with:

- `oo telemetry status`

`oo telemetry disable` and `oo config set telemetry.enabled false` attempt to
delete pending local telemetry events immediately. They prevent future telemetry
sends even if the local telemetry store is temporarily unavailable, but they
cannot retract bytes that have already been sent over the network.
