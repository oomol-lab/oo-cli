# oo 命令参考

[English](./commands.md) | [简体中文](./commands.zh-CN.md)

项目概览见 [README-ZH_CN.md](../README-ZH_CN.md)

## 全局选项

- `--debug`：在 CLI 退出时将当前日志文件路径输出到 `stderr`。
- `--lang <lang>`：为当前命令临时指定显示语言。支持的值：`en`、`zh`。
- `-h, --help`：显示当前命令的帮助信息。
- `-V, --version`：显示当前 CLI 版本、构建时间和 commit hash。

## JSON 输出

文档中带有 `--format=json` 和 `--json` 的命令遵循以下约定：

- `--show-schema-version` 会在 JSON 输出中加入 `schemaVersion` 字段，当前固定
  为 `1.0.0`。
- 当原始输出是 JSON 对象时，`schemaVersion` 作为顶层字段合并进对象中。
- 当原始输出是 JSON 数组时，会被包裹为
  `{ "schemaVersion": "1.0.0", "items": <数组> }`。
- 如果没有通过 `--format=json` 或 `--json` 请求 JSON 输出，
  `--show-schema-version` 不会产生任何效果。

## Debug 日志

- CLI 会把结构化 debug 日志写入按平台区分的持久化日志目录：
  macOS：`~/Library/Logs/oo`
  Linux：`${XDG_STATE_HOME:-~/.local/state}/oo/logs`
  Windows：`%LOCALAPPDATA%\\oo\\Logs`
- Debug 日志会覆盖远端 API 请求生命周期、device login 轮询事件、显式更新检查，
  以及 settings/auth 持久化状态变化和 sqlite cache 活动。
- 偏错误类的日志还会带上 `category` 字段，便于快速筛选用户错误、系统错误和可
  恢复的 cache 问题。
  当前会用到的值包括 `user_error`、`system_error`、`recoverable_cache`。
- CLI 仅保留当前本地日期及之前 6 个本地日期内的 debug 日志文件，也就是按本地
  `00:00` 边界计算的最近 7 个自然日。超过该日期窗口的日志会被优先删除，不再
  有固定文件数量上限。

## 认证

### `oo auth login`

启动 device login 流程，或使用 session token、API key 登录，并保存登录成功后的账号。

- 说明：未传入 `--session-token` 也未传入 `--api-key` 时，CLI 会打印验证地址，并把用户
  code 放在 `user_code` query 参数中，然后最多等待 10 分钟，直到 device login 验证成功；
  如果超过该时间仍未完成验证，会以超时错误退出。
- 选项：
  - `--session-token <session-token>`：使用已有 session token 登录。传入后 CLI 不会
    打印 device-login URL，也不会轮询验证结果。
  - `--api-key <api-key>`：使用已有 API key 登录。CLI 会通过账号 profile 校验该 key，
    校验通过后直接保存账号，不会打印 device-login URL 或轮询；若 key 无效或已过期则以
    错误退出。`--api-key` 与 `--session-token` 不能同时使用。

### `oo auth logout`

从持久化认证数据中移除当前账号。

### `oo auth status`

显示已保存的全部认证账号，并校验当前激活账号的 API key 状态。

- 别名：`oo auth info`。
- 文本输出会在 `Accounts:` 区块下列出所有已保存账号。当前激活账号会标注
  `[active]`，并额外显示其 `API key status`——通过一次 profile 请求向该账号
  对应的 endpoint 校验得到。其它账号不参与校验，所以无论有多少账号，
  `oo auth status` 最多发送 1 次网络请求。
- 文本和 JSON 输出都永远不会包含 API key 实际内容。
- 选项：`--format=json` 与 `--json` 切换到结构化 JSON 输出。
  `--show-schema-version` 会向 payload 顶层添加 `schemaVersion`。
- JSON 三种形态：

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

- 说明（JSON）：
  - **绝不**输出 `apiKey` 字段；JSON payload 在任何字段下都不包含实际 API key 字符串。
  - `accounts[]` 按原顺序列出本地 auth file 中保存的全部账号，每条 entry 为
    `{ id, name, endpoint, active, apiKeyStatus? }`。
  - `activeAccountId` 是当前激活账号 ID；无可用激活账号时（包括
    `active-account-missing` 状态）为 `null`。
  - `accounts[].active` 仅在激活账号上为 `true`。
  - `accounts[].apiKeyStatus` 只在激活账号 entry 出现，枚举为
    `valid` / `invalid` / `request_failed` / `request_failed_sandbox`。
  - `missingAccountId` 仅在 auth file 记录的 active id 已不存在于
    `accounts[]` 时出现。
  - 三种状态都以 0 退出（查询命令）；参数错误（如 `--format xml`）仍以 2 退出。

### `oo auth switch`

切换当前激活的认证账号。

- 不传参数时，按 `auth.toml` 中的顺序轮转到下一个已保存账号。
- 选项：`-u, --user <user>` 切换到指定账号。匹配规则为：先按 `account.id`
  精确匹配，再按 `account.name` 精确匹配（必须唯一）；不做模糊、忽略大小写
  或子串匹配。
- 当 `<user>` 按 name 命中多个账号时，命令以非零退出，不重写 `auth.toml`，
  并提示需要传 account id 进行消歧。account id 是稳定字符串，可通过
  `oo auth status --json` 获取。
- 当指定的账号已是激活账号时，切换为幂等操作（exit `0`，不改变激活状态）。
- 任何输出路径都不会将 API key 写入 stdout/stderr。

### `oo login`

`oo auth login` 的别名。支持相同的 `--session-token <session-token>` 与
`--api-key <api-key>` 选项。

### `oo logout`

`oo auth logout` 的别名。

## LLM

### `oo llm config`

以 JSON 输出当前账号的 LLM client 配置。

- 认证：要求存在当前 OOMOL 账号。
- 选项：`--format=json` 和 `--json` 会被接受，以便与其他结构化输出命令保持一致。
  该命令始终输出 JSON。
- 输出：JSON 对象包含：
  - `apiKey`：当前账号 API key。
  - `baseUrl`：OpenAI-compatible LLM API base URL，已包含 `/v1` API 前缀。
  - `chatCompletionsUrl`：规范化后的 OpenAI-compatible chat completions endpoint。
    原始 chat completions 请求应直接调用该 URL，不要自行给 `baseUrl` 追加路径。
  - `model`：默认模型名，当前为 `oomol-chat`。
- 生产环境输出的 `baseUrl` 为 `https://llm.oomol.com/v1`，`chatCompletionsUrl`
  为 `https://llm.oomol.com/v1/chat/completions`。

### `oo llm json`

调用当前配置的 LLM，并要求返回符合指定 JSON Schema 的 JSON 响应。

- 认证：要求存在当前 OOMOL 账号。
- 选项：
  - `--schema <schema>` 为必填。取值必须是根类型为 `object` 的 JSON Schema
    object，或 `@path/to/schema.json`。
  - `--input <input>` 提供输入 JSON，或使用 `@path/to/input.json` 读取。
    省略时输入为 `{}`。
  - `--system <system>` 提供额外 system prompt 文本，或使用
    `@path/to/system.txt` 读取。
  - `--max-retries <count>` 设置首次尝试之后的重试次数。默认值为 `2`；
    支持 `0` 到 `5`。
  - `--model <model>` 为本次调用覆盖默认模型。
  - `--format=json` 和 `--json` 会被接受，以便与其他结构化输出命令保持一致。
    该命令始终输出 JSON。
- 行为：CLI 会把所选 schema 和输入发送给当前配置的 OpenAI-compatible chat
  completions endpoint，要求模型只输出 JSON，修正常见 JSON 包裹形式（例如
  Markdown fence），校验解析后的值是否符合 schema，并在重试预算内重试格式错误或不符合
  schema 的模型输出。
- 输出：成功时打印 `{ ok: true, data, model, attempts }`，其中 `data`
  是已校验通过的模型 JSON 值。
- 错误：endpoint `404`、认证 `401` 或 `403`、限流 `429`、schema 无效、
  根类型不是 object 的 schema、LLM 响应结构不受支持、以及重试耗尽都会作为命令错误报告。

## 配置

- 说明：如果持久化 settings 文件里存在未知 key，CLI 会忽略这些 key，并在
  debug 日志中写入 warning；已知 key 仍会按正常规则生效。

### `oo config list`

列出当前已经设置的持久化配置。

### `oo config get <key>`

读取一个持久化配置值。

- 参数：`<key>` 为配置键。目前支持
  `lang`、`file.download.out_dir`、`telemetry.enabled`。

### `oo config path`

输出持久化配置文件路径。

### `oo config set <key> <value>`

写入一个持久化配置值。

- 参数：`<key>` 为配置键。目前支持
  `lang`、`file.download.out_dir`、`telemetry.enabled`。
- 参数：`<value>` 为对应配置值。
- 取值规则：当 `<key>` 为 `lang` 时，支持的值为 `en` 和 `zh`。
- 取值规则：当 `<key>` 为 `file.download.out_dir` 时，支持任意非空路径字符串。
  相对路径会在执行 `oo file download` 时相对于当前工作目录解析；如果以 `~`
  开头，则会展开为当前用户的 home 目录。
- 取值规则：当 `<key>` 为 `telemetry.enabled` 时，仅支持小写 `true` 和 `false`。
  `1`、`0`、`True`、`yes` 等其他 boolean-like 写法会被拒绝。设置为 `false` 时，
  CLI 还会立即尝试清空待发送 telemetry 事件，并且本次 `config set` 调用自身不会被记录为
  telemetry。

