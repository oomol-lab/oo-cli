# Contributing

Thank you for contributing to `oo`. This repository favors small, reviewable
changes that preserve the current layering: command logic lives in the
application layer, integration details stay in adapters, and user-facing text
flows through the i18n catalog.

## Development Setup

```bash
bun install
```

For quick local development, run the CLI directly from source:

```bash
bun run dev --help
```

This is the fastest way to verify argument parsing and command output while
iterating on local changes. Source-based development runs do not auto-install
or auto-synchronize the bundled Codex skill into `${CODEX_HOME:-~/.codex}`.

Useful commands:

```bash
bun run build:current-platform
bun run build:windows-x64
bun run build:windows-arm64
bun run build:macos
bun run build:linux
bun run dev --help
bun run index.ts --help
bun run lint:fix
bun run ts-check
bun run test
```

## Local Package Builds

Use the build scripts when you need to verify the npm distribution artifacts
locally.

- `bun run build:current-platform`: stages only the package for the current
  machine into `dist/release-packages/`
- `bun run build:windows-x64`: stages only the Windows x64 package into
  `dist/release-packages/`
- `bun run build:windows-arm64`: stages only the Windows arm64 package into
  `dist/release-packages/`
- `bun run build:macos`: stages only the macOS packages into
  `dist/release-packages/`
- `bun run build:linux`: stages only the Linux packages into
  `dist/release-packages/`
- `BUILD_DIST_DIR=/tmp/oo-dist bun run build:linux`: writes staged packages to
  a custom output directory
- `BUILD_VERSION=1.2.3 bun run build:windows-arm64`: overrides the version used
  in generated package manifests without editing `package.json`

The platform-specific build scripts only write staged package directories.
Release assembly remains an internal CI step that consumes those staged
artifacts later in the publish workflow.

## Project Layout

- `index.ts`: executable entrypoint
- `docs`: end-user documentation, including the bilingual command reference
- `src/application/bootstrap`: runtime composition and CLI startup
- `src/application/commands`: command definitions and handlers
- `src/application/contracts`: interfaces shared across the application layer
- `src/application/schemas`: schemas for persisted data and remote payloads
- `src/adapters`: Commander adapter, file stores, cache, and completion output
- `src/i18n`: locale resolution and translated messages
- `__tests__/helpers.ts`: shared test helpers used by multiple test files

## Working Rules

- Keep the entrypoint thin. New behavior should usually be added under
  `src/application` or `src/adapters`, not in `index.ts`.
- Prefer extending existing contracts or shared helpers over duplicating remote
  request or persistence logic across commands.
- Add all user-visible text to `src/i18n/catalog.ts`. Command code should
  reference message keys instead of embedding copy directly.
- Comments must be written in English.
- When generating UUIDs, use Bun's `randomUUIDv7`.
- Avoid regular expressions when a simpler parser or string operation is
  enough.

## Adding or Changing a Command

1. Add or update the command definition in `src/application/commands`.
2. Define or refine the command input schema so raw CLI input is validated
   before handler logic runs.
3. Put reusable behavior in shared helpers when multiple commands depend on the
   same remote request, parsing step, or persistence rule.
4. Register new top-level commands in
   `src/application/commands/catalog.ts`.
5. Add or update the related help text and error messages in
   `src/i18n/catalog.ts`.
6. Add or update tests next to the source file that changed.

## Testing Expectations

- Run `bun run lint:fix` after each code change.
- Run `bun run ts-check` after each code change.
- Run `bun run test` before opening a pull request.
- Test files should live next to the source file they cover.
- Test titles must be in English.
- If a helper is shared by multiple test files, place it in
  `__tests__/helpers.ts`. Otherwise keep it inside the local test file.

## Pull Request Checklist

- Scope is limited to the intended change and avoids unrelated refactors.
- New or changed behavior is covered by tests when the logic is non-trivial.
- New user-facing text is localized.
- Documentation is updated when command behavior or developer workflow changes.
