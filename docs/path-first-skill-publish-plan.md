# Path-First Skill Publish Plan

## Summary

`oo skills publish` should publish a concrete skill directory instead of resolving
skill ids through hidden local, registry, and agent fallback rules.

The primary flow becomes:

```bash
oo skills locate <skill-id> --agent codex
oo skills publish <path>
```

`--agent` is optional for `locate`. Without it, `locate` searches all available
agent skill directories and canonical registry storage, and succeeds only when
there is one matching path.

## Behavior

| Command | Behavior |
| --- | --- |
| `oo skills locate <skill-id>` | Print the only matching skill path from available agents plus canonical registry storage. If zero or multiple matches exist, fail with a clear error. |
| `oo skills locate <skill-id> --agent <agent>` | Print `<agent>`'s matching skill path only. |
| `oo skills publish <path>` | Publish the skill directory, or the directory containing the provided `SKILL.md`. |

`locate` only finds candidate paths. It does not validate frontmatter or package
metadata. `publish` owns validation. Because `locate` accepts a skill id rather
than a path, path-shaped values such as `../skill` are rejected with guidance to
pass paths directly to `oo skills publish`.

## Registry Publish Writeback

When `publish <path>` publishes an oo-managed registry skill:

1. Validate all available agent targets before the remote publish request.
2. Publish from the requested path.
3. Update the source `SKILL.md` frontmatter and registry metadata with the final
   package name and version.
4. If the source is not canonical registry storage, replace the canonical
   registry skill with the updated source.
5. Copy canonical registry storage to every available supported agent.

If no supported agent home is available, publish and canonical writeback still
succeed.

## Simplifications

- `oo skills publish --agent` is removed.
- `publish` no longer accepts a bare skill id.
- `locate` has plain text output only: one path plus a newline on success.
- `locate` includes unmanaged agent directories when they contain `SKILL.md`;
  unmanaged sources remain valid path publish inputs.
- `publish` rejects oo-managed bundled metadata and invalid `.oo-metadata.json`.

## Required Updates

- Add a `skills locate` command and telemetry decision.
- Simplify `skills publish` source resolution to path-only.
- Update command docs in English and Chinese.
- Update bundled `oo-publish-skill` instructions to mention `oo skills locate`
  as an optional helper, without requiring agents to use it.
- Add focused tests for locate, path publish, registry writeback, and registry
  copy-to-agents behavior.