### `oo config unset <key>`

删除一个持久化配置值。

- 参数：`<key>` 为配置键。目前支持
  `lang`、`file.download.out_dir`、`telemetry.enabled`。

## Telemetry

CLI 默认记录受隐私约束的命令使用 telemetry。事件不包含 free-form 输入文本、路径、
用户名、hostname、IP 地址、错误消息全文、真实 OOMOL 账号 ID、账号名、`$set` 或
`$identify`。每条事件使用本地随机 device id，并设置
`$process_person_profile = false`。package name 和 skill id 可能出现在 telemetry
事件中，包括 private package name，因为它们被视为已发布的产品产物名。

- 环境变量：将 `OO_TELEMETRY_DISABLED` 设为真值（`1`、`true`、`yes`、`on`，
  大小写不敏感）会关闭当前 invocation 的 telemetry。
- 环境变量：将 `DO_NOT_TRACK` 设为真值（`1`、`true`、`yes`、`on`，
  大小写不敏感）也会关闭当前 invocation 的 telemetry。
- 持久化：`oo telemetry disable` 和 `oo config set telemetry.enabled false` 会在
  `settings.toml` 中持久化 telemetry 关闭状态。
- 边界：关闭 telemetry 会阻止后续发送，并立即尝试清空本地待发送 telemetry 事件。
  如果本地 telemetry store 暂时不可用，关闭状态仍会在未来发送前生效；但无法撤回已经通过
  活跃 TCP 连接发出的字节。

### `oo telemetry status`

显示 telemetry 的实际开关状态、已存在的本地 device id 前缀、待发送事件数量和最后一次
成功 flush 时间。

- 输出：telemetry 启用时显示 `enabled: true`。
- 输出：被 `OO_TELEMETRY_DISABLED` 或 `DO_NOT_TRACK` 关闭时显示
  `enabled: false (env)`。
- 输出：被持久化的 `telemetry.enabled = false` 关闭时显示
  `enabled: false (config)`。
- 输出：`device_id` 在 telemetry 创建本地 device id 前显示为 `none`。
- 输出：`pending` 是本地待发送 telemetry 事件数量，包括已经开始发送但尚未确认发送成功
  的事件。
- 说明：`status` 不会创建 device id，也不会被记录为 telemetry。

### `oo telemetry enable`

持久化写入 `telemetry.enabled = true`。

- 说明：开启 telemetry 不会清空 pending events，也不会被记录为 telemetry。

### `oo telemetry disable`

持久化写入 `telemetry.enabled = false`，并立即尝试删除本地全部待发送 telemetry 事件。

- 说明：关闭 telemetry 不会被记录为 telemetry。

## 更新

### `oo install [version]`

把一个由 `oo` 托管的 CLI 版本安装到本地自管理运行时中。

- 参数：`[version]` 为可选参数。省略时，`oo` 会安装最新发布版本。
- 选项：`--force` 会在请求的版本已经安装时仍然强制重装。
- 选项：`--no-modify-path` 跳过自动 PATH 配置；当可执行目录不在 `PATH` 上时，
  install 仍会打印 setup note。
- 环境变量：将 `OO_NO_MODIFY_PATH` 设为真值（`1`、`true`、`yes`、`on`，大小写不敏感）
  等价于 `--no-modify-path`。标志和环境变量按"任一为跳过即跳过"的或关系组合，
  任一设置都会跳过 PATH 配置。
- 环境变量：将 `OO_HIDE_PATH_SHADOWING_WARNING` 设为真值会隐藏 shadowing note，
  适用于有意把另一个 `oo` 放在 `PATH` 更前面的用户。它不会改变托管安装、PATH
  配置或旧安装清理行为。
- 输出：成功时，CLI 会打印已安装版本和最终的可执行入口路径。
- 输出：当 `stderr` 是交互式 TTY 时，CLI 还会在安装过程中向 `stderr`
  渲染带颜色的进度阶段。
- 说明：install 在报告成功前会校验已安装的 `oo` 命令可正常使用。
- 说明：install 成功后，CLI 会尽力移除在 `PATH` 中任意位置出现的旧全局
  package-manager `@oomol-lab/oo-cli` 安装；如果 `PATH` 中没有找到 `oo`
  候选项，CLI 会回退到当前命令路径进行判断。对于 npm 安装，清理命令会在可推断时
  使用检测到的 global prefix。清理失败不会改变命令结果。
- 说明：PATH 配置和旧安装清理结束后，如果当前 `PATH` 仍然会先解析到另一个
  `oo`，早于托管可执行目录，install 会打印 shadowing note，指出该路径和托管目录。
- 说明：当自动 PATH 修改启用时，install 会确保 zsh startup profile
  `.zprofile` 和 `.zshenv` 包含托管 PATH 片段，即使当前 `PATH` 已经包含可执行目录。
  如果可执行目录没有出现在 `PATH` 中，install 还会尝试为后续 shell 持久化 PATH
  配置；如果自动配置成功，install 会提示用户重启 shell；如果自动配置失败，
  install 会打印 setup note，告知用户应当把哪个目录加入 `PATH`。
- 说明：当部分 shell profile 配置成功、另一部分失败时，install 会分别列出两组
  ——已配置的 profile 和未能配置的 profile，并附带重启 shell 的提示；用户可据此
  决定是否手动补全未配置的 profile。
- 说明：install 成功后，CLI 会使用托管的可执行文件静默执行一次
  `oo skills add`，让 bundled skills 刷新到已安装的 CLI 版本。该命令也会把
  安装成功的预设 registry skills 合并进同一份 skill 摘要。
- 说明：当当前版本为 `0.0.0-development` 时，CLI 会打印不支持托管 install /
  update 的提示，并以成功状态退出。

### `oo update`

把托管的 `oo` 安装更新到最新发布版本。

- 参数：无。
- 选项：`--no-modify-path` 跳过自动 PATH 配置；当可执行目录不在 `PATH` 上时，
  update 仍会打印 setup note。
- 环境变量：将 `OO_NO_MODIFY_PATH` 设为真值（`1`、`true`、`yes`、`on`，大小写不敏感）
  等价于 `--no-modify-path`。标志和环境变量按"任一为跳过即跳过"的或关系组合，
  任一设置都会跳过 PATH 配置。
- 环境变量：将 `OO_HIDE_PATH_SHADOWING_WARNING` 设为真值会隐藏 shadowing note，
  适用于有意把另一个 `oo` 放在 `PATH` 更前面的用户。它不会改变托管安装、PATH
  配置或旧安装清理行为。
- 输出：当当前版本已经是最新发布版本时，CLI 会打印“已是最新版本”的消息。
- 输出：当有更新的发布版本可用时，CLI 会打印版本变更结果。
- 输出：当 `stderr` 是交互式 TTY 时，CLI 还会在更新过程中向 `stderr`
  渲染带颜色的进度阶段。
- 说明：`oo update` 会确保托管安装保持为当前可用状态，不额外暴露
  `--force`。
- 说明：当最新发布版本与当前版本一致时，update 仍会先为当前激活的托管版本
  执行 `oo skills add`，再输出“已是最新版本”的消息。
- 说明：update 成功后，CLI 会尽力移除在 `PATH` 中任意位置出现的旧全局
  package-manager `@oomol-lab/oo-cli` 安装；如果 `PATH` 中没有找到 `oo`
  候选项，CLI 会回退到当前命令路径进行判断。对于 npm 安装，清理命令会在可推断时
  使用检测到的 global prefix。清理失败不会改变命令结果。
- 说明：PATH 配置和旧安装清理结束后，如果当前 `PATH` 仍然会先解析到另一个
  `oo`，早于托管可执行目录，update 会打印 shadowing note，指出该路径和托管目录。
- 说明：当自动 PATH 修改启用时，update 会确保 zsh startup profile
  `.zprofile` 和 `.zshenv` 包含托管 PATH 片段，即使当前 `PATH` 已经包含可执行目录。
  如果可执行目录没有出现在 `PATH` 中，update 还会尝试为后续 shell 持久化 PATH
  配置；如果自动配置成功，update 会提示用户重启 shell；如果自动配置失败，
  update 会打印 setup note，告知用户应当把哪个目录加入 `PATH`。
- 说明：当部分 shell profile 配置成功、另一部分失败时，update 会分别列出两组
  ——已配置的 profile 和未能配置的 profile，并附带重启 shell 的提示；用户可据此
  决定是否手动补全未配置的 profile。
- 说明：update 成功后，CLI 会使用托管的可执行文件静默执行一次
  `oo skills add`，让 bundled skills 刷新到已安装的 CLI 版本。该命令也会把
  安装成功的预设 registry skills 合并进同一份 skill 摘要。
- 说明：当当前版本为 `0.0.0-development` 时，CLI 会打印不支持托管 install /
  update 的提示，并以成功状态退出。

### `oo upgrade`

`oo update` 的别名。

### `oo uninstall`

卸载受管的 `oo` 运行时及其内置 skills。

- 参数：无。
- 选项：`-y, --yes` 跳过确认提示；非交互式终端下必须传入。
- 选项：`--dry-run` 只打印将删除（与将保留）的内容，不实际删除。
- 选项：`--purge` 额外删除用户数据（auth、settings、cache、logs、telemetry）
  以及**全部**由 oo 管理的 registry skills。
- 默认删除：受管可执行文件（`~/.local/bin/oo`）、所有已安装版本、self-update
  staging 与 locks、bundled skills，以及 preset registry skill 包
  `@alwaysmavs/gpt-image-2`（host 安装与 canonical source）。
