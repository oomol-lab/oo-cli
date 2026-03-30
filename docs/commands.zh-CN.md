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
- Debug 日志会覆盖远端 API 请求生命周期、浏览器登录回调事件、显式更新检查，
  以及 settings/auth 持久化状态变化和 sqlite cache 活动。
- 偏错误类的日志还会带上 `category` 字段，便于快速筛选用户错误、系统错误和可
  恢复的 cache 问题。
  当前会用到的值包括 `user_error`、`system_error`、`recoverable_cache`。
- CLI 仅保留最近 `20` 个日志文件。超过后会优先删除最旧的日志文件。

## 认证

### `oo auth login`

启动浏览器登录流程，并保存登录成功后的账号。

- 说明：CLI 会打印登录地址，并等待浏览器回调完成。

### `oo auth logout`

从持久化认证数据中移除当前账号。

### `oo auth status`

显示当前账号，并校验其 API key 状态。

### `oo auth switch`

切换到下一个已保存账号。

### `oo login`

`oo auth login` 的别名。

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
  `lang`、`file.download.out_dir`、`skills.oo.implicit_invocation`。

### `oo config path`

输出持久化配置文件路径。

### `oo config set <key> <value>`

写入一个持久化配置值。

- 参数：`<key>` 为配置键。目前支持
  `lang`、`file.download.out_dir`、`skills.oo.implicit_invocation`。
- 参数：`<value>` 为对应配置值。
- 取值规则：当 `<key>` 为 `lang` 时，支持的值为 `en` 和 `zh`。
- 取值规则：当 `<key>` 为 `file.download.out_dir` 时，支持任意非空路径字符串。
  相对路径会在执行 `oo file download` 时相对于当前工作目录解析；如果以 `~`
  开头，则会展开为当前用户的 home 目录。
- 取值规则：当 `<key>` 为 `skills.oo.implicit_invocation` 时，支持的
  值为 `true` 和 `false`。

### `oo config unset <key>`

删除一个持久化配置值。

- 参数：`<key>` 为配置键。目前支持
  `lang`、`file.download.out_dir`、`skills.oo.implicit_invocation`。

## 更新

### `oo check-update`

检查是否有新的 CLI 版本可用。

- 说明：如果发现了新版本，CLI 会输出适用于当前包管理器的升级命令。
- 说明：如果当前版本已经是最新版本，CLI 会输出确认信息。
- 说明：如果遇到瞬时请求失败，CLI 会先自动重试一次。
- 说明：无论成功还是失败，检查结果都不会被缓存，因此每次执行都会重新从
  registry 拉取最新版本信息。
- 说明：如果注册表暂时不可用，CLI 会输出稍后重试的提示，而不是直接报错退出。

## Codex Skill

### `oo skills list`

列出本地 Codex skills 目录中由 oo 管理的 skill。

- 所有权规则：命令会扫描 `${CODEX_HOME:-~/.codex}/skills`，只保留包含
  `.oo-metadata.json` 的子目录。
- 输出：文本输出会先打印摘要行，再为每个 skill 打印一个块。
- 排序：如果存在 `oo`，它总是排在最前面；其余 skill 按名称排序。
- 输出：每个 skill 块会显示 skill 名称、来源 package 或内置标记、记录的版
  本号。

### `oo skills search <text>`

使用自由文本搜索已发布的 skill。

- 别名：`oo skills find <text>`。
- 参数：`<text>` 会作为搜索文本发送到 skills search 服务。
- 选项：`--keywords <keywords>` 接收逗号分隔的关键词列表，去掉空项后以
  重复的 `keywords` 查询参数发送。
- 选项：`--format=json` 和 `--json` 会输出匹配 skill 条目的 JSON 数组。
- 输出：文本输出会为每个 skill 打印一个块，包含标题或名称、可选描述，以及
  在可用时显示来源包标识。
- 说明：每次调用最多请求 `5` 条结果。

### `oo skills config get <skill> [key]`

读取 skill 配置值。

- 参数：`<skill>` 为 skill 名称。
- 参数：`[key]` 可选，用于指定所选 skill 的某个配置键。
- 输出：提供 `[key]` 时，命令会输出该键的有效值，并以换行结尾。
- 输出：省略 `[key]` 时，命令会为所选 skill 的每个已知配置键输出一行
  `key=value`。
- 说明：可用的 skill 名称和配置键集合会随 CLI 版本变化。
- 说明：有效值会包含内置默认值，即使当前还没有显式持久化该配置。

### `oo skills config set <skill> <key> <value>`

持久化一个 skill 配置值。

- 参数：`<skill>` 为 skill 名称。
- 参数：`<key>` 为所选 skill 的配置键。
- 参数：`<value>` 为所选 skill 配置键对应的值。
- 取值规则：可接受的值取决于 `<skill>` 和 `<key>`。
- 说明：当目标受管 skill 已经安装时，命令会立即同步对应受管文件。
- 说明：当目标受管 skill 尚未安装时，命令仍会写入设置，并在下次安装或启
  动同步时生效。

