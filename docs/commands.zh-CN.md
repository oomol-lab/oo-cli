# oo 命令参考

[English](./commands.md) | [简体中文](./commands.zh-CN.md)

项目概览见 [README-ZH_CN.md](../README-ZH_CN.md)

## 全局选项

- `--debug`：在 CLI 退出时将当前日志文件路径输出到 `stderr`。
- `--lang <lang>`：为当前命令临时指定显示语言。支持的值：`en`、`zh`。
- `-h, --help`：显示当前命令的帮助信息。
- `-V, --version`：显示当前 CLI 版本、构建时间和 commit hash。

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

启动 device login 流程，或使用 session token 登录，并保存登录成功后的账号。

- 说明：未传入 `--session-token` 时，CLI 会打印验证地址和用户 code，然后轮询直到
  device login 验证成功或超时。
- 选项：
  - `--session-token <session-token>`：使用已有 session token 登录。传入后 CLI 不会
    打印 device-login URL，也不会轮询验证结果。

### `oo auth logout`

从持久化认证数据中移除当前账号。

### `oo auth status`

显示当前账号，并校验其 API key 状态。

### `oo auth switch`

切换到下一个已保存账号。

### `oo login`

`oo auth login` 的别名。支持相同的 `--session-token <session-token>` 选项。

### `oo logout`

`oo auth logout` 的别名。

## 配置

- 说明：如果持久化 settings 文件里存在未知 key，CLI 会忽略这些 key，并在
  debug 日志中写入 warning；已知 key 仍会按正常规则生效。

### `oo config list`

列出当前已经设置的持久化配置。

### `oo config get <key>`

读取一个持久化配置值。

- 参数：`<key>` 为配置键。目前支持
  `lang`、`file.download.out_dir`。

### `oo config path`

输出持久化配置文件路径。

### `oo config set <key> <value>`

写入一个持久化配置值。

- 参数：`<key>` 为配置键。目前支持
  `lang`、`file.download.out_dir`。
- 参数：`<value>` 为对应配置值。
- 取值规则：当 `<key>` 为 `lang` 时，支持的值为 `en` 和 `zh`。
- 取值规则：当 `<key>` 为 `file.download.out_dir` 时，支持任意非空路径字符串。
  相对路径会在执行 `oo file download` 时相对于当前工作目录解析；如果以 `~`
  开头，则会展开为当前用户的 home 目录。

### `oo config unset <key>`

删除一个持久化配置值。

- 参数：`<key>` 为配置键。目前支持
  `lang`、`file.download.out_dir`。

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
  `oo skills add`，让 bundled skills 刷新到已安装的 CLI 版本。
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
  刷新 bundled skills，再输出“已是最新版本”的消息。
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
  `oo skills add`，让 bundled skills 刷新到已安装的 CLI 版本。
- 说明：当当前版本为 `0.0.0-development` 时，CLI 会打印不支持托管 install /
  update 的提示，并以成功状态退出。

### `oo upgrade`

`oo update` 的别名。

### `oo check-update`

检查是否有新的 CLI 版本可用。

- 说明：如果发现了新版本，CLI 会输出升级命令 `oo update`。
- 说明：如果当前版本已经是最新版本，CLI 会输出确认信息。
- 说明：如果遇到瞬时请求失败，CLI 会先自动重试两次。
- 说明：无论成功还是失败，检查结果都不会被缓存，因此每次执行都会重新检查
  最新发布版本。
- 说明：如果更新检查暂时不可用，CLI 会输出稍后重试的提示，而不是直接报错退出。

## Connector

### `oo connector search <text>`

使用自由文本搜索 connector action。

- 参数：`<text>` 为语义搜索文本。
- 选项：`--keywords <keywords>` 接收逗号分隔的关键词列表，去掉空项和重复项
  后发送。
- 选项：`--format=json` 和 `--json` 会输出匹配 action 条目的 JSON 数组。
- 输出：每条结果都会附加 `authenticated` 和 `schemaPath`。
- 输出：JSON 条目只包含稳定的 CLI 字段：`service`、`name`、`description`、
  `authenticated`、`schemaPath`。
- 输出：文本输出会为每个 action 打印一个块，包含 service/action 标识、可选
  描述、认证状态和 schema cache 路径。
- 说明：命令会在本地缓存已发现的 action schema，并在输出中返回对应的缓存
  路径。