- 默认保留：不动 PATH 配置；非 preset 的 registry skills、local skills、以及
  任何不受 oo 管理的同名目录都保留；用户数据仅在 `--purge` 时删除。
- skill 安全规则：仅当 `.oo-metadata.json` 能证明 oo 所有权（`kind: "bundled"`，
  或 `kind: "registry"` 且匹配 preset 列表 / `--purge`）时才删除。metadata 缺失、
  损坏、local 或不匹配的目录一律不删，因此用户手写的同名 skill 是安全的。
- 安装方式：当 `oo` 是通过包管理器（npm/bun/pnpm/yarn）安装时，命令会删除
  oo 管理的 skills，打印对应的 `npm uninstall -g @oomol-lab/oo-cli`（或等价）命令，
  并以非零状态退出，提示调用方二进制仍需手动删除。当可执行文件位于未知位置时，
  仅删除 oo 管理的 skills，并提示用户手动删除二进制。
- Windows：在 `oo uninstall` 运行期间无法删除的文件，会在进程退出后删除。其它被卸载
  计划选中的运行时路径、skills 和用户数据会在命令执行期间清理。Unix 上的清理会在命令
  执行期间完成。
- 安全：当检测到另一个运行中的 `oo` 进程时，命令会拒绝执行；且任何输出路径都不会把
  API key 等机密写入 stdout/stderr。

### `oo check-update`

检查是否有新的 CLI 版本可用。

- 说明：如果发现了新版本，CLI 会输出升级命令 `oo update`。
- 说明：如果当前版本已经是最新版本，CLI 会输出确认信息。
- 说明：如果遇到瞬时请求失败，CLI 会先自动重试两次。
- 说明：无论成功还是失败，检查结果都不会被缓存，因此每次执行都会重新检查
  最新发布版本。
- 说明：如果更新检查暂时不可用，CLI 会输出稍后重试的提示，而不是直接报错退出。
- 选项：`--format=json` 与 `--json` 切换到结构化 JSON 输出，形如：

  ```json
  { "status": "update-available", "currentVersion": "1.2.3", "latestVersion": "1.3.0" }
  ```

  ```json
  { "status": "up-to-date", "currentVersion": "1.2.3", "latestVersion": "1.2.3" }
  ```

  ```json
  { "status": "failed", "currentVersion": "1.2.3", "message": "Cannot reach update service." }
  ```

- 说明（JSON）：`status` 是稳定的机器可读枚举；`message` 是英文人类可读文本，
  脚本不应解析。`status` 为 `"failed"` 时仍以 0 退出，因为这是查询结果而非
  CLI 执行错误；脚本应通过 `status` 字段判断分支。参数错误（如 `--format xml`）
  仍以 2 退出。

### `oo version`

打印 CLI 版本。

- 说明：文本输出与 `oo --version` / `oo -V` 完全一致。当需要命令式调用（特别是
  配合 `--json` 给脚本消费）时使用 `oo version`。
- 选项：`--format=json` 与 `--json` 切换到结构化 JSON 输出。Payload 与文本输出
  使用同一份数据（version、build 时间、commit hash），方便调用方在两种格式
  间切换：

  ```json
  { "version": "1.2.3", "buildTime": "2026-05-26T00:00:00.000Z", "commit": "abc12345" }
  ```

  `buildTime` 为 ISO 8601 格式的构建时间戳；二进制构建时未嵌入构建时间戳
  时为 `null`。`commit` 为构建时记录的 git commit hash 前 8 个字符；未知时
  为 `null`。

## 环境

### `oo info`

打印 CLI 运行环境信息、本地持久化路径以及检测到的 skill 代理。

- 选项：`--format=json` 与 `--json` 用于切换到结构化 JSON 输出。
  不指定时，命令会输出带颜色的可读摘要。
- 输出（JSON）：返回一个对象，包含三个顶层字段：
  - `cli`：包含以下字符串字段：`version` 为当前 CLI 版本；
    `platform` 为 Node 风格的操作系统标识（如 `darwin`、`linux`、`win32`）；
    `arch` 为 Node 风格的架构标识（如 `arm64`、`x64`）；
    `storeDir` 为持久化存储根目录；`logDir` 为持久化 debug 日志目录；
    `authFile` 为认证文件路径；`settingsFile` 为配置文件路径。
  - `agents`：每个受支持的 skill 代理对应一项，结构为
    `{ id, skillDir, status }`。`id` 为稳定的代理标识（例如 `universal`、
    `claude`、`hermes` 等）；`skillDir` 为该代理对应的 skill 目录；
    `status` 取值为 `available`、`no_skills` 或 `not_installed` 三者之一。
    `available` 表示代理 home 目录与 skill 目录均存在；`no_skills` 表示
    代理 home 目录存在但 skill 目录尚未创建（例如 `oo` 还没有向该代理
    写入 skill）；`not_installed` 表示代理 home 目录本身不存在，`oo`
    暂时无法向其安装 skill。
  - `features`：保留字段，用于后续可选能力开关。当前始终返回空数组。

## Connector

### `oo connector search <text>`

使用自由文本搜索 connector action。

- 参数：`<text>` 为语义搜索文本。
- 选项：`--keywords <keywords>` 接收逗号分隔的关键词列表，去掉空项和重复项
  后发送。
- 选项：`--format=json` 和 `--json` 会输出匹配 action 条目的 JSON 数组。
- 输出：每条结果都会附加 `authenticated`。
- 输出：JSON 条目只包含稳定的 CLI 字段：`service`、`name`、`description`、
  `authenticated`。
- 输出：文本输出会为每个 action 打印一个块，包含 service/action 标识、可选
  描述和认证状态。
- 说明：使用 `oo connector schema "<service>" --action "<action>"` 查看选中
  action 的 contract。

### `oo connector schema <serviceName>`

显示一个 connector action 的稳定 schema contract。

- 参数：`<serviceName>` 为服务名。
- 选项：`-a, --action <action>` 用于指定 action 名称，且为必填。
- 选项：`--refresh` 会直接从 connector metadata API 获取最新 schema。
- 选项：`--json` 作为兼容性选项被接受，不会改变输出。
- 输出：命令默认输出 JSON 对象，包含稳定 CLI 字段 `service`、`name`、
  `description`、`inputSchema` 和 `outputSchema`。
- 说明：`--refresh` 会强制为选中的 action 重新获取 schema。

### `oo connector schema refresh`

清除所有本地缓存的 connector action schema。

- 参数：无。
- 输出：文本输出会打印一行成功信息。
- 说明：该命令不要求登录，也不会立即请求远端 metadata；后续
  `oo connector schema` 或 `oo connector run` 会在需要时重新获取并缓存
  schema。

### `oo connector run <serviceName>`

校验输入数据，并运行一个 connector action。

- 参数：`<serviceName>` 为服务名。
- 选项：`-a, --action <action>` 用于指定 action 名称，且为必填。
- 选项：`-d, --data <data>` 支持直接传入 JSON，或使用 `@路径` 读取 JSON 文件。
  `--input <data>` 是 `--data <data>` 的 alias。
- 选项：`--dry-run` 只做 payload 校验，不真正执行 action。
- 选项：`--wait` 会轮询选中的 action，直到进入终态。只有选中 action 的
  schema 声明了异步结果 lifecycle 时，这个选项才有效。
- 选项：`--wait-result` 会提交异步 submit action，然后轮询它配置的结果
  action。只有选中 action 的 schema 声明了异步 submit lifecycle 时，这个选项才有效。
- 选项：`--format=json` 和 `--json` 会输出 JSON 对象。
- 输出：非 dry-run 的 JSON 输出会保持稳定结构
  `{ data, meta: { executionId } }`。
- 输出：对于异步 submit action，默认输出 submit 结果，例如 handle 或
  session id；CLI 不会自动等待。
- 输出：使用 `--wait-result` 时，JSON 输出的 `data` 是完成后的结果，并包含
  `meta.pollAction`、`meta.pollCount`、`meta.submitExecutionId` 和 `meta.handle`。
- 输出：对于异步 result action，默认只执行一次 result action。使用
  `--wait` 时，JSON 输出的 `data` 是完成后的结果，并包含 `meta.pollCount`。
- 输出：dry-run 的 JSON 输出返回 `{ dryRun, ok }`。
- 错误：stderr 会打印 HTTP 状态；如果失败响应包含服务端 `message` 或
  `errorCode`，也会一并输出。
- 说明：命令会在执行前根据选中 action 的 contract 校验输入。
- 说明：text 模式下等待 async result action 时，交互式终端会在 stderr
  显示进度。JSON 输出不会混入进度文本。

## Search

### `oo search <text>`

使用一个自由文本查询搜索 connector action。

- 参数：`<text>` 为语义搜索文本。
- 选项：`--keywords <keywords>` 接收逗号分隔的关键词列表，去掉空项和重复项
  后发送。
- 选项：`--format=json` 和 `--json` 会输出匹配 action 条目的 JSON 数组。
- 输出：每条结果都会附加 `authenticated`。
- 输出：JSON 条目只包含稳定的 CLI 字段：`service`、`name`、`description`、
  `authenticated`。
- 输出：文本输出会为每个 action 打印一个块，包含 service/action 标识、可选
  描述和认证状态。
- 说明：使用 `oo connector schema "<service>" --action "<action>"` 获取完整
  connector action contract。

## AI Agent Skill

在执行具体命令前，`oo` 会为通用 `~/.agents` host（始终就绪，缺失时自动创建）
以及其他已经存在的受支持 Agent 目录静默同步 bundled 和 registry skills。

