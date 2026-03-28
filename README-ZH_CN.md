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

## Codex Skill

首次打开 `oo`，或者执行 `oo skills install`（等价于
`oo skills install oo`）之后，Codex 中会生成内置的 `oo` skill，位置在
`${CODEX_HOME:-~/.codex}/skills/oo`。

然后你就可以在 Codex 中这样使用：

```text
$oo 帮我生成 OOMOL 字符串的二维码
```

也可以手动执行安装：

```bash
oo skills install
```

## 文档

- [命令参考](./docs/commands.zh-CN.md)

## 贡献

贡献流程和仓库约定见 [CONTRIBUTING.md](./CONTRIBUTING.md)。