### `oo connector run <serviceName>`

校验输入数据，并同步运行一个 connector action。

- 参数：`<serviceName>` 为服务名。
- 选项：`-a, --action <action>` 用于指定 action 名称，且为必填。
- 选项：`-d, --data <data>` 支持直接传入 JSON，或使用 `@路径` 读取 JSON 文件。
- 选项：`--dry-run` 只做 payload 校验，不真正执行 action。
- 选项：`--format=json` 和 `--json` 会输出 JSON 对象。
- 输出：非 dry-run 的 JSON 输出会保持稳定结构
  `{ data, meta: { executionId } }`。
- 输出：dry-run 的 JSON 输出返回 `{ dryRun, ok, schemaPath }`。
- 错误：stderr 会打印 HTTP 状态；如果失败响应包含服务端 `message` 或
  `errorCode`，也会一并输出。
- 说明：如果本地 schema cache 不可用或无法使用，命令会自动刷新后再继续校验
  和运行。

## Search

### `oo search <text>`

使用一个自由文本查询同时搜索 package 与 connector action。

- 参数：`<text>` 会同时发送到两个搜索来源。
- 选项：`--keywords <keywords>` 会在搜索 connector action 时发送一个逗号分隔
  的关键词列表，并移除空项与重复项。
- 选项：`--format=json` 和 `--json` 会输出一个混合 `package` 与
  `connector` 条目的 JSON 数组，并使用 `kind` 作为区分字段。
- 输出：package JSON 条目包含稳定 CLI 字段 `kind`、`packageId`、
  `displayName`、`description` 和 `blocks`。
- 输出：connector JSON 条目包含稳定 CLI 字段 `kind`、`service`、
  `name`、`description`、`authenticated` 和 `schemaPath`。
- 输出：文本输出会为每个结果打印一个块，并额外包含一行 `类型` 字段，而不
  再输出来源分组标题。
- 说明：connector 命中结果仍会在本地缓存 schema，并在文本与 JSON 输出中
  报告其缓存路径。

## AI Agent Skill

在执行具体命令前，`oo` 会为已经存在的受支持 Agent 目录静默同步受管理的
skills。

- 内置 skill：`oo` 会确保每个检测到的 Codex、Claude Code、Hermes、
  CodeBuddy、WorkBuddy、Trae、OpenClaw 和 QoderWork Agent 都安装了 `oo`、
  `oo-find-skills`、`oo-create-skill` 与 `oo-publish-skill`。已经由 oo 管理的
  内置 skill 目标会刷新到当前 `oo` 版本；
  但当启动中的当前版本为 `0.0.0-development` 时，不会刷新已存在的内置 skill
  目标。
- 已发布 skill：如果某个已发布 skill 已经有本地 canonical 副本
  `<config-dir>/skills/registry/<skill-id>`，`oo` 会把该副本发布到任何新检测
  到且尚未安装它的受支持 Agent。
- 安全规则：启动同步不会请求 registry，不要求登录，不会产生额外命令输出，也
  不会覆盖不由 `oo` 管理的同名目标。

### `oo skills list`

列出受支持的本地 skill 目录中由 oo 管理的 skill。

- 所有权规则：命令会扫描每个已存在的受支持本地 skill 根目录：
  `${CODEX_HOME:-~/.codex}/skills`、`~/.claude/skills`，以及
  `${HERMES_HOME:-~/.hermes}/skills`、`~/.codebuddy/skills`、
  `~/.workbuddy/skills`、`~/.trae/skills`、
  `${OPENCLAW_HOME:-~/.openclaw}/skills`、`~/.qoderwork/skills`。只保留包含
  可解析 `.oo-metadata.json` 且其中包含非空 `version` 的子目录。
- 输出：文本输出会先打印摘要行，再为每个唯一的可见 skill 身份打印一个块。
  如果多个 Agent 中的安装具有相同 `name`、来源和版本，则会折叠到同一个块中。
- 排序：bundled skills 会排在最前面；其中 `oo` 优先，其次
  `oo-find-skills`，再其次 `oo-create-skill`，再其次 `oo-publish-skill`；其余
  skill 按名称排序。每个块内的 Agent 名称按 `Codex`、`Claude Code`、
  `Hermes`、`CodeBuddy`、`WorkBuddy`、`Trae`、`OpenClaw`、`QoderWork` 顺序显示。