- 内置 skill：`oo` 会确保通用 `~/.agents` host 以及每个检测到的 Claude Code、
  Hermes、CodeBuddy、WorkBuddy、Trae、Trae CN、OpenClaw、QoderWork 和
  DeepSeek TUI Agent 都安装了 `oo`、`oo-find-skills`、`oo-create-skill` 与 `oo-publish-skill`。
  已经由 oo 管理的内置 skill 目标会刷新到当前 `oo` 版本；
  但当启动中的当前版本为 `0.0.0-development` 时，不会刷新已存在的内置 skill
  目标；已安装版本为 `0.0.0-development` 的内置 skill 目标也会保持不变。
- Registry skill：如果某个已发布 skill 已经有本地 canonical 副本
  `<config-dir>/skills/registry/<skill-id>`，`oo` 会把该副本发布到任何新检测
  到且尚未安装它的受支持 Agent。
- 本地 skill：agent-native local skill 不会在启动时同步。本地 skill 归属于创建它
  的 Agent skill 目录。
- 迁移：启动同步不会改写同版本的历史软链接目标。请用 `oo skills add` 刷新内置
  skill，用 `oo skills update` 刷新 registry skill，从而显式替换历史软链接。成功
  的 `oo install` / `oo update` 会运行这两个维护步骤。
- 安全规则：启动同步不会请求 registry，不要求登录，不会产生额外命令输出，也
  不会覆盖不由 `oo` 管理的同名目标。

### `oo skills info`

默认列出 bundled 和 registry skill。只有显式请求时才列出 local skill。为兼容
旧版用法，`oo skills list` 作为别名仍然可用。

- 选项：`--source <source>`、`-s <source>` 将列表过滤为一个来源：
  `bundled`、`registry` 或 `local`。
- 选项：`--agent <agent>` 将扫描范围限制为一个受支持 Agent：`universal`、
  `claude`、`hermes`、`codebuddy`、`workbuddy`、`trae`、`trae-cn`、
  `openclaw`、`qoderwork` 或 `deepseek-tui`。
- 选项：`--json` / `--format json` 以结构化 JSON 输出（详见下文）。
  `--show-schema-version`（仅在 JSON 模式下生效）会在 payload 顶层添加
  `schemaVersion` 字段；不带该 flag 时，payload 顶层直接从 `summary` 开始。
- managed 所有权规则：命令会扫描每个已存在的受支持本地 skill 根目录：
  `~/.agents/skills`、`~/.claude/skills`，
  以及 `${HERMES_HOME:-~/.hermes}/skills`、`~/.codebuddy/skills`、
  `~/.workbuddy/skills`、`~/.trae/skills`、`~/.trae-cn/skills`、
  `${OPENCLAW_HOME:-~/.openclaw}/skills`、`~/.qoderwork/skills`、
  `~/.deepseek/skills`。只保留 `.oo-metadata.json` 能识别为由 oo 管理的
  bundled、registry 或 local skill 的子目录。某个 Agent 目录中存在同名但
  没有 `.oo-metadata.json` 的子目录时，会作为匹配 managed skill 的
  `non-managed` host 出现，不会单独列出为顶层 skill。
- local 来源规则：`--source local` 会列出 Agent skill 目录中的 oo-managed local
  skill。`--source local --agent <agent>` 只列出该 Agent 的 local skill。
- 身份规则：顶层 skill 的身份是 `kind + name + packageName`。不同 Agent 上
  的版本差异不会拆分成多条 skill；JSON 输出会在 `hosts[].version` 中反映
  每个 host 的实际版本。
- 排序：bundled skills 会排在最前面；其中 `oo` 优先，其次
  `oo-find-skills`，再其次 `oo-create-skill`，再其次 `oo-publish-skill`；其余
  skill 按名称排序。Host 顺序按 `Universal`、`Claude Code`、
  `Hermes`、`CodeBuddy`、`WorkBuddy`、`Trae`、`Trae CN`、`OpenClaw`、
  `QoderWork`、`DeepSeek TUI` 显示。
- 文本输出：先打印摘要行，再为每个可见 skill 打印一个块，块内逐行列出每个
  host 的 Agent、安装状态以及 `controlState`（见下）。**文本输出不会打印任
  何本地路径或源路径**；如需机器可读细节请使用 JSON 输出。
- `controlState` 取值（每个 host 独立）：
  - `controlled` —— host 目录由 oo 管理，且内容与 canonical 源一致。
  - `modified` —— host 目录由 oo 管理，但内容已在本地被修改。
  - `non-managed` —— host 目录与某个 oo-managed skill 同名，但自身没有
    `.oo-metadata.json`。
  - `unknown` —— metadata 解析失败、源路径不可用，或目录内容对比失败。

#### JSON 输出

带 `--json` 或 `--format json` 时，命令向 stdout 写入一行 JSON。带
`--show-schema-version` 时顶层会前置 `"schemaVersion": "1.0.0"` 字段。

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

字段语义：

- `summary` **始终反映全量 inventory**，不受 `--source` / `--agent` 过滤影响。
  即使 `skills` 视图被过滤了，也能从 `summary` 看到全部数量。
- `skills` 反映当前过滤后的视图。默认不包含 local skill（与旧版
  `oo skills list` 行为一致），需要时传 `--source local` 查看。
- `skills[].packageName` 对 bundled 和 local skill 为 `null`。bundled
  skill 并非通过 registry 包分发，因此 JSON 中不发明虚构 `packageName`；
  文本输出仍使用 `<internal>` / `<local>` 作为人类可读的占位符。
- `skills[].version` 是顶层版本。当同一 skill 在不同 host 上版本不同时，
  顶层仍是一条 entry，每个 host 的实际版本通过 `hosts[].version` 体现。
- `hosts[].status` 当前固定为 `"installed"`，字段保留以备未来扩展。
- `hosts[].sourcePath` 对 bundled 和 registry skill 是 canonical 源路径；
  对 local skill 与 non-managed host entry 为 `null`。

### `oo skills locate <skill-id>`

输出已安装 skill 的本地路径。

- 参数：`<skill-id>` 是要在受支持 skill 根目录下定位的目录名。路径形式的值会被拒绝；
  如需传路径，请直接传给 `oo skills publish`。
- 选项：`--agent <agent>` 将扫描范围限制为一个受支持 Agent：`universal`、
  `claude`、`hermes`、`codebuddy`、`workbuddy`、`trae`、`trae-cn`、
  `openclaw`、`qoderwork` 或 `deepseek-tui`。
- 解析：传入 `--agent` 时，命令只检查该 Agent 的
  `<agent-home>/skills/<skill-id>`。未传入 `--agent` 时，命令会检查所有可用的受
  支持 Agent skill 根目录，以及 `<config-dir>/skills/registry/<skill-id>` 下的
  canonical registry 存储。
- 匹配规则：候选目录只要包含 `SKILL.md` 就视为匹配。命令不会校验 skill
  frontmatter 或 `.oo-metadata.json`；这些校验由 publish 负责。
- 输出：恰好匹配一个候选时，stdout 输出该路径并换行。没有候选或匹配多个候选时，
  命令以非零状态退出。歧义错误会列出候选路径，并提示调用方传入 `--agent` 或直接
  发布某个路径。

### `oo skills preflight`

检查当前环境是否有权限为一个 Agent 创建本地 skills。

- 选项：`--agent <agent>` 为必填项，并选择一个受支持 Agent：`universal`、
  `claude`、`hermes`、`codebuddy`、`workbuddy`、`trae`、`trae-cn`、
  `openclaw`、`qoderwork` 或 `deepseek-tui`。
- Agent 检查：所选 Agent home 目录必须存在。
- 存储检查：命令会在需要时创建所选 Agent 的 skills 根目录（如
  `<agent-home>/skills`），并在其中写入再移除临时探针文件。
- 输出：成功时，文本输出会打印可写存储路径和已检查的受支持 Agent 数量。失败时
  命令以非零状态退出。成功的 Agent 检查数量为 `1`。

### `oo skills init <name>`

在所选 Agent 自己的 skill 目录中初始化一个本地 skill。

- 参数：`<name>` 会规范化为小写短横线格式，并用作 skill id、目标目录名以及
  frontmatter `name`。
- 选项：`--agent <agent>` 为必填项，并选择要写入的 Agent skill 目录。可选值为
  `universal`、`claude`、`hermes`、`codebuddy`、`workbuddy`、`trae`、
  `trae-cn`、`openclaw`、`qoderwork` 和 `deepseek-tui`。
- 选项：`--description <text>` 为必填项，并写入生成的 `SKILL.md`
  frontmatter description。
- 生成的 `SKILL.md` frontmatter 包含 `compatibility: "Requires the oo CLI."`。
- 生成的 `SKILL.md` 正文包含受管理的 oo 执行说明，以及用于描述适用场景、输入、
  执行、结果处理和失败处理的可编辑占位章节。
- 元数据：创建出的 skill 目录会包含 `.oo-metadata.json`，用于标记该 skill 是由
  `oo` 管理的 local skill。
- 选项：`--icon <icon>` 将非空 icon 引用写入生成的 `SKILL.md` frontmatter
  `metadata.icon`。值可以是 emoji、图片 URL，或 `:collection:icon:` 格式，
  其中 `collection` 和 `icon` 是 <https://icones.js.org/> 上的名称。
- 选项：`--title <title>` 将 `metadata.title` 写入生成的 `SKILL.md`
  frontmatter。未提供时不会生成 `metadata.title`。
