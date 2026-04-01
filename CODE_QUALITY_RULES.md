# Code Quality Rules

These rules are extracted from past refactoring sessions to prevent recurring code smells.

## No Trivial Wrappers

Never create single-line functions that merely delegate to another function without adding logic, validation, or semantic value.

```typescript
// BAD - wrapper adds nothing
function createAuthColors(context: CliExecutionContext): TerminalColors {
    return createWriterColors(context.stdout);
}
function serializeCacheValue<Value>(value: Value): string {
    return JSON.stringify(value);
}

// GOOD - use the real function directly
const colors = createWriterColors(context.stdout);
const serialized = JSON.stringify(value);
```

The same applies to constant aliases (`const OO_BRAND_NAME = APP_NAME`) and identity type-check functions (`function define<T>(d: T): T { return d; }` — use `satisfies` instead).

## DRY — Extract Shared Utilities

When identical logic appears in 2+ files, extract it to a shared module. Common candidates:

- Auth account checking → `shared/auth-utils.ts`
- Output helpers → `shared/output.ts`
- Database open/close → `sqlite-utils.ts`
- File error checks → `file-store-utils.ts`

Parameterize the varying parts (error message keys, config values) rather than duplicating the whole function.

```typescript
// BAD - same pattern in 4 files with different error keys
async function requireCurrentPackageInfoAccount(ctx) { /* ... */ }
async function requireCurrentSkillsSearchAccount(ctx) { /* ... */ }

// GOOD - one shared function, parameterized
export async function requireCurrentAccount(
    context: CliExecutionContext,
    authRequiredKey: string,
    accountMissingKey: string,
): Promise<AuthAccount> { /* ... */ }
```

## Trust the Type System

Do not re-parse or re-validate data whose type is already guaranteed by the function signature. Internal functions should trust their callers.

```typescript
// BAD - authFile is already typed as AuthFile
function renderAuthFile(authFile: AuthFile): string {
    const parsed = authFileSchema.parse(authFile); // redundant
}

// GOOD
function renderAuthFile(authFile: AuthFile): string {
    const lines = [renderTomlLine("id", authFile.id)]; // direct use
}
```

## Use Modern, Idiomatic APIs

- `str.replaceAll(a, b)` instead of `str.split(a).join(b)`
- `for (const char of str)` for Unicode-aware iteration instead of manual index + surrogate pair handling
- `Bun.sleep(ms)` instead of `new Promise(r => setTimeout(r, ms))` in Bun environment
- `satisfies` for type-checking object literals instead of identity wrapper functions

## Guard Clauses — Fail First

Check error conditions at the top; let the success path be the default flow. Don't wrap success logic inside `if (valid)`.

```typescript
// BAD
function validate(id: string): void {
    if (id !== "") { return; }
    throw new TypeError("id required");
}

// GOOD
function validate(id: string): void {
    if (id === "") { throw new TypeError("id required"); }
}
```

## No Fake Async

Never mark a function `async` if it contains no `await`. Remove `async` when all code paths are synchronous.

```typescript
// BAD
async function listGitTags(): Promise<string[]> {
    return Bun.spawnSync(/* ... */); // synchronous
}

// GOOD
function listGitTags(): string[] {
    return Bun.spawnSync(/* ... */);
}
```

## Minimize Export Surface

Only `export` symbols that are used by other modules. Internal helpers, types, and constants should remain module-private. Smaller public API = more refactoring freedom.

## filter+map over flatMap-as-Filter

Use `filter()` for filtering and `map()` for transformation. Do not abuse `flatMap()` with empty arrays as a filtering mechanism — it obscures intent.

```typescript
// BAD
entries.flatMap(e => e.isFile() ? [e.name] : []);

// GOOD
entries.filter(e => e.isFile()).map(e => e.name);
```

## No Redundant Intermediate Variables

Don't create variables that pass through a value unchanged. If no transformation occurs, use the original directly.

```typescript
// BAD
const selectedNames = request.names.flatMap((n) => { validate(n); return n; });
doWork(selectedNames);

// GOOD
for (const n of request.names) { validate(n); }
doWork(request.names);
```

## Eliminate Dead Code

- Remove unused functions, parameters, type fields, and unreachable branches
- Remove `if (error instanceof X) { throw error; }` inside catch — restructure control flow instead
- Remove `JSON.stringify() === undefined` checks — `JSON.stringify` never returns `undefined`

## Parallel Async Operations

Use `Promise.all()` for independent async operations instead of sequential `await`.

```typescript
// BAD
await removePath(pathA);
await removePath(pathB);

// GOOD
await Promise.all([removePath(pathA), removePath(pathB)]);
```

## EAFP over LBYL for File Operations

Attempt the operation and catch the error, rather than pre-checking existence then reading. Reduces filesystem calls and avoids TOCTOU races.

