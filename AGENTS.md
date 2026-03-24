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
- Comments must be in English
- When generating UUIDs, you must use v7 and must use bun's `randomUUIDv7` function
- Avoid using regular expressions when possible

## Testing

- Tests can only be run using `bun run test`
- Test titles must be in English
- The testing framework is bun's built-in framework
- Test files should be placed in the same directory as the source files
- If a helper function might be called by other test files, it must be placed in the `__tests__/helpers.ts` file. Otherwise, the function should be placed in the test file (at the end of that file).
