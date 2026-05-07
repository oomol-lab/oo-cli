# oo

[English](./README.md) | [简体中文](./README-ZH_CN.md)

`oo` 是 OOMOL 的命令行工具，用来在终端里处理 OOMOL 账号、package 和云端任务相关操作。

## 简介

`oo` 为常见的 OOMOL 终端工作流提供统一入口，包括账号认证、持久化 CLI
配置、package 搜索与信息查看、cloud task 执行，以及 shell 补全脚本生成。

## 安装

按你的平台选择对应命令：

macOS / Linux（二选一）：

```bash
wget -qO - https://cli.oomol.com/install.sh | bash
```

```bash
curl -fsSL https://cli.oomol.com/install.sh | bash
```

Windows PowerShell：

```powershell
irm https://cli.oomol.com/install.ps1 | iex
```

Windows CMD：

```bat
curl -fsSL https://cli.oomol.com/install.cmd -o install.cmd && install.cmd && del install.cmd
```

## 快速开始

1. 登录：

```bash
oo login
```

2. 打开 Codex，输入下面这句开始工作：

```text
$oo 帮我生成 OOMOL 字符串的二维码
```

## 内置 Skill

首次打开 `oo` 之后，只要本地已存在受支持的宿主目录，就会自动安装内置
skills：

- Codex：`${CODEX_HOME:-~/.codex}/skills/oo` 和
  `${CODEX_HOME:-~/.codex}/skills/oo-find-skills`
- Claude Code：`~/.claude/skills/oo` 和
  `~/.claude/skills/oo-find-skills`
- Hermes：`${HERMES_HOME:-~/.hermes}/skills/oo` 和
  `${HERMES_HOME:-~/.hermes}/skills/oo-find-skills`
- CodeBuddy：`~/.codebuddy/skills/oo` 和
  `~/.codebuddy/skills/oo-find-skills`
- WorkBuddy：`~/.workbuddy/skills/oo` 和
  `~/.workbuddy/skills/oo-find-skills`
- Trae：`~/.trae/skills/oo` 和 `~/.trae/skills/oo-find-skills`
- Trae CN：`~/.trae-cn/skills/oo` 和
  `~/.trae-cn/skills/oo-find-skills`
- OpenClaw：`${OPENCLAW_HOME:-~/.openclaw}/skills/oo` 和
  `${OPENCLAW_HOME:-~/.openclaw}/skills/oo-find-skills`
- QoderWork：`~/.qoderwork/skills/oo` 和
  `~/.qoderwork/skills/oo-find-skills`

之后你就可以在任一受支持宿主中使用它们。比如在 Codex 中：

```text
$oo 帮我生成 OOMOL 字符串的二维码
```

也可以手动安装全部内置 skills：

```bash
oo skills install
```

如果你想单独安装搜索辅助 skill，也可以执行：

```bash
oo skills install oo-find-skills
```

## Telemetry

`oo` 默认记录受隐私约束的命令使用 telemetry。Telemetry 事件不包含
free-form 输入文本、路径、用户名、hostname、IP 地址、真实 OOMOL 账号 ID
或账号名。事件会关闭 PostHog person profile 处理，并使用本地随机 device id
做设备级聚合。

可以通过 `oo telemetry disable`、`OO_TELEMETRY_DISABLED=1` 或
`DO_NOT_TRACK=1` 关闭 telemetry。使用 `oo telemetry status` 查看实际开关状态和本地待发送事件数量。
完整边界见 [PRIVACY-ZH_CN.md](./PRIVACY-ZH_CN.md)。

## 文档

- [命令参考](./docs/commands.zh-CN.md)

## 贡献

贡献流程和仓库约定见 [CONTRIBUTING.md](./CONTRIBUTING.md)。
