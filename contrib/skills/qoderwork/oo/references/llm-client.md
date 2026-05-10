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
- `model`: default model name, currently `oomol-chat`.

Use these fields to configure OpenAI-compatible clients and libraries. Map
`baseUrl` to the library's base URL option, `apiKey` to its API key or
authorization option, and `model` to the model name.

Do not read `auth.toml` directly. Do not hardcode, persist, log, or print
`apiKey` in generated code, user-facing responses, debug output, or generated
files. For generated code, call `oo llm config --json` at runtime and pass the
values into the client in memory.