### `oo skills install [packageName]`

将内置或已发布的 Codex skill 安装到本地 Codex skills 目录。

- 参数：`[packageName]` 可选。
- 参数：未提供时，该命令等价于 `oo skills install oo`。
- 参数：当 `[packageName]` 为 `oo` 时，命令安装内置的 `oo` skill。
- 参数：当 `[packageName]` 为已发布 package 名称时，命令从该 package 中
  安装 skill。
- 选项：`-s, --skill <skills...>` 用于安装 package 中一个或多个指定的
  skill。
- 选项：`-s, --skill '*'` 用于安装该 package 中全部已发布 skill。
- 选项：`--all` 是安装全部已发布 skill 的快捷方式，并跳过 skill 选择提示。
- 选项：`-y, --yes` 用于跳过确认提示。当 package 下有多个 skill 且未显式
  提供 `--skill` 时，`-y` 会安装全部 skill。
- 说明：如果 package 只发布了一个 skill，且未提供 `--skill`，命令会自动
  安装这个唯一的 skill。
- 说明：如果 package 发布了多个 skill，且未提供 `--skill`、`--all` 或
  `-y`，命令会在 TTY 中打开交互选择页面。
- canonical 目录：内置 `oo` 的文件会先释放到 `<config-dir>/skills/oo`，
  其中 `<config-dir>` 是 `settings.toml` 所在目录。
- canonical 目录：已发布 skill 会先释放到 `<config-dir>/skills/<skill-id>`。
- 目标目录：所有已安装 skill 都会发布到
  `${CODEX_HOME:-~/.codex}/skills/<skill-id>`。
- 安装方式：`oo` 会优先将目标目录发布为指向 canonical 目录的软连接。
  如果当前平台或环境下创建软连接失败，则会回退为把 canonical 目录内容复制
  到 Codex skills 目录。
- 元数据：内置 `oo` 会写入一个隐藏的 `.oo-metadata.json` 文件，其中
  `version` 字段记录当前 `oo` 版本。
- 元数据：已发布 skill 也会写入一个隐藏的 `.oo-metadata.json` 文件，
  其中 `version` 字段记录 package 版本，`packageName` 字段记录来源
  package。
- 元数据：当存在持久化的 `skills.oo.implicit_invocation` 配置时，
  bundled `oo` 的 `agents/openai.yaml` 会使用该值；否则使用内置默认值。
- 说明：安装已发布 skill 时，所有 registry 请求都会携带当前激活账号的
  `Authorization` header。
- 说明：如果 package 下有多个 skill，且当前不是交互终端，则必须提供
  `--skill <name>` 或 `--all -y`。
- 说明：如果显式安装的已发布 skill 与现有同名 skill 冲突，命令会在交互终
  端中要求用户输入 `yes` 或 `no` 决定是否覆盖。
- 说明：在交互选择页面中，存在重名冲突的 skill 会在列表中显示状态标记；
  只要用户仍然选择该项，就会执行覆盖。
- 说明：当 Codex 根目录不存在时，命令会直接报错退出，这表示当前机器上没有
  安装 Codex。
- 说明：只有当 `oo/agents/openai.yaml` 中包含 `OOMOL` 字符串时，`oo`
  才会认为这是自己管理的内置 skill；否则会视为其他 skill，并拒绝覆盖。
- 说明：如果这是 `oo` 的首次运行，且当前还没有已有的 config、auth、log
  数据，那么只要 Codex 根目录已经存在，`oo` 就会静默自动安装这个 bundled
  受管 skill。
- 说明：如果 bundled `oo` 已经安装，`oo` 每次启动都会检查其记录版本是否
  与当前 CLI 版本一致；这里的版本来自元数据文件中的 `version` 字段。不一
  致时会静默刷新已安装的文件。

### `oo skills uninstall [skill]`

从本地 Codex skills 目录移除一个由 oo 管理的 skill。

- 别名：`oo skills remove [skill]`。
- 参数：省略 `[skill]` 时，默认使用 `oo`。
- 所有权规则：只有当
  `${CODEX_HOME:-~/.codex}/skills/<skill>` 中存在 `.oo-metadata.json`
  时，才允许移除该 skill。
- 会同时移除 canonical 目录：`<config-dir>/skills/<skill>`，其中
  `<config-dir>` 是 `settings.toml` 所在目录。
- 会同时移除目标目录：`${CODEX_HOME:-~/.codex}/skills/<skill>`。
- 说明：如果目标目录不存在，或者目录存在但没有 `.oo-metadata.json`，
  命令会直接报错，不会删除任何内容。

## 日志

### `oo log path`

输出当前持久化 debug 日志目录路径。

### `oo log print`

输出某一份更早的持久化 debug 日志文件内容。

- 参数：`[index]` 可选，必须为大于等于 `1` 的整数。`1` 表示上一份日志，
  `20` 表示往前第 20 份日志。
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