- 输出：每个 skill 块会显示 skill 名称、Agents、来源 package、内置或本地标记，以
  及记录的版本号。
- 说明：如果折叠后的 skill 安装在多个受支持 Agent 中，`Agents` 字段会列出所有
  匹配的 Agent。

### `oo skills list-local`

列出本地 canonical skill 存储中的 skill。

- 所有权规则：命令会扫描 `<config-dir>/skills/local`，只保留 `SKILL.md`
  frontmatter 中包含匹配的非空 `name` 和非空 `description` 的子目录。
- 输出：文本输出会先打印摘要行，再为每个本地 skill 打印一个块。
- 排序：本地 skill 按名称排序。
- 输出：每个 skill 块会显示 skill 名称、本地来源标记、frontmatter 中记录的
  `metadata.version`（如果存在），以及 canonical 本地路径。

### `oo skills preflight`

检查当前环境是否有权限编辑本地 skills。

- 选项：`--agent <agent>` 将 Agent 检查限制为一个受支持 Agent：`codex`、
  `claude`、`hermes`、`codebuddy`、`workbuddy`、`trae`、`openclaw` 或
  `qoderwork`。
- Agent 检查：未提供 `--agent` 时，至少需要存在一个受支持 Agent home 目录。
  提供 `--agent` 时，该指定 Agent home 目录必须存在。
- 存储检查：命令会在需要时创建 `<config-dir>/skills/local` 和每个已检查 Agent
  的发布根目录（如 `<agent-home>/skills`），并在每个已检查目录中写入再移除
  临时探针文件。
- 输出：成功时，文本输出会打印可写存储路径和已检查的受支持 Agent 数量。失败时
  命令以非零状态退出。

### `oo skills init <name>`

初始化一个本地 skill，并发布到所有已存在的受支持 Agent home 目录。

- 参数：`<name>` 会规范化为小写短横线格式，并用作 skill id、canonical 目录名、
  目标目录名以及 frontmatter `name`。
- 选项：`--description <text>` 为必填项，并写入生成的 `SKILL.md`
  frontmatter description。
- 生成的 `SKILL.md` frontmatter 包含 `compatibility: "Requires the oo CLI."`。
- 选项：`--icon <icon>` 将非空 icon 引用写入生成的 `SKILL.md` frontmatter
  `metadata.icon`。值可以是 emoji、图片 URL，或 `:collection:icon:` 格式，
  其中 `collection` 和 `icon` 是 <https://icones.js.org/> 上的名称。
- 选项：`--title <title>` 将 `metadata.title` 写入生成的 `SKILL.md`
  frontmatter。未提供时不会生成 `metadata.title`。
- canonical 目录：skill 创建在 `<config-dir>/skills/local/<skill-id>` 下，
  其中 `<config-dir>` 是 oo settings 文件所在目录。
- 目标目录：命令会向每个已存在的受支持 Agent skill 目录发布该 skill：
  `${CODEX_HOME:-~/.codex}/skills/<skill-id>`、`~/.claude/skills/<skill-id>`，
  `${HERMES_HOME:-~/.hermes}/skills/<skill-id>`、
  `~/.codebuddy/skills/<skill-id>`、`~/.workbuddy/skills/<skill-id>`、
  `~/.trae/skills/<skill-id>`、
  `${OPENCLAW_HOME:-~/.openclaw}/skills/<skill-id>`，以及
  `~/.qoderwork/skills/<skill-id>`。
- 发布方式：Codex、Claude Code、Trae 和 QoderWork 目标会在当前平台和环境允许时
  发布为指向 canonical 目录的软连接；Hermes、CodeBuddy、WorkBuddy 和 OpenClaw
  目标会复制。
- 失败行为：如果没有受支持的 Agent home，或 canonical 本地目录、任意目标目录
  已存在，命令会在写入 skill 前以非零状态退出。
- 输出：文本输出会先打印 canonical 存储目录，然后为每个目标路径打印一行带实际发布
  方式（软链接或复制）的成功消息。

### `oo skills validate <path>`

按照通用 skill 契约校验本地 skill 目录。

- 参数：`<path>` 是包含 `SKILL.md` 的 skill 目录。
- 校验：`SKILL.md` frontmatter 必须是字典，并包含字符串 `name` 和非空字符串
  `description` 字段。
