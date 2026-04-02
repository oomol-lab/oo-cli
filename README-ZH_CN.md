# oo

[English](./README.md) | [简体中文](./README-ZH_CN.md)

`oo` 是 OOMOL 的命令行工具，用来在终端里处理 OOMOL 账号、package 和云端任务相关操作。

## 简介

`oo` 为常见的 OOMOL 终端工作流提供统一入口，包括账号认证、持久化 CLI
配置、package 搜索与信息查看、cloud task 执行，以及 shell 补全脚本生成。

## 安装

```bash
bun install -g @oomol-lab/oo-cli
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

之后你就可以在 Codex 或 Claude Code 中使用它们。比如在 Codex 中：

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

## 文档

- [命令参考](./docs/commands.zh-CN.md)

## 贡献

贡献流程和仓库约定见 [CONTRIBUTING.md](./CONTRIBUTING.md)。