```typescript
// BAD - 3 filesystem calls
if (!(await directoryExists(p)))
    return undefined;
if (!(await fileExists(metaPath)))
    return undefined;
return await readMetadata(p);

// GOOD - 1 filesystem call
try { return await readFile(metaPath, "utf8"); }
catch (e) {
    if (isNodeNotFoundError(e))
        return undefined; throw e;
}
```

## Data-Driven over Parallel Mappings

When multiple switch/map structures share the same keys, consolidate into a single configuration object.

```typescript
// BAD - two separate mappings
const translations: Record<Status, string> = { valid: "...", invalid: "..." };
function readTone(s: Status) { switch(s) { case "valid": return "success"; ... } }

// GOOD - single config
const statusConfig = {
    valid: { tone: "success", key: "auth.status.valid" },
    invalid: { tone: "danger", key: "auth.status.invalid" },
} as const;
```

## Precise Type Checks

Use `!== undefined` instead of truthy checks when empty string `""` or `0` are valid values.

```typescript
// BAD - filters out valid empty strings
if (value) { output(value); }

// GOOD
if (value !== undefined) { output(value); }
```

## No Duplicate Computations

Compute an expression once, store in a variable, reuse. Especially inside `switch` statements and loops.

```typescript
// BAD
switch (str.trim().toLowerCase()) {
    case "a": return str.trim().toLowerCase(); // computed twice
}

// GOOD
const normalized = str.trim().toLowerCase();
switch (normalized) {
    case "a": return normalized;
}
```

## Single Source of Truth for Constants

Never duplicate constant values across files. Define once, import or re-export with aliases elsewhere.

## Parameterize Common Patterns with Factories

When multiple definitions share the same shape with only one or two varying fields, use a factory function.

```typescript
// BAD - 3 identical method bodies with different error keys
lang: { createError(v) { return new Err("errors.config.invalidLang", 2, { value: String(v ?? "") }); } },
dir:  { createError(v) { return new Err("errors.config.invalidDir",  2, { value: String(v ?? "") }); } },

// GOOD
function createValueErrorFactory(key: string) {
    return (v: unknown) => new Err(key, 2, { value: String(v ?? "") });
}
lang: { createError: createValueErrorFactory("errors.config.invalidLang") },
dir:  { createError: createValueErrorFactory("errors.config.invalidDir") },
```

## Keep Function Parameters Narrow

Pass only what the function needs, not entire context objects. This improves testability and reduces coupling.

```typescript
// BAD
function writeLine(context: CliExecutionContext, msg: string) {
    context.stdout.write(`${msg}\n`);
}

// GOOD
function writeLine(stream: Writer, msg: string) {
    stream.write(`${msg}\n`);
}
```

## DRY in Tests — Extract Repeated Setup

When the same mock, stub, or setup object appears in multiple tests within the same file, extract it into a local factory function at the bottom of the file. Copy-pasted test setup is still copy-paste.

```typescript
// BAD - identical 15-line mock in every test
test("case A", () => {
    const translator = { t: (key) => { switch (key) { case "x": return "X"; /* 10 more */ } } };
    // ...
});
test("case B", () => {
    const translator = { t: (key) => { switch (key) { case "x": return "X"; /* same 10 */ } } };
    // ...
});

// GOOD - one factory, all tests share it
test("case A", () => {
    const translator = createTranslatorStub();
    // ...
});
test("case B", () => {
    const translator = createTranslatorStub();
    // ...
});

function createTranslatorStub() {
    return { t: (key: string) => { switch (key) { case "x": return "X"; /* ... */ default: return key; } } };
}
```

## Complete the Extraction — Propagate to Tests

When extracting a shared utility from production code, also replace any test helpers or inline expressions that duplicate the same logic. An extraction is incomplete if test files still contain local functions or raw inline code doing the same thing under a different name.

```typescript
// BAD - shared utility extracted, but tests still duplicate it
// skill-metadata.ts (shared module)
export function renderSkillMetadataJson(metadata: object): string {
    return `${JSON.stringify(metadata, null, 2)}\n`;
}

// index.test.ts (local helper duplicates the shared utility)
function formatBundledSkillMetadataContent(version: string): string {
    return `${JSON.stringify({ version }, null, 2)}\n`;
}

// update.test.ts (inline expression duplicates the shared utility)
await Bun.write(path, `${JSON.stringify({ version: "1.0.0" }, null, 2)}\n`);

// GOOD - tests import the shared utility directly
import { renderSkillMetadataJson } from "./skill-metadata.ts";
await Bun.write(path, renderSkillMetadataJson({ version: "1.0.0" }));
```

## `try/finally` over `try/catch/rethrow` for Cleanup

When the only purpose of a `catch` block is to clean up and rethrow, use `finally` instead. It eliminates the duplicate cleanup call and removes dead code in the success path.

```typescript
// BAD - cleanup duplicated, catch block only rethrows
try {
    doWork();
} catch (error) {
    cleanup();
    throw error;
}
cleanup();

// GOOD
try {
    doWork();
} finally {
    cleanup();
}
```