- 目标目录：skill 会创建在所选 Agent 的 `<agent-home>/skills/<skill-id>`。
- 发布方式：命令不会把新的 local skill 复制到其他 Agent。
- 失败行为：如果所选 Agent home 不存在，或目标目录已经存在，命令会在写入 skill
  前以非零状态退出。
- 输出：文本输出会打印已初始化的 skill id 和目标路径。

### `oo skills validate <path>`

按照通用 skill 契约校验本地 skill 目录。

- 参数：`<path>` 是包含 `SKILL.md` 的 skill 目录。
- 校验：`SKILL.md` frontmatter 必须是字典，并包含字符串 `name` 和非空字符串
  `description` 字段。
- 校验：嵌套的 `metadata` 可以省略；如果提供，则必须是字典。嵌套的
  `metadata.icon` 和 `metadata.title` 可以省略；如果提供，则必须是非空字符串。
- 警告：缺少 `metadata.icon` 或 `metadata.title` 会打印 warning，但不会导致校验失败。
- 输出：成功时命令会打印简短成功消息。失败时打印校验错误并以非零状态退出。

### `oo skills publish <path>`

将一个 skill 转换为 OOMOL 包，并执行发布步骤。

- 参数：`<path>` 必须是包含 `SKILL.md` 的 skill 目录，或 `SKILL.md` 文件本身。
  相对路径会从当前工作目录解析。该命令不解析裸 skill id；需要时请先使用
  `oo skills locate <skill-id>`。
- 选项：`--visibility <visibility>` 设置 registry 包可见性。可选值为
  `private` 和 `public`。省略时，已有包会沿用当前 registry 可见性。如果无法读取
  已有可见性，交互式终端会询问发布为 `private` 还是 `public`。
- 选项：`-y, --yes` 会对发布过程中的确认提示自动回答 yes。
- 选项：`--force` 为兼容旧流程保留。
- 来源解析：`.oo-metadata.json` 决定该路径是 oo-managed local skill、
  oo-managed registry skill，还是 unmanaged path 来源。无效的 oo metadata 会在发布
  前失败。内置 skill 会被拒绝发布，因为它们由 oo CLI 版本管理。
- Registry 来源解析：如果路径的 registry metadata 中包含带 scope 的包名，命令会
  使用该包名作为目标。如果没有可用的带 scope 包名，且已安装元数据中的包名和目标包
  名不同，命令会使用交互式 `[y/N]` 确认，再将它发布到当前账号 scope 下；提供
  `-y, --yes` 时会跳过该确认。
- 认证：命令要求存在当前 OOMOL 账号。如果来源已有带 scope 的
  `metadata.packageName`，会保留该包名；否则包名为
  `@<小写 account.name>/<小写 skill-id>`。
- 校验：源目录必须包含 `SKILL.md`，其 frontmatter `name` 必须匹配
  `<skill-id>`，并且 `description` 必须是非空字符串。可选的
  `metadata.title`、`metadata.icon`、`metadata.packageName` 和
  `metadata.version` 提供时必须是非空字符串，且 `metadata.version` 必须是
  semver。
- 包元数据：缺少 `metadata.title` 时，会从 `<skill-id>` 生成标题。缺少
  `metadata.version` 时，默认使用 `0.0.1`。
- 包内容：skill 目录中的 `.gitignore` 决定哪些本地文件不会进入发布包。如果
  skill 没有 `.gitignore`，则使用内置的包模板规则。打包时会拒绝符号链接。
  `.oo-metadata.json` 永远不会进入发布包。
- Registry 安全检查：发布前，命令会查询远端 latest 包元数据。如果远端包已经
  包含 blocks，交互式终端会按既有 `[y/N]` 确认风格询问是否继续。回答 no、
  直接回车，或在没有交互式 stdin 的环境中运行，都会在转换、PUT 和本地 metadata
  回写前停止；提供 `-y, --yes` 时会跳过该确认。
- 可见性解析：显式传入 `--visibility` 时使用该值。未传入时，如果 latest 远端包
  是 `public`，继续以公开包发布；如果是 private/restricted，则继续以私有包发布。
  如果 latest 包元数据不存在或不包含可见性，命令会询问 `private` 或 `public`；
  非交互式运行必须传入 `--visibility`。
- 版本解析：如果请求版本不大于远端 latest 包版本，命令会发布下一个 patch 版本。
- 回写：发布步骤成功后，命令会把最终的 `metadata.packageName` 和
  `metadata.version` 写回 `SKILL.md` frontmatter。
- Registry 回写：发布 oo-managed registry skill 后，命令会更新 registry 所有权
  metadata。如果来源路径不是 canonical registry 存储，会先用已发布来源替换
  `<config-dir>/skills/registry/<skill-id>`，然后将 canonical 存储复制到每个可用的
  受支持 Agent。即使没有可用的受支持 Agent home，发布和 canonical 回写仍会成功。
- 输出：成功时，文本输出会打印 skill id、最终包标识、所选可见性（`private`
  或 `public`）以及当前账号 endpoint 对应的 Hub 包页面 URL，例如生产账号使用
  `https://hub.oomol.com/package/<packageName>`。失败时命令以非零状态退出，并保持
  `SKILL.md` 不变。

### `oo skills share [skill]`

分享已发布的 skill package，确认要分享的具体 skill，并输出一段可复制给其他用户的
提示词。公开包会直接分享；private 或 restricted 包会通过临时 registry share id
分享。

- 参数：`[skill]` 在交互式终端中可省略。它可以是本地 skill id、已安装 registry
  skill id、包含 `SKILL.md` 的 skill 目录路径，或 package 名称。省略时，命令会
  询问要分享的 skill id、package 名称或路径。
- 选项：`--downloads <downloads>` 会限制私有包临时分享的安装次数。省略时不限制。
  非数字会报错；不是正安全整数的数字会退回默认的不限制。
- 选项：`--days <days>` 会设置私有包临时分享天数。默认 `7` 天，最长 `7` 天。
  非数字会报错；超出有效范围的数字会退回默认值 `7`。
- 选项：`-y, --yes` 会在命令解析出 skill id 和 package 名称后，跳过最终的
  `[y/N]` 确认。
- 解析：参数可以是 local skill id、已安装 registry skill id、skill 目录路径，
  或 package 名称。skill id 会优先按 local skill 解析，然后按已安装 registry
  skill 解析；看起来像路径的输入会按 skill 目录解析。如果无法解析为 skill 或路径，
  或解析出的 skill 没有关联 package，参数会被当作 package 名称。
- 包检查：命令会请求解析后 package 的 latest 元数据。公开包会在提示词中直接使用
  `<packageName>`；私有包会创建临时分享，并在提示词中显示分享 token，格式为
  `<packageName>#<shareID>`。缺少可见性元数据时按公开包处理；尚未发布的包会在输出
  分享提示词前被拒绝。
- 输出：成功时，文本输出会打印一个可复制的纯文本代码块，内部不会嵌套命令代码块。
  提示词语言会跟随当前 CLI 语言（`--lang en` 或 `--lang zh`）。提示词会说明该
  skill 或 package 已经发布，包含 package 名称、Hub URL，以及 skill 目标对应的
  skill id，并引用
  `https://static.oomol.com/oo-cli/skill-install-guide/install.md` 这份通用安装准备说明，
  然后给出最终安装命令。
  提示词会要求对方先按通用说明检查 OO CLI 和登录状态，再执行安装命令。对于 skill
  目标，公开包会给出
  `oo skills install <packageName> --skill <skill-id> -y`，私有包会给出
  `oo skills install <packageName>#<shareID> --skill <skill-id> -y`。对于
  package 目标，公开包会给出 `oo skills install <packageName> -y`，私有包会给出
  `oo skills install <packageName>#<shareID> -y`。私有包提示词会突出展示必须精确
  使用的临时安装标识 `<packageName>#<shareID>`，不会把分享目标描述为已公开发布。

### `oo skills search <text>`

使用自由文本搜索已发布的 skill。

- 别名：`oo skills find <text>`。
- 参数：`<text>` 会作为搜索文本发送到 skills search 服务。
- 选项：`--keywords <keywords>` 接收逗号分隔的关键词列表，去掉空项后以
  重复的 `keywords` 查询参数发送。
- 选项：`--format=json` 和 `--json` 会输出匹配 skill 条目的 JSON 数组。
- 输出：JSON 条目只包含稳定的 CLI 字段：`description`、`name`、
  `packageName`、`packageVersion`、`skillDisplayName`；不会暴露服务端专有字段。
- 输出：文本输出会为每个 skill 打印一个块，包含标题或名称、可选描述，以及
  在可用时显示来源包标识。
- 说明：每次调用最多请求 `5` 条结果。

### `oo skills install [packageName]`

将内置或已发布 skill 安装到受支持的本地 skill 目录。

- 别名：`oo skills add [packageName]`。
- 参数：`[packageName]` 可选。
- 参数：未提供时，该命令会安装全部内置 skill，然后尽力安装预设 registry
  skill packages 里的全部 skill。
- 参数：当 `[packageName]` 为 `oo`、`oo-find-skills`、`oo-create-skill` 或
  `oo-publish-skill` 时，命令安装对应的内置 skill。
- 参数：当 `[packageName]` 为已发布 package 名称时，命令从该 package 中
  安装 skill。`[packageName]` 可以包含显式版本，格式为
  `<packageName>@<version>`，也支持 `@scope/name@1.2.3` 这类 scoped package
  形式。
- 参数：`[packageName]` 也可以使用 `<packageName>#<shareID>`。这种形式会从
  `<packageName>` 读取 package 的 skill 列表，并通过 `<shareID>` 对应的 share
  下载 package 归档。
