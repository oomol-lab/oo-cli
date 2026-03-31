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

@import CODE_QUALITY_RULES.md

## Testing

- Any modification must include sufficient tests
- Do not write tests for Markdown files
- Tests can only be run using `bun run test`
- Test titles must be in English
- The testing framework is bun's built-in framework
- Test files should be placed in the same directory as the source files
- If a helper function might be called by other test files, it must be placed in the `__tests__/helpers.ts` file. Otherwise, the function should be placed in the test file (at the end of that file).