- 校验：嵌套的 `metadata` 可以省略；如果提供，则必须是字典。嵌套的
  `metadata.icon` 和 `metadata.title` 可以省略；如果提供，则必须是非空字符串。
- 警告：缺少 `metadata.icon` 或 `metadata.title` 会打印 warning，但不会导致校验失败。
- 输出：成功时命令会打印简短成功消息。失败时打印校验错误并以非零状态退出。

### `oo skills publish <skill-id>`

将一个 skill 转换为 OOMOL 包，并执行发布步骤。

- 参数：`<skill-id>` 通常是 skill id。当没有匹配到由 oo 管理的 skill 时，也可以
  是包含 `SKILL.md` 的 skill 目录路径。相对路径会从当前工作目录解析。
- 选项：`--visibility <visibility>` 设置 registry 包可见性。可选值为
  `private` 和 `public`，默认值为 `private`。
- 选项：`--agent <agent>` 仅在 local、bundled 和 registry 存储中都没有匹配时
  作为来源提示。可选值为 `codex`、`claude`、`hermes`、`codebuddy`、
  `workbuddy`、`trae`、`openclaw` 和 `qoderwork`。
- 选项：`-y, --yes` 会对发布过程中的确认提示自动回答 yes。
- 来源解析：命令会先检查 `<config-dir>/skills/local/<skill-id>`。如果存在，则发布
  这个本地 skill。
- 来源解析：内置 skill 会被拒绝发布，因为它们由 oo CLI 版本管理。
- 来源解析：可以发布 `<config-dir>/skills/registry/<skill-id>` 下的 registry
  skill。如果已安装元数据中的包名和目标包名不同，命令会使用交互式 `[y/N]`
  确认，再将它发布到当前账号 scope 下；提供 `-y, --yes` 时会跳过该确认。
- 来源解析：如果传入了 `--agent` 且前面的来源都没有匹配，命令会检查该 Agent 的
  `<agent-home>/skills/<skill-id>` 目录。匹配到的 skill 会先被接管到本地 canonical
  存储，再继续发布。
- 来源解析：如果仍未匹配，`<skill-id>` 会按文件系统路径解析。匹配到的 skill
  目录会先被接管到本地 canonical 存储，再继续发布。
- 接管：接管会把 skill 移动到 `<config-dir>/skills/local/<skill-id>`，将已有
  `.oo-metadata.json` 字段导入 `SKILL.md` frontmatter，删除 `.oo-metadata.json`，
  并把本地 canonical 副本发布到受支持的 Agent skill 目录。接管需要交互式 `[y/N]`
  确认；提供 `-y, --yes` 时会跳过该确认。被接管的源目录不能包含符号链接。
- 认证：命令要求存在当前 OOMOL 账号。包名始终为
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
- Registry 安全检查：发布前，命令会查询远端 latest 包元数据。如果远端包已经
  包含 blocks，交互式终端会按既有 `[y/N]` 确认风格询问是否继续。回答 no、
  直接回车，或在没有交互式 stdin 的环境中运行，都会在转换、PUT 和本地 metadata
  回写前停止；提供 `-y, --yes` 时会跳过该确认。
- 版本解析：如果请求版本不大于远端 latest 包版本，命令会发布下一个 patch 版本。
- 回写：发布步骤成功后，命令会把最终的 `metadata.packageName` 和
  `metadata.version` 写回 `SKILL.md` frontmatter。
- 输出：成功时，文本输出会打印 skill id、最终包标识、所选可见性（`private`
  或 `public`）以及当前账号 endpoint 对应的 Hub 包页面 URL，例如生产账号使用
  `https://hub.oomol.com/package/<packageName>`。失败时命令以非零状态退出，并保持
  `SKILL.md` 不变。

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
- 参数：未提供时，该命令会安装全部内置 skill。
- 参数：当 `[packageName]` 为 `oo`、`oo-find-skills`、`oo-create-skill` 或
  `oo-publish-skill` 时，命令安装对应的内置 skill。
- 参数：当 `[packageName]` 为已发布 package 名称时，命令从该 package 中
  安装 skill。
- 选项：`-s, --skill <skills...>` 用于安装 package 中一个或多个指定的
  skill。