- 选项：`-s, --skill <skills...>` 用于安装 package 中一个或多个指定的
  skill。
- 选项：`-s, --skill '*'` 用于安装该 package 中全部已发布 skill。
- 选项：`--all` 是安装全部已发布 skill 的快捷方式，并跳过 skill 选择提示。
- 选项：`-y, --yes` 用于跳过确认提示。当 package 下有多个 skill 且未显式
  提供 `--skill` 时，`-y` 会安装全部 skill。
- 选项：`-f, --force` 在目标目录存在同名 skill 但**不受 oo 管理**（缺少可读
  `.oo-metadata.json`）时，允许覆盖安装。覆盖会先移除原目录内容再写入新
  skill，并以 `warn` 日志记录此事件。`--force` **不会**绕过路径校验、
  package 校验、auth 或下载校验；**不影响**启动自动同步、`oo skills update`、
  `oo skills sync`、`oo skills uninstall`、`oo skills publish`；多 skill
  package 下也**不**会因此隐式选中全部 skill（如需可配合 `--skill` 或
  `--all -y` 使用）。
- 输出：非交互安装成功时，会按已安装 skill 和目标 AI Agent 聚合输出精简摘要；
  当实际只写入一个目标时，摘要会包含该目标路径。
- 输出：未提供 `[packageName]` 且有预设 registry skills 安装成功时，这些
  skill 名称会合并到同一份 `Installed ...` 摘要和 `Skills:` 列表里。
- 说明：如果 package 只发布了一个 skill，且未提供 `--skill`，命令会自动
  安装这个唯一的 skill。
- 说明：预设 registry skill package 安装失败会被忽略，不改变命令结果。
- 说明：如果 package 发布了多个 skill，且未提供 `--skill`、`--all` 或
  `-y`，命令会在 TTY 中打开交互选择页面。
- 说明：在交互选择页面中，同一 package 下已安装的 skill 会默认保持勾选；
  如果用户取消这些勾选，命令完成时会移除对应已安装 skill。
- canonical 目录：内置 skill 会先释放到
  `<config-dir>/skills/bundled/<agent>/<skill-id>`，其中 `<config-dir>` 是
  `settings.toml` 所在目录，`<agent>` 为 `universal`、`claude`、
  `hermes`、`codebuddy`、`workbuddy`、`trae`、`trae-cn`、`openclaw`、
  `qoderwork` 或 `deepseek-tui`。
- canonical 目录：已发布 skill 会先释放到
  `<config-dir>/skills/registry/<skill-id>`。
- 迁移：升级后首次运行 `oo skills install` 时，命令会清理历史遗留的 canonical
  目录（`claude-skills/`、`openclaw-skills/`，以及直接位于 `skills/` 下的旧
  内置 / 已发布 skill 目录）。内置 skill 会自动以新布局重建；之前安装
  的已发布 skill 需要通过 `oo skills install <packageName>` 重新安装。
- 目标目录：内置和已发布 skill 会发布到通用 `~/.agents` host（缺失时自动创建）
  以及其他所有已存在的受支持 Agent 目录，目前包括
  `~/.agents/skills/<skill-id>`
  和 `~/.claude/skills/<skill-id>`，以及
  `${HERMES_HOME:-~/.hermes}/skills/<skill-id>`、
  `~/.codebuddy/skills/<skill-id>`、
  `~/.workbuddy/skills/<skill-id>`、
  `~/.trae/skills/<skill-id>`、
  `~/.trae-cn/skills/<skill-id>`、
  `${OPENCLAW_HOME:-~/.openclaw}/skills/<skill-id>`、
  `~/.qoderwork/skills/<skill-id>`、
  `~/.deepseek/skills/<skill-id>`。
- 目标目录：当已存在的受支持 Agent 缺少 `skills` 根目录时，命令会先创建该目录，
  再发布所选 skill。
- 安装方式：内置和已发布 skill 会复制到每个目标 skills 目录。旧版本留下的
  oo-managed 软链接目标，会在显式安装、刷新或更新该 skill 时替换为复制目录。
- 元数据：新写入的 bundled 和 registry skill 都会包含隐藏的
  `.oo-metadata.json` 文件，记录 oo 来源标记和 schema version。bundled metadata
  记录当前 `oo` 版本；registry metadata 记录来源 package 与 package 版本。已有的
  legacy bundled 和 registry metadata 仍可读取。
- 说明：安装已发布 skill 时，所有 registry 请求都会携带当前激活账号的
  `Authorization` header。
- 说明：如果 package 下有多个 skill，且当前不是交互终端，则必须提供
  `--skill <name>` 或 `--all -y`。
- 说明：如果显式安装的已发布 skill 与现有同名 skill 冲突，命令会在交互终
  端中要求用户输入 `yes` 或 `no` 决定是否覆盖。
- 说明：如果目标目录已存在但没有有效的 `oo` 元数据，会被视为非 OOMOL
  skill，命令不会覆盖它。
- 说明：在交互选择页面中，存在重名冲突的 skill 会在列表中显示状态标记；
  只要用户仍然选择该项，就会执行覆盖。
- 说明：通用 `~/.agents` host 始终可用（缺失时自动创建），因此命令始终至少有一个安装目标。
- 说明：只有当 bundled 或 registry skill 的 `.oo-metadata.json` 能识别对应来源
  时，`oo` 才会认为这是自己管理的安装；否则会视为其他 skill，并拒绝覆盖。
- 选项：`--json` / `--format json` 输出结构化 payload（见下方"mutation 命令的
  JSON 输出"）。
- `error.code` 枚举（install JSON）：`not_authenticated` / `no_supported_hosts`
  / `invalid_path` / `invalid_package_specifier` / `package_lookup_failed`
  / `package_download_failed` / `invalid_package_archive`
  / `skill_not_found_in_package` / `name_conflict` / `storage_conflict`
  / `confirmation_required` / `publication_failed` / `unknown`。
- 当指定 `--json` 时，命令自动进入非交互模式：若多 skill package 未提供
  `--skill` / `--all` / `--yes`，会返回顶层 `confirmation_required` 错误并以
  exit 1 退出。
- `targets[].previousState` 取值为 `absent | managed | unmanaged | unknown`。
  当 `--force` 覆盖一个非受管目录时，target 仍报告为 `installed`，但
  `previousState` 为 `"unmanaged"`。

### `oo skills sync upload`

将已安装且由 oo 管理的 registry skill 上传到 skills sync 服务。

- 选项：`--source <source>` 选择同步来源。当前唯一支持的值为 `registry`；
  未提供时默认使用 `registry`。
- 选项：`-i, --ignore <patterns...>` 会按 `packageName` 或 skill 名称匹配并排除
  部分 registry skill。该选项可以重复使用，每个值也可以包含逗号分隔的多个模式。
  模式使用 gitignore 风格匹配。
- 范围：命令只上传 `.oo-metadata.json` 能识别 registry 所有权和包身份的已发布
  registry skill；bundled 和 local skill 永远不会被上传。
- 请求：命令会发送 `PUT https://api.<endpoint>/v1/skills`，请求体是
  `{ "packageName": string, "version": string, "skillName": string }` 的 JSON
  数组，并携带当前账号的 `Authorization` header。
- 行为：服务端清单会被覆盖；如果过滤后没有 registry skill，也会上传空数组。
- 输出：成功时，文本输出会显示已上传的 registry skill 数量。
- 选项：`--json` / `--format json` 输出结构化 payload。与其它 mutation 命令不
  同，`oo skills sync upload --json` 顶层使用 `records[]` 而不是
  `skills[]` / `targets[]`，因为操作单位是 sync record，不是本地 agent target。
  payload 仍包含 `command` / `status` / `summary` / `errors[]`。
- `error.code` 枚举（sync upload JSON）：`not_authenticated` /
  `no_supported_hosts` / `sync_upload_failed` / `sync_invalid_response` /
  `unknown`。
- 行为：上传请求失败时，JSON payload 仍包含本来准备上传的 `records[]`，命令以
  exit 1 退出。

### `oo skills sync apply`

将已上传且由 oo 管理的 registry skill 安装到受支持的本地 skill 目录。

- 别名：`oo skills sync download`、`oo skills sync install`。
- 选项：`--source <source>` 选择同步来源。当前唯一支持的值为 `registry`；
  未提供时默认使用 `registry`。
- 请求：命令会读取 `GET https://api.<endpoint>/v1/skills`，并携带当前账号的
  `Authorization` header。
- 行为：每条已上传记录都会按记录中的 `packageName` 和 `version` 安装，并且只从该
  package 中选择记录里的 `skillName`。
- 范围：该命令只应用 registry skill。bundled 和 local skill 永远不会通过该命令恢复。
- 输出：当已上传清单为空时，文本输出会提示未找到已上传的 registry skill。否则会先
  输出常规安装摘要，再输出最终应用数量。
- 选项：`--json` / `--format json` 输出结构化 payload，顶层使用 `skills[]`，每
  条已应用记录占一项。单条记录的安装 / 查询失败放在
  `skills[].status = "failed"` 并带稳定 `error.code`；只有 sync 协议层失败
  （manifest 下载、响应 schema）才进入顶层 `errors[]`。
- `error.code` 枚举（sync apply JSON）：`not_authenticated` /
  `no_supported_hosts` / `invalid_path` / `package_lookup_failed` /
  `package_download_failed` / `invalid_package_archive` /
  `publication_failed` / `sync_download_failed` / `sync_invalid_response` /
  `unknown`。

### `oo skills update [skills...]`

更新已安装且由 oo 管理的已发布 skill。

