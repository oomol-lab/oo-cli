<p align="center">
  <img src="./docs/assets/logo.png" alt="oo" width="120" />
</p>

<h1 align="center">oo</h1>

<p align="center">
  把 AI Agent 接入 OOMOL 托管能力和你已链接的账号。
</p>

<p align="center">
  <a href="https://github.com/oomol-lab/oo-cli/releases/latest"><img src="https://img.shields.io/github/v/release/oomol-lab/oo-cli?display_name=tag" alt="Release" /></a>
  <a href="https://github.com/oomol-lab/oo-cli/actions/workflows/publish.yaml"><img src="https://img.shields.io/github/actions/workflow/status/oomol-lab/oo-cli/publish.yaml?branch=main&label=Publish" alt="Publish" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/oomol-lab/oo-cli" alt="License" /></a>
  <a href="https://console.oomol.com/connections"><img src="https://img.shields.io/badge/console-oomol.com-blue" alt="Console" /></a>
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README-ZH_CN.md">简体中文</a>
</p>

---

## oo 是什么

`oo` 是一个 CLI，让本机的 AI Agent 能发现、查看并调用 OOMOL 托管能力，以及你
已经链接的第三方账号。

通过 `oo` 可以触达两类能力：

- **链接账号**：你在 [OOMOL Console][connections] 一次性授权的第三方服务
  （Gmail、Google Calendar、Google Drive、Notion、Slack、GitHub 等）。授权完成
  后，AI Agent 即可通过 `oo` 调用它们，无需再次登录。
- **托管能力**：OOMOL 维护的 AI 管线，包括 OCR、翻译、转写、TTS、文生图、字幕、
  长文档理解等。

你不需要记任何命令——内置 skill 会告诉受支持的 AI Agent 何时、如何把工作区之外
的任务路由给 `oo`。

## 工作方式

1. **在本机安装 `oo`**。
2. **执行 `oo login`** 把本机绑定到你的 OOMOL 账号。
3. **在 <https://console.oomol.com/connections> 链接服务**，然后用自然语言告诉
   AI Agent 你的意图——内置 `oo` skill 会指导它选择并调用合适的能力。

## 安装

macOS / Linux：

```bash
curl -fsSL https://cli.oomol.com/install.sh | bash
```

Windows PowerShell：

```powershell
irm https://cli.oomol.com/install.ps1 | iex
```

其他安装脚本（`wget`、Windows CMD 等）见 <https://oomol.com/cli/>。

## 快速开始

```bash
oo login
```

然后用自然语言告诉 AI Agent 你想做什么，不需要记命令：

> /oo 总结我最近 5 封 Gmail 邮件。

> /oo 为 https://oomol.com 生成一个二维码。

`/oo` 是内置 skill 约定的触发前缀，Agent 会通过 `oo` 把请求路由到对应的能力。

## 受支持的 AI Agent

首次启动时，`oo` 会向本机已存在的以下 AI Agent 宿主安装内置 skill：
Codex、Claude Code、Hermes、CodeBuddy、WorkBuddy、Trae、Trae CN、OpenClaw、
QoderWork、DeepSeek TUI。

内置 skill 会随 `oo` 每次发布同步更新。具体的 skill 安装位置和手动管理方式见
[命令参考](./docs/commands.zh-CN.md)。

## 隐私

`oo` 默认记录受隐私约束的 telemetry，事件不包含自由文本输入、路径、用户名、
hostname、IP 地址、真实 OOMOL 账号 ID 或账号名。Telemetry 控制方式和完整隐私
边界见 [PRIVACY-ZH_CN.md](./PRIVACY-ZH_CN.md)。

## 链接

- [OOMOL Console — Connections](https://console.oomol.com/connections)
- [命令参考](./docs/commands.zh-CN.md)
- [Contributing](./CONTRIBUTING.md)
- [Privacy](./PRIVACY-ZH_CN.md)

[connections]: https://console.oomol.com/connections
