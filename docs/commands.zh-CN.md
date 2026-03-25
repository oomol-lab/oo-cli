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
- Debug 日志会覆盖远端 API 请求生命周期、浏览器登录回调事件、更新检查的关键
  决策，以及 settings/auth 持久化状态变化和 sqlite cache 活动。
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

### `oo config list`

列出当前已经设置的持久化配置。

### `oo config get <key>`

读取一个持久化配置值。

- 参数：`<key>` 为配置键。目前仅支持 `lang`。

### `oo config path`

输出持久化配置文件路径。

### `oo config set <key> <value>`

写入一个持久化配置值。

- 参数：`<key>` 为配置键。目前仅支持 `lang`。
- 参数：`<value>` 为对应配置值。
- 取值规则：当 `<key>` 为 `lang` 时，支持的值为 `en` 和 `zh`。

### `oo config unset <key>`

删除一个持久化配置值。

- 参数：`<key>` 为配置键。目前仅支持 `lang`。

## Codex Skill

### `oo skills install`

将一个内置 skill 安装到本地 Codex skills 目录。

- 内置 skill：`oo`。
- 目标目录：`${CODEX_HOME:-~/.codex}/skills/oo`。
- 元数据：安装时会在 skill 目录内写入一个隐藏的 `oo` 版本记录文件。
- 说明：当 Codex 根目录不存在时，命令会直接报错退出，这表示当前机器上没有
  安装 Codex。
- 说明：只有当 `oo/agents/openai.yaml` 中包含 `OOMOL` 字符串时，`oo`
  才会认为这是自己管理的 skill；否则会视为其他 skill，并拒绝覆盖。
- 说明：如果这是 `oo` 的首次运行，且当前还没有已有的 config、auth、log
  数据，那么只要 Codex 根目录已经存在，`oo` 就会静默自动安装这个受管
  skill。
- 说明：如果内置 skill 已经安装，`oo` 每次启动都会检查其记录版本是否与当前
  CLI 版本一致；不一致时会静默刷新已安装的文件。

### `oo skills uninstall`

从本地 Codex skills 目录移除一个内置 skill。

- 内置 skill：`oo`。
- 目标目录：`${CODEX_HOME:-~/.codex}/skills/oo`。

## 日志

### `oo log path`

输出当前持久化 debug 日志目录路径。

### `oo log print`

输出某一份更早的持久化 debug 日志文件内容。

- 参数：`[index]` 可选，必须为大于等于 `1` 的整数。`1` 表示上一份日志，
  `20` 表示往前第 20 份日志。
- 说明：当前这次 `oo log print` 调用也会生成自己的日志文件，因此命令会始终
  跳过本次运行对应的日志，读取更早的日志。

## Package 检索

### `oo search <text>`

使用自由文本按意图搜索 package。

- 参数：`<text>` 为搜索文本。
- 选项：`--format <format>` 返回结构化输出，目前仅支持 `json`。
- 选项：`--json` 是 `--format=json` 的别名。
- 选项：`--only-package-id` 仅返回 package id。
- 说明：搜索文本超过 200 个字符时，会在发送请求前被截断。

### `oo package info <packageSpecifier>`

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