- 参数：省略时，会检查所有已安装且由 oo 管理的已发布 skill。
- 参数：提供一个或多个 skill 名称时，只会检查并更新这些指定 skill。
- 内置 skill：bundled `oo`、`oo-find-skills`、`oo-create-skill`、
  `oo-publish-skill` 等内置 skill 不在此命令处理范围内。请使用
  `oo skills add` 刷新，或让成功的 `oo install` / `oo update` 自动刷新它们。
- 所有权规则：只有当 skill 的 `.oo-metadata.json` 能识别 registry 所有权和包身份
  时，update 才会认为它由 oo 管理；bundled 和 local metadata 会被该命令忽略。
- 已发布 skill：registry skill 会从 `.oo-metadata.json` 读取所属包名，再通过
  不带显式版本的 package info 请求判断最新可用版本。
- 更新顺序：命令会先刷新 canonical 目录
  `<config-dir>/skills/registry/<skill-id>`，再同步到所有已存在的受支持 Agent 目录。
- 交互式终端：会显示实时进度。
- 非交互式终端：对每个已是最新或失败的 skill 输出一行状态信息；对每个已更新
  的 Agent 目标路径输出一行成功信息。
- 选项：`--json` / `--format json` 输出结构化 payload（见下方"mutation 命令的
  JSON 输出"）。
- `skills[].status`（update JSON）：`updated | repaired | current | failed`。
  - `updated`：至少一个 host 版本号已升级。
  - `repaired`：版本号未变，但有 host 的 publication 被重写（legacy symlink、
    metadata 漂移等）。
  - `current`：所有 host 无需写入。
- `error.code` 枚举（update JSON）：`not_authenticated` / `no_supported_hosts`
  / `invalid_path` / `not_installed` / `not_managed` / `bundled_unsupported`
  / `package_lookup_failed` / `package_download_failed` /
  `invalid_package_archive` / `publication_failed` / `unknown`。

### `oo skills check-update`

检查由 oo 管理的 registry skill 是否有新版本，或本地内容是否已偏离 canonical。
**只查询，不下载 package archive，不写入任何 skill 目录**。

- 选项：`--skill <name>` 限定要检查的 skill id，可重复传入。重复值会去重，
  输出按原始输入顺序。
- 选项：`--format=json` 与 `--json` 切换到结构化 JSON 输出。
  `--show-schema-version`（仅在 JSON 模式下生效）会向 payload 顶层添加
  `schemaVersion`。
- 范围：只检查 `kind=registry` 的 skill。bundled skill、未安装的 skill 名、
  或非 registry metadata 的 skill 目录都会作为 `failed` entry 上报，并带
  稳定的 `error.code`。
- 网络：需要登录 OOMOL 账号，因为命令会请求 registry 的 package-info 接口
  获取最新版本号；**不会**下载 package tarball。
- JSON 形态：

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

- `status` 取值：
  - `update-available` —— registry 最新版本高于已安装版本；`oo skills update`
    会升级。
  - `up-to-date` —— 已安装版本与 registry 最新版本一致，且所有 host 目录
    与 canonical 内容一致。
  - `repair-required` —— 已安装版本与 registry 最新版本一致，但 host
    publication 与 canonical 布局发生了 `oo skills update` 会重写的偏离：
    具体而言是 host 目录变成了 legacy symlink（不是真实拷贝），或者其
    `.oo-metadata.json` 记录的 package/version 与 canonical metadata 不
    一致。**host 文件内容级的修改不会在此命令中检测到**；如需检查内容
    drift，请用 `oo skills info --json` 查看 host 的 `controlState`。
  - `failed` —— 该 skill 无法完成检查；entry 含 `error.code`（机器可读枚举）
    与 `error.message`（英文模板）。
- 退出码：即使 entry 含 `failed`，命令仍以 0 退出（失败由 payload 字段表达）。
  参数错误（如 `--format xml`）仍以 2 退出。
- `error.code` 枚举：`not_installed` / `not_managed` / `invalid_path` /
  `bundled_unsupported` / `package_lookup_failed` / `unknown`。

#### mutation 命令的 JSON 输出

`oo skills install`、`oo skills uninstall`、`oo skills update`、
`oo skills sync apply` 共享一套 JSON envelope：