- 选项：`-s, --skill '*'` 用于安装该 package 中全部已发布 skill。
- 选项：`--all` 是安装全部已发布 skill 的快捷方式，并跳过 skill 选择提示。
- 选项：`-y, --yes` 用于跳过确认提示。当 package 下有多个 skill 且未显式
  提供 `--skill` 时，`-y` 会安装全部 skill。
- 输出：非交互安装成功时，会按已安装 skill 和目标 AI Agent 聚合输出精简摘要；
  当实际只写入一个目标时，摘要会包含该目标路径。
- 说明：如果 package 只发布了一个 skill，且未提供 `--skill`，命令会自动
  安装这个唯一的 skill。
- 说明：如果 package 发布了多个 skill，且未提供 `--skill`、`--all` 或
  `-y`，命令会在 TTY 中打开交互选择页面。
- 说明：在交互选择页面中，同一 package 下已安装的 skill 会默认保持勾选；
  如果用户取消这些勾选，命令完成时会移除对应已安装 skill。
- canonical 目录：内置 skill 会先释放到
  `<config-dir>/skills/bundled/<agent>/<skill-id>`，其中 `<config-dir>` 是
  `settings.toml` 所在目录，`<agent>` 为 `codex`、`claude`、`hermes`、
  `codebuddy`、`workbuddy`、`trae`、`openclaw` 或 `qoderwork`。
- canonical 目录：已发布 skill 会先释放到
  `<config-dir>/skills/registry/<skill-id>`。
- 迁移：升级后首次运行 `oo skills install` 时，命令会清理历史遗留的 canonical
  目录（`claude-skills/`、`openclaw-skills/`，以及直接位于 `skills/` 下的旧
  Codex 内置 / 已发布 skill 目录）。内置 skill 会自动以新布局重建；之前安装
  的已发布 skill 需要通过 `oo skills install <packageName>` 重新安装。
- 目标目录：内置和已发布 skill 会发布到所有已存在的受支持 Agent 目录，目前包括
  `${CODEX_HOME:-~/.codex}/skills/<skill-id>` 和
  `~/.claude/skills/<skill-id>`，以及
  `${HERMES_HOME:-~/.hermes}/skills/<skill-id>`、
  `~/.codebuddy/skills/<skill-id>`、
  `~/.workbuddy/skills/<skill-id>`、
  `~/.trae/skills/<skill-id>`、
  `${OPENCLAW_HOME:-~/.openclaw}/skills/<skill-id>`、
  `~/.qoderwork/skills/<skill-id>`。
- 目标目录：当已存在的受支持 Agent 缺少 `skills` 根目录时，命令会先创建该目录，
  再发布所选 skill。
- 安装方式：内置和已发布的 Codex / Claude Code / Trae / QoderWork skill 会优
  先把目标目录发布为指向 canonical 目录的软连接。如果当前平台或环境下创建
  软连接失败，则会回退为把 canonical 目录内容复制到目标 skills 目录。
- 安装方式：内置和已发布的 Hermes / CodeBuddy / WorkBuddy / OpenClaw skill
  会直接复制到目标 skills 目录。
- 元数据：内置 skill 会写入一个隐藏的 `.oo-metadata.json` 文件，其中
  `version` 字段记录当前 `oo` 版本。
- 元数据：已发布 skill 也会写入一个隐藏的 `.oo-metadata.json` 文件，
  其中 `version` 字段记录 package 版本，`packageName` 字段记录来源
  package。
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
- 说明：当 Codex、Claude Code、Hermes、CodeBuddy、WorkBuddy、Trae、OpenClaw
  和 QoderWork 的受支持根目录都不存在时，命令会直接报错退出。
- 说明：只有当 bundled skill 的 `.oo-metadata.json` 可以被解析，且其中包
  含非空的 `version` 时，`oo` 才会认为这是自己管理的内置 skill；否则会视
  为其他 skill，并拒绝覆盖。

### `oo skills update [skills...]`

更新已安装且由 oo 管理的已发布 skill。

- 参数：省略时，会检查所有已安装且由 oo 管理的已发布 skill。
- 参数：提供一个或多个 skill 名称时，只会检查并更新这些指定 skill。
- 内置 skill：bundled `oo`、`oo-find-skills`、`oo-create-skill`、
  `oo-publish-skill` 等内置 skill 不在此命令处理范围内。请使用
  `oo skills add` 刷新，或让成功的 `oo install` / `oo update` 自动刷新它们。
