# LLM Client Config

Read this file when local code you write or run needs OOMOL-hosted LLM client
configuration, an OpenAI-compatible base URL, an API key, or the default OOMOL
model.

Run:

```bash
oo llm config --json
```

The JSON output contains:

- `apiKey`: current account API key.
- `baseUrl`: OOMOL LLM API base URL.
- `chatCompletionsUrl`: normalized OpenAI-compatible chat completions URL.
- `model`: default model name, currently `oomol-chat`.

Use these fields to configure OpenAI-compatible clients and libraries. Map
`baseUrl` to the library's base URL option, `apiKey` to its API key or
authorization option, and `model` to the model name. For raw HTTP calls to the
chat completions API, use `chatCompletionsUrl` instead of constructing a URL
from `baseUrl`.

Do not read `auth.toml` directly. Do not hardcode, persist, log, or print
`apiKey` in generated code, user-facing responses, debug output, or generated
files. For generated code, call `oo llm config --json` at runtime and pass the
values into the client in memory.

## Structured JSON outputs

When using the hosted LLM for a local structured-output task:

- Ask for JSON only, with no Markdown fences or prose.
- Provide the exact object shape and required fields in the request.
- Include stable item identifiers in each input item when the caller must
  reconcile batched outputs.
- Parse the model output as JSON before trusting it.
- Validate required keys, primitive types, and item identifiers locally.
- Save valid returned items before retrying failures.
- Retry only missing or invalid items when the task semantics allow partial
  recovery.
- Keep checkpoint files for long batches so an interrupted run can continue
  without repeating successful LLM work.

Do not make this skill infer domain-specific semantics for structured outputs.
The caller still owns task-specific checks such as subtitle cue coverage,
translation style, line breaking, or output naming.

## LLM error interpretation

- Treat HTTP `404` from a chat completions call, especially with an HTML body,
  as an endpoint construction problem before changing the prompt.
- Treat HTTP `401` or `403` as authentication or authorization failure.
- Treat HTTP `429` as rate limiting.
- Treat malformed or schema-invalid JSON as a structured-output failure and
  retry within the caller's retry budget.
