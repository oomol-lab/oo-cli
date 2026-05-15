## Project Overview

- Runtime: Bun (version pinned in `.bun-version`)
- Language: TypeScript (strict mode, ESM)
- Key deps: zod (validation), pino (logging)
- Setup: `bun install`

### Bun Runtime

- Documentation index: <https://bun.com/llm.txt>
- When you need to look up any Bun API, feature, or usage pattern, fetch the above URL to find the relevant doc page, then read the specific page for details.

## Development Standards

- After each code modification, you must execute: `bun run lint:fix` `bun run ts-check`
- For any change that affects commands or CLI behavior, you must check whether documentation under `docs/` needs to be updated and update it when necessary
- Documentation under `docs/commands*.md` should describe the user-facing CLI contract only: command purpose, arguments, options, stable output shapes, and externally observable behavior. Do not document internal implementation details such as validator order, AJV usage, schema patching, or other internal lint mechanics unless the user explicitly asks for that level of detail.
- Comments must be in English
- When generating UUIDs, you must use v7 and must use bun's `randomUUIDv7` function
- Avoid using regular expressions when possible

### Bundled Skill Markdown

- When editing bundled `SKILL.md` files or related Markdown under `contrib/skills/shared`, use `agentic-markdown` directives for agent-specific content instead of creating separate agent copies.
- Prefer capability-based conditions over long agent-name lists. If a behavior depends on a feature or tool availability, expose that as a render variable and check the variable instead of writing conditions such as `agent=claude|hermes|codebuddy|qoderwork|workbuddy`.
- Use presence checks for optional capability variables. With `agentic-markdown` 0.0.4+, a missing variable in `agentic:if` is treated as absent instead of throwing:

```md
<!-- agentic:if skillSelectionPromptTool -->
Use <!-- agentic:var skillSelectionPromptTool --> for short multiple-choice prompts.
<!-- agentic:endif -->
```

- Use agent-name conditions only when the content truly belongs to specific agents rather than a shared capability:

```md
<!-- agentic:if agent=claude|gemini -->
Claude and Gemini content.
<!-- agentic:endif -->
```

- Use variables for agent-specific values:

```md
oo skills preflight --agent <!-- agentic:var agent -->
```

### Command Telemetry

- Every new or changed user-facing CLI command must make an explicit telemetry decision during implementation and review.
- The generic `executeCli` path already emits the command event, so do not add manual command-level emit calls.
- For useful command-specific dimensions, call `context.telemetry?.recordProperties(...)` from the command handler with only low-cardinality, privacy-safe enums, booleans, counts, or buckets. Prefer helpers in `src/application/telemetry/buckets.ts`; for skill-related command properties, use `src/application/commands/skills/telemetry.ts`.
- Never record raw user input, paths, cwd, filenames, URL hosts, account IDs/names/emails, usernames, hostnames, error messages, stack traces, tokens, secrets, or free-form option values. Record bucketed values or stable enums instead.
- Commands that must not be reported, such as `oo telemetry *` and the internal telemetry flush command, must set `excludeFromTelemetry: true` or call `context.telemetry?.suppressCurrentInvocation()`; do not rely on handler branching alone.
- Every registered command path must have an explicit entry in `src/application/commands/telemetry-decisions.test.ts`; add or update that manifest whenever adding, renaming, removing, or changing telemetry behavior for a command. This architecture test is the hard guard that makes forgotten telemetry decisions fail in `bun run test`.
- The same architecture test rejects forbidden/private property names, common sensitive suffixes, and base telemetry property names declared in the command telemetry decision manifest; extend that guard before allowing any new sensitive key pattern.
- Do not pass base telemetry property names such as `command_full`, `distinct_id`, `schema_version`, or privacy control properties through `recordProperties(...)`; both the architecture test and the payload builder reject command-specific properties that attempt to override base telemetry fields.
- When adding command-specific telemetry properties, add or update tests that assert the expected safe property shape and absence of raw/private values. For command behavior changes, still update `docs/commands*.md` only for the user-facing CLI contract, not internal telemetry details.

@import CODE_QUALITY_RULES.md

## Testing

- Any modification must include sufficient tests
- Do not write tests for Markdown files
- Tests can only be run using `bun run test`
- Test titles must be in English
- The testing framework is bun's built-in framework
- Test files should be placed in the same directory as the source files
- If a helper function might be called by other test files, it must be placed in the `__tests__/helpers.ts` file. Otherwise, the function should be placed in the test file (at the end of that file).