- 所有权规则：只有当 skill 的 `.oo-metadata.json` 可以被解析，且包含非空
  `version` 时，update 才会认为它由 oo 管理；否则会把现有目标视为非托管。
- 已发布 skill：registry skill 会从 `.oo-metadata.json` 读取所属包名，再通过
  不带显式版本的 package info 请求判断最新可用版本。
- 更新顺序：命令会先刷新 canonical 目录
  `<config-dir>/skills/registry/<skill-id>`，再同步到所有已存在的受支持 Agent 目录。
- 交互式终端：会显示实时进度。
- 非交互式终端：对每个已是最新或失败的 skill 输出一行状态信息；对每个已更新
  的 Agent 目标路径输出一行成功信息。

### `oo skills uninstall [skill]`

从受支持的本地 skill 目录移除由 oo 管理的 skill。

- 别名：`oo skills remove [skill]`。
- 参数：省略 `[skill]` 时，命令会移除全部内置 skill。
- 参数：提供 `[skill]` 时，命令会同时检查本地 canonical 存储和已发布的
  registry 安装；如果两者都匹配同一个名称，会同时移除。registry 安装会先于
  本地安装移除。
- 所有权规则：对内置 skill 来说，只有当某个受支持 Agent 中的安装目录包含可解
  析且带有非空 `version` 的 `.oo-metadata.json` 时，才允许从该 Agent 移除。
- 所有权规则：通过复制发布的本地 skill，如果受支持 Agent 中的 `SKILL.md`
  内容与本地 canonical `SKILL.md` 一致，也会被视为可移除的本地安装。
- 会同时移除 canonical 目录：内置 skill 会移除
  `<config-dir>/skills/bundled/<agent>/<skill>`（每个已安装 Agent 各一份），
  本地 skill 会移除 `<config-dir>/skills/local/<skill>`，已发布 skill 会移除
  `<config-dir>/skills/registry/<skill>`。
- 会同时移除目标目录：内置、本地和已发布 skill 会从所有已存在的受支持 Agent
  目录中移除，目前包括 `${CODEX_HOME:-~/.codex}/skills/<skill>` 和
  `~/.claude/skills/<skill>`，以及
  `${HERMES_HOME:-~/.hermes}/skills/<skill>`、
  `~/.codebuddy/skills/<skill>`、
  `~/.workbuddy/skills/<skill>`、
  `~/.trae/skills/<skill>`、
  `${OPENCLAW_HOME:-~/.openclaw}/skills/<skill>`、
  `~/.qoderwork/skills/<skill>`。
- 路径规则：`[skill]` 解析后必须仍然落在这些本地 `skills` 根目录的子目录中。
  任何会逃出这些根目录的名称都会被拒绝。
- 说明：如果请求的 skill 在任何受支持目标中都不存在受管理安装，且不存在同名
  本地 canonical skill，或某个已存在的同名目标不是由 `oo` 管理，命令会直接报错。

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
- 说明：如果下载在中途停止，重新执行同一条命令且输出目录不变时，CLI 会优先尝试
  使用 HTTP Range 续传；如果服务端无法安全续传，则会从 `0` 字节重新下载。
- 说明：`oo file download` 启动时会丢弃超过 14 天未更新的续传 session，因此过旧的
  `.oodownload` 临时文件将不会再被自动续传。
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
- 说明：上传后的文件有效期为一天，到期后会由服务端删除。
- 说明：文件大小超过 `512 MiB` 时会被拒绝。
- 说明：上传成功后，CLI 会在本地 sqlite 中记录上传时间、文件名、文件大小、
  带签名的下载 URL、过期时间，以及一个 UUID v7 格式的主键。

### `oo file list`

查看本地 sqlite 中记录的历史上传文件。

- 选项：`--status <status>` 按有效状态过滤。支持的值：`active`、`expired`。
- 选项：`--limit <limit>` 限制返回数量，必须为大于等于 `1` 的整数。
- 选项：`--format <format>` 返回结构化输出，目前仅支持 `json`。
- 选项：`--json` 是 `--format=json` 的别名。
- 说明：命令不会隐式删除已过期记录。

### `oo file cleanup`

删除本地 sqlite 中已过期的上传记录。

- 选项：`--format <format>` 返回结构化输出，目前仅支持 `json`。
- 选项：`--json` 是 `--format=json` 的别名。
- 说明：只会删除满足 `expiresAt <= now` 的本地记录。
- 说明：JSON 输出结构为 `{ "deletedCount": number }`。