```json
{
  "command": "skills.install",
  "status": "completed",
  "summary": { /* 每条命令各自的计数 */ },
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

`oo skills sync upload` 使用 `records[]` 而非 `skills[]` / `targets[]`，因为
操作单位是 sync record，而不是 agent target。

通用规则：

- `command` 为 `skills.install` / `skills.uninstall` / `skills.update` /
  `skills.sync.upload` / `skills.sync.apply` 之一。
- `status` 为 `completed` / `partial-failure` / `failed` / `noop`。
- `targets[]` 是每个 Agent 的结果。`uninstall` / `update` 通常会填
  `previousVersion`；`install` 通常使用 `previousState`。
- `error.message` 是固定英文模板，不做 i18n。
- `--show-schema-version` 会在 payload 顶层添加 `schemaVersion`。
- 参数错误（如 `--format xml`）仍以 exit 2 退出，不输出 JSON。其它失败仍输出
  JSON payload，并以 exit 1 退出。
- JSON 输出永远不会包含 `apiKey`、原始 HTTP 请求 / 响应体、stack trace 或未
  脱敏的 endpoint secret。

### `oo skills uninstall [skill]`

从受支持的本地 skill 目录移除由 oo 管理的 skill。

- 别名：`oo skills remove [skill]`。
- 参数：省略 `[skill]` 时，命令会移除全部内置 skill。
- 选项：`--agent <agent>` 将 local skill 删除限制到一个受支持 Agent，用于消除
  多个 Agent 中存在同名 local skill 时的歧义。
- 参数：提供 `[skill]` 时，命令会同时检查已发布的 registry 安装和 agent-native
  local skill；如果两者都匹配同一个名称，会同时移除。registry 安装会先于本地安装
  移除。
- 所有权规则：对内置 skill 来说，只有当某个受支持 Agent 中的安装目录包含能识别
  bundled 所有权的 `.oo-metadata.json` 时，才允许从该 Agent 移除。
- 所有权规则：local skill 目录包含能识别 local 所有权的 `.oo-metadata.json` 时，
  才可被视为可移除。
- local 歧义：未提供 `--agent` 且存在多个同名 agent-native local skill 时，命令会
  打印错误、以非零状态退出，并且不会删除任何 local skill。如果只匹配到一个 local
  skill，则会删除它。
- 会同时移除 canonical 目录：内置 skill 会移除
  `<config-dir>/skills/bundled/<agent>/<skill>`（每个已安装 Agent 各一份），已发布
  skill 会移除 `<config-dir>/skills/registry/<skill>`。
- 会同时移除目标目录：内置和已发布 skill 会从所有已存在的受支持 Agent 目录中移除，
  目前包括 `~/.agents/skills/<skill>`
  和 `~/.claude/skills/<skill>`，以及
  `${HERMES_HOME:-~/.hermes}/skills/<skill>`、
  `~/.codebuddy/skills/<skill>`、
  `~/.workbuddy/skills/<skill>`、
  `~/.trae/skills/<skill>`、
  `~/.trae-cn/skills/<skill>`、
  `${OPENCLAW_HOME:-~/.openclaw}/skills/<skill>`、
  `~/.qoderwork/skills/<skill>`、
  `~/.deepseek/skills/<skill>`。local skill 只移除所选 agent-native local 目录。
- 路径规则：`[skill]` 解析后必须仍然落在这些本地 `skills` 根目录的子目录中。
  任何会逃出这些根目录的名称都会被拒绝。
- 说明：如果请求的 skill 在任何受支持目标中都不存在受管理安装，且不存在同名
  agent-native local skill，或某个已存在的同名目标不是由 `oo` 管理，命令会直接报错。
- 选项：`--json` / `--format json` 输出结构化 payload（见上方"mutation 命令的
  JSON 输出"）。
- `skills[].status`（uninstall JSON）：`removed | failed`。`targets[].status`：
  `removed | absent | unmanaged | failed`。
- `error.code` 枚举（uninstall JSON）：`no_supported_hosts` / `invalid_path`
  / `not_installed` / `not_managed` / `ambiguous_local_skill` /
  `remove_failed` / `unknown`。
- 行为：当未传 `[skill]` 时，`--json` 与文本输出范围一致——只卸载 bundled
  skill，registry / local 不动。

### `oo skills repair`

从可信 source 强制将一个或多个由 oo 管理的 skill 重新部署到一个或多个 Agent
的 skill 目录，无论目标目录当前内容如何都直接覆盖。

这**不是** `oo skills update`：命令不会联网，不会拉取 registry 的新版本，也
不会改变已安装 skill 记录的 package/version。它只是用本机已有的可信 source
重写 Agent 副本。

- 选项：`--skill <skill>` 必填，可重复传入以同时修复多个 skill。输入会去重并
  保留原顺序。
- 选项：`--agent <agent>` 可重复传入以指定目标 Agent。缺省时目标为**所有当前
  可用的受支持 Agent**（与 `oo skills install` 默认范围一致）。输入会去重。
- 选项：`--json` / `--format json` 输出结构化 payload（见下文）。
  `--show-schema-version` 仅在 JSON 模式下生效，向 payload 顶层添加
  `schemaVersion`。
- Source 判定顺序：
  - 如果 `<skill>` 是内置 skill 名（`oo`、`oo-find-skills`、
    `oo-create-skill`、`oo-publish-skill`），命令会从 CLI 内嵌资源**重新
    materialize** 该 Agent 的 bundled canonical source，然后发布到目标 Agent。
    因此对 bundled skill 的 repair **会同时**刷新
    `<config-dir>/skills/bundled/<agent>/<skill>` 下的 canonical。
  - 否则检查 `<config-dir>/skills/registry/<skill>` 是否存在合法的 registry
    metadata。如果存在，命令把 canonical registry source 发布到目标 Agent；
    **不**刷新 canonical registry 目录。
  - 如果 skill 仅在某个 Agent 的 `skills` 目录里以 local skill 形式存在，命令
    报 `errors.skills.repair.localUnsupported`；`repair` 不跨 Agent 复制
    local skill。
  - 既不是 bundled 也没有合法 registry canonical 时，对应的
    `(skill, agent)` 组合作为 per-pair failure 输出，`error.code` 为
    `source_not_found`，命令不会从某个 host 的已安装目录反推 source。
- 覆盖语义：无论目标 host 目录当前是 managed、被本地修改、metadata 损坏、还是
  同名 unmanaged 目录，都会被重写。`repair` 自带 `--force` 语义，但作用域仅限
  解析出的 `(source, target agent, skill)` 精确组合。
- 安全边界：`repair` 不绕过路径包含检查、受支持 Agent 名校验、registry
  canonical metadata 校验、启动自动同步规则，也不影响 `oo skills add`、
  `oo skills update`、`oo skills sync`、`oo skills publish`、
  `oo skills uninstall` 的现有边界。
- Fail-soft 执行：每个 `(skill, agent)` 组合独立尝试。任一组合失败时其它组合
  继续执行，命令最后输出成功/失败汇总并以非 0 退出。
- 命令前置校验失败（不输出 JSON payload，按普通 CLI 错误退出）：
  - 缺少 `--skill` → `errors.skills.repair.skillRequired`
  - `--agent` 值不在受支持 Agent 列表 → 现有 `errors.skills.list.invalidAgent`
  - 显式 `--agent` 的 home 目录不存在 → `errors.skills.agentNotInstalled`
  - skill 仅以 local skill 形式存在 → `errors.skills.repair.localUnsupported`
- 文本输出：仅打印成功汇总、每个 skill 的目标 Agent 列表和失败原因，**永远不
  打印任何路径**。需要机器可读路径的消费者请使用 `--json`。

#### JSON 输出

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

`schemaVersion` 仅在传入 `--show-schema-version` 时出现。

`error.code` 是固定的机器可读枚举：

- `source_not_found`
- `source_invalid`
- `invalid_path`
- `write_failed`
- `unknown`

`error.message` 是脱敏过的模板文本，不包含 stack trace、原始 exception
message，也不会出现在 `path` / `sourcePath` 字段之外的额外文件系统路径。

## 日志

### `oo log path`

输出当前持久化 debug 日志目录路径。

### `oo log print`

输出某一份更早的持久化 debug 日志文件内容。

- 参数：`[index]` 可选，必须为大于等于 `1` 的整数。`1` 表示上一份日志，
  更大的值会在已保留日志中继续向前读取。
- 说明：当前这次 `oo log print` 调用也会生成自己的日志文件，因此命令会始终
  跳过本次运行对应的日志，读取更早的日志。

## 文件

### `oo file download <url> [outDir]`

从 `http` 或 `https` URL 下载单个文件并保存到本地。

- 参数：`<url>` 必填，且必须使用 `http` 或 `https` 协议。
- 参数：`[outDir]` 可选。未提供时，CLI 会优先使用已配置的
  `file.download.out_dir`，否则回落到 `~/Downloads`。不存在的目录会自动创建；
  如果该路径已存在但不是目录，则命令失败。
- 说明：`[outDir]` 和 `file.download.out_dir` 都可以 `~` 开头；此时会展开为
  当前用户的 home 目录。
- 选项：`--name <name>` 只覆盖保存文件的主体名。该值必须非空，不能是 `.`
  或 `..`，且不能包含路径分隔符。
- 选项：`--ext <ext>` 只覆盖保存文件的扩展名。该值可以带或不带前导 `.`,
  但必须非空，不能是 `.` 或 `..`，且不能包含路径分隔符。
- 说明：未显式提供 `--name` 或 `--ext` 时，CLI 会根据最终响应的元数据和
  URL 推断保存文件名。
- 说明：如果推断出的保存文件名对用户不友好或不可读，可以通过 `--name`
  指定更清晰的主体名，同时保留 CLI 推断出的扩展名。
- 说明：当自动推断命中已知复合扩展名（例如 `.tar.gz`、`.pkg.tar.zst`）
  时，CLI 会将其视为一个完整扩展名。
- 说明：下载过程会先在目标目录写入临时文件，只有传输完成后才会落成最终文件。
- 说明：每个进行中的下载都会在目标目录使用相互隔离的临时文件；同一 URL 和同一
  输出目录的并发下载不会互相合并或 append 对方的 partial 文件。
- 说明：如果下载在中途停止，重新执行同一条命令且输出目录不变时，CLI 会优先尝试
  使用 HTTP Range 续传；如果服务端无法安全续传，则会从 `0` 字节重新下载。
- 说明：续传 metadata 是 best-effort；如果本地 metadata 无法读写，当前下载仍可
  完成，但后续可能无法续传。
- 说明：如果最终目标路径已存在，CLI 不会覆盖它，而是会在完整扩展名前追加
  `_1`、`_2` 等序号。
- 说明：`oo file download` 不支持 `--format=json` 或 `--json`。
- 说明：成功时，`stdout` 会输出一行本地化的人类可读文本，其中包含最终落盘文件的
  绝对路径；如果 `stderr` 是 TTY，则会在其中输出人类可读的下载进度。

### `oo file upload <filePath>`

上传一个文件到临时文件缓存。

- 参数：`<filePath>` 为要上传的本地文件路径。
- 选项：`--format <format>` 返回结构化输出，目前仅支持 `json`。
- 选项：`--json` 是 `--format=json` 的别名。
- 说明：上传后的文件有效期为七天，到期后会由服务端删除。
- 说明：文件大小超过 `500 MiB` 时会被拒绝。
- 说明：上传成功后，CLI 会在本地 sqlite 中记录上传时间、文件名、文件大小、
  带签名的下载 URL、过期时间，以及一个 UUID v7 格式的主键。
- 说明：JSON 和文本输出中的 `downloadUrl` 会是 URI-safe 的带签名 URL；
  `fileName` 字段仍保留原始上传文件名。

### `oo file list`

查看本地 sqlite 中记录的历史上传文件。

- 选项：`--status <status>` 按有效状态过滤。支持的值：`active`、`expired`。
- 选项：`--limit <limit>` 限制返回数量，必须为大于等于 `1` 的整数。
- 选项：`--format <format>` 返回结构化输出，目前仅支持 `json`。
- 选项：`--json` 是 `--format=json` 的别名。
- 说明：命令不会隐式删除已过期记录。
- 说明：输出时会尽量规范化历史记录中的带签名下载 URL，同时保持 `fileName`
  不变。

### `oo file cleanup`

删除过期或陈旧的文件传输记录。

- 选项：`--format <format>` 返回结构化输出，目前仅支持 `json`。
- 选项：`--json` 是 `--format=json` 的别名。
- 说明：会删除满足 `expiresAt <= now` 的本地上传记录。
- 说明：超过 14 天且未被活跃下载进程占用的下载续传 session 会被删除。
- 说明：JSON 输出结构为 `{ "deletedCount": number }`。

## Variables

在 OOMOL 云端存取当前账号的具名字符串变量。别名：`oo variable`、`oo var`、
`oo vars`。所有子命令都需要当前账号；value 以字符串存储（如需存 JSON 请自行序列化）。

### `oo variables list`

列出当前账号的全部变量，按最近更新时间倒序（无分页；每个账号最多 200 个）。

- 文本输出：每行一个变量，只显示 `name` 和 `updatedAt`；不打印完整 value。读取
  value 请用 `oo variables get` 或 `--json`。
- 选项：`--format <format>` / `--json` 返回结构化输出
  `{ "variables": [{ "name", "value", "updatedAt" }] }`，包含完整 value。

### `oo variables get <name>`

读取变量的值。

- 参数：`<name>` 必填（1-256 个字符；不能包含 `/` 或控制字符）。
- 文本输出：原始 value，并追加换行。
- 选项：`--format <format>` / `--json` 返回 `{ "name", "value", "updatedAt" }`。
- 说明：变量不存在时以非零码退出。

### `oo variables create <name> [value]`（别名：`oo variables update`）

为当前账号创建或替换变量（last-write-wins）。`create` 与 `update` 完全等价。

- 参数：`<name>` 必填。`[value]` 为可选的位置参数值。
- value 来源：`[value]`、`--from-file <path>`、`--stdin` 三者必须且只能提供一个。
  允许空字符串。
- 选项：`--from-file <path>` 按 UTF-8 原文读取文件内容作为 value。
- 选项：`--stdin` 从标准输入读取到 EOF 作为 value（原文）；当 stdin 是交互式终端时报错。
- 选项：`--format <format>` / `--json` 返回 `{ "name", "value", "updatedAt" }`。
- 说明：value 上限为 64 KiB（65536 字节，UTF-8）。

### `oo variables delete <name>`

删除当前账号的变量。幂等：即使 name 不存在也成功。

- 参数：`<name>` 必填。
- 选项：`--json` 返回 `{ "name", "deleted": true }`。

## Shell 补全

### `oo completion <shell>`

生成 shell 补全脚本。

- 参数：`<shell>` 为目标 shell。支持的值：`bash`、`zsh`、`fish`。