## Package 检索

### `oo packages search <text>`

使用自由文本按意图搜索 package。

- 参数：`<text>` 为搜索文本。
- 选项：`--format <format>` 返回结构化输出，目前仅支持 `json`。
- 选项：`--json` 是 `--format=json` 的别名。
- 选项：`--only-package-id` 仅返回 package id。
- 说明：搜索文本超过 200 个字符时，会在发送请求前被截断。

### `oo packages info <packageSpecifier>`

查看单个 package 的元数据。

- 参数：`<packageSpecifier>` 为 package 标识，版本可选。示例：
  `foo/bar`、`foo/bar@latest`、`foo/bar@1.2.3`。
- 选项：`--format <format>` 返回结构化输出，目前仅支持 `json`。
- 选项：`--json` 是 `--format=json` 的别名。
- 说明：如果未指定版本，CLI 会解析为最新版本。

## Cloud Task

### `oo cloud-task run <packageSpecifier>`

校验输入值，并为指定 package block 创建 cloud task。

- 参数：`<packageSpecifier>` 必填，且必须使用 `PACKAGE_NAME@SEMVER` 形式，
  例如 `foo/bar@1.2.3`。
- 选项：`-b, --block-id <block-id>` 指定目标 block。该选项必填。
- 选项：`-d, --data <data>` 提供输入值，可以是 JSON 对象字符串，也可以是
  `@path/to/file.json`。
- 选项：`--dry-run` 仅校验请求，不真正创建任务。
- 选项：`--format <format>` 返回结构化输出，目前仅支持 `json`。
- 选项：`--json` 是 `--format=json` 的别名。
- 说明：省略 `--data` 时，命令会使用 `{}`。

### `oo cloud-task list`

列出 cloud task，并支持按条件过滤。

- 选项：`--format <format>` 返回结构化输出，目前仅支持 `json`。
- 选项：`--json` 是 `--format=json` 的别名。
- 选项：`--size <size>` 指定分页大小，支持 `1` 到 `100` 的整数。
- 选项：`--nextToken <nextToken>` 使用分页令牌请求下一页。
- 选项：`--status <status>` 按任务状态过滤。支持的值：
  `queued`、`scheduling`、`scheduled`、`running`、`success`、`failed`。
- 选项：`--package-id <package-id>` 按 package ID 过滤。
- 选项：`--package-name <package-name>` 是 `--package-id` 的别名。
- 选项：`--block-id <block-id>` 按 block ID 过滤。该选项要求同时提供
  `--package-id` 或 `--package-name`。
- 选项：`--block-name <block-name>` 是 `--block-id` 的别名。
- 说明：如果同时提供主选项和别名选项，两者的值必须一致。

### `oo cloud-task log <taskId>`

查看单个任务的分页日志。

- 参数：`<taskId>` 为任务 ID。
- 选项：`--page <page>` 指定日志页码，支持大于等于 `1` 的整数。
- 选项：`--format <format>` 返回结构化输出，目前仅支持 `json`。
- 选项：`--json` 是 `--format=json` 的别名。

### `oo cloud-task result <taskId>`

查看单个任务的当前结果。

- 参数：`<taskId>` 为任务 ID。
- 选项：`--format <format>` 返回结构化输出，目前仅支持 `json`。
- 选项：`--json` 是 `--format=json` 的别名。

### `oo cloud-task wait <taskId>`

每隔 `3 秒`轮询一次任务结果，直到任务进入终态。

- 参数：`<taskId>` 为任务 ID。
- 选项：`--timeout <timeout>` 指定等待超时时间，默认值为 `6h`，最小为
  `10s`，最大为 `24h`。支持 `1m`、`4h`、`120s`、`360` 这类格式；未提供
  单位时默认按秒处理。
- 说明：任务成功、失败或达到超时时间后，命令都会立即退出。
- 说明：任务未结束时，CLI 会先立即打印一次当前状态；在前 `1` 小时内每
  `1` 分钟打印一次，`1h` 到 `3h` 之间每 `3` 分钟打印一次，`3h` 之后每
  `5` 分钟打印一次。

## Shell 补全

### `oo completion <shell>`

生成 shell 补全脚本。

- 参数：`<shell>` 为目标 shell。支持的值：`bash`、`zsh`、`fish`。
