# 自部署 Connector 接入指南

[English](./self-hosted-connector.md) | [简体中文](./self-hosted-connector.zh-CN.md)

命令参考见 [commands.zh-CN.md](./commands.zh-CN.md)

本指南介绍如何让 `oo` CLI 连接到你自行部署的 Connector 服务（而非 OOMOL 托管的
Connector），以及这样的服务需要暴露怎样的 HTTP 契约。文档面向两类读者：

- **使用者**：希望让 connector 命令请求自部署服务（见「快速开始」「Runtime
  令牌」「路由优先级」「排障」等章节）。
- **服务实现者**：希望搭建一个 CLI 能对接的服务（见「服务端契约」章节）。

## 概览

自部署 Connector 是一种**能力覆盖，而非账号**。配置后，connector 相关命令会将请求
路由到你的服务，而不是 OOMOL 托管的 Connector 服务。CLI 的其他部分——你的 OOMOL
账号、计费、skills——都不受影响。

关键特性：

- 配置保存在 `connector.toml` 中，与 `auth.toml` **相互独立**。登录自部署
  Connector 不会改动你的 OOMOL 账号，反之亦然。
- 自部署运行时**没有账号概念**。启用鉴权时，使用的是单一的 Runtime API 令牌，
  而不是逐用户登录。
- 只有 connector 相关命令会被影响。需要 OOMOL 账号的命令（文件上传、LLM、skills
  发布等）仍需 `oo auth login`。

以下命令会路由到已配置的自部署 Connector：

- `oo connector search`
- `oo connector schema`
- `oo connector run`
- `oo connector apps`
- `oo connector proxy`
- `oo search`（`oo connector search` 的顶层别名）

## 前置条件

1. 一个可通过 `http://` 或 `https://` 访问、并实现下文[服务端契约](#服务端契约)的
   Connector 服务。本地开发时通常形如 `http://localhost:3000`。
2. 服务的基础 URL。它可以带路径前缀（例如服务位于反向代理后的
   `https://example.com/oo-connector`）。
3. 若服务启用了鉴权，还需要一个 **Runtime 令牌**。令牌在服务的 `/access` 页面
   创建。

## 快速开始

连接一个未启用鉴权的服务：

```bash
oo connector login http://localhost:3000
```

连接一个需要 Runtime 令牌的服务：

```bash
oo connector login https://connector.example.com --token <runtime-token>
```

成功后，CLI 会打印已连接的服务 URL、说明令牌是否通过验证，并指向 `<url>/access`
以管理 Runtime 令牌：

```text
✓ 已连接自部署 Connector：https://connector.example.com
令牌已通过服务验证。
可在 https://connector.example.com/access 管理 Runtime Token。
```

登录成功后，所有 connector 相关命令都会使用该服务：

```bash
oo connector search "发送邮件"
oo connector schema "gmail.send_email"
oo connector run gmail --action send_email --data '@payload.json'
oo connector apps gmail
```

完成后，将 connector 命令切回你的 OOMOL 账号：

```bash
oo connector logout
```

### `oo connector login` 的校验流程

在写入任何配置之前，`login` 会探测服务的健康检查端点（`GET /v1/health`，超时
10 秒），使配置错误的 URL 立即失败，而不是等到真正执行命令时才暴露：

- 非 `http(s)` 的 URL，或带有查询字符串、片段（fragment）、内嵌
  `user:pass@` 凭据的 URL，会在发出任何请求前以退出码 `2` 被拒绝。
- 空令牌，或包含空白、控制字符的令牌，会以退出码 `2` 被拒绝。
- 服务不可达、返回 HTTP `401`、或返回的响应不是有效的 connector 健康响应，均以
  退出码 `1` 失败。`401` 错误会附带提示，引导你在 `<url>/access` 创建 Runtime
  令牌。

只有健康检查通过后，配置才会写入 `connector.toml`。

## Runtime 令牌

如果你的服务强制鉴权，请传入在服务 `/access` 页面创建的令牌：

```bash
oo connector login https://connector.example.com --token <runtime-token>
```

CLI 会在每个 connector 请求上以 `Authorization: Bearer <token>` 头发送该令牌。

令牌验证是尽力而为的，并且会如实说明能证明什么：

- **令牌已被接受。** 带鉴权的健康检查成功，且不带头部的探测被拒绝，说明令牌确实
  是必需且有效的。输出：`令牌已通过服务验证。`
- **令牌无法验证。** 服务同时也接受未鉴权请求，因此 `200` 不能证明令牌有效。
  配置仍会保存，并打印一条警告。
- **未配置令牌。** 输出会提示：若服务日后启用令牌，请在 `<url>/access` 创建一个
  并重新登录。

## 路由优先级

当 connector 相关命令运行时，按以下优先级解析目标服务（先命中者生效）：

| 优先级 | 来源 | 目标 |
| --- | --- | --- |
| 1 | `OO_CONNECTOR_URL`（及可选的 `OO_CONNECTOR_TOKEN`） | 环境变量指定的自部署服务 |
| 2 | `OO_API_KEY`（及可选的 `OO_ENDPOINT`） | 该 key 对应的 OOMOL 托管 Connector |
| 3 | `connector.toml`（`oo connector login` 保存的配置） | 已持久化的自部署服务 |
| 4 | 当前激活的 OOMOL 账号 | 该账号对应的 OOMOL 托管 Connector |

两个需要记住的结论：

- `OO_API_KEY` 的优先级高于已保存的 `connector.toml`。设置显式的托管凭据总会让
  connector 命令路由到 OOMOL 服务，因此已持久化的自部署配置永远不会劫持显式的
  托管 key。只有 `OO_CONNECTOR_URL` 的优先级高于 `OO_API_KEY`。
- 若以上来源都无法解析、而命令又需要目标，则回退到当前激活账号，并抛出标准的
  「需要登录」错误。

### 环境变量覆盖（无头 / CI）

`OO_CONNECTOR_URL` 与 `OO_CONNECTOR_TOKEN` 可以在**不改动 `connector.toml`** 的
前提下，将 connector 命令指向自部署服务。这与 `OO_API_KEY` 之于 OOMOL 服务的机制
一致，是容器和 CI 场景的推荐做法：

```bash
export OO_CONNECTOR_URL="https://connector.example.com"
export OO_CONNECTOR_TOKEN="<runtime-token>"   # 可选
oo connector run gmail --action send_email --data '@payload.json'
```

注意：

- 未设置 `OO_CONNECTOR_URL` 时，`OO_CONNECTOR_TOKEN` 会被忽略。
- 环境变量覆盖不会修改或删除任何已保存的 `connector.toml`，只是在当前进程中
  优先生效。
- `oo connector logout` 只移除已保存的配置，**不会**清除 `OO_CONNECTOR_URL`；
  需要回退时请自行 unset 该变量。

## 与 OOMOL 托管 Connector 的功能差异

自部署运行时暴露的能力比 OOMOL 服务更小，CLI 会做如下适配：

- **不支持团队身份。** `oo connector run`、`oo connector proxy` 与 `oo connector
  apps` 上的 `--team` 会以退出码 `2` 被拒绝，账号保存的默认团队
  和 `OO_TEAM_ID` / `OO_TEAM_NAME` 环境变量都会被忽略。
- **无法等待异步生命周期。** `--wait` 与 `--wait-result` 会以既有的「不支持」
  错误失败，因为自部署运行时未暴露异步结果生命周期契约。
- **Proxy 取决于服务支持。** 只有当你的服务实现了 proxy 端点时，
  `oo connector proxy` 才可用；参考用的开源运行时目前对其返回错误。

无论是否配置了自部署 Connector，需要 OOMOL 账号的命令仍然需要账号，包括
`oo file upload`、`oo llm` 系列命令、`oo variables`，以及 `oo skills` 的
search/install/publish/sync 命令。这些命令失败时，请运行 `oo auth login`。

## 查看当前配置

`oo auth status` 会在展示 OOMOL 账号的同时报告当前生效的自部署 Connector。文本模式
下会增加一个区块，显示服务 URL、是否已配置令牌（令牌值本身永不打印）以及配置来源：

```text
✓ 自部署 Connector：https://connector.example.com
  - 已配置令牌: 是
  - 来源: file
```

JSON 模式（`oo auth status --json`）下，输出会带一个可选的顶层 `connector` 对象：

```json
{
  "connector": {
    "url": "https://connector.example.com",
    "tokenConfigured": true,
    "source": "file"
  }
}
```

- 当配置来自 `OO_CONNECTOR_URL` 时，`source` 为 `env`；来自 `connector.toml` 时
  为 `file`。
- 只要配置了自部署 Connector，该区块就会出现，即使 `status` 不是 `logged-in`——
  这正是 agent 判断「仅自部署」模式的依据。
- 请记住：当设置了 `OO_API_KEY` 时，即便存在 `source: "file"` 的配置，connector
  命令仍会路由到 OOMOL 服务（只有 `OO_CONNECTOR_URL` 的优先级高于
  `OO_API_KEY`）。

## 存储：`connector.toml`

保存的配置是位于配置根目录下的一个小型 TOML 文件：

- macOS：`~/Library/Application Support/oo/connector.toml`
- Linux：`${XDG_CONFIG_HOME:-~/.config}/oo/connector.toml`
- Windows：`%APPDATA%\oo\connector.toml`

`OO_CONFIG_DIR` 会直接覆盖配置根目录。该文件仅在执行 `oo connector login` 后才存在；
全新的安装不会有它。文件内容：

```toml
[self_hosted]
url = "https://connector.example.com"
token = "<runtime-token>"   # 仅在配置了令牌时出现
```

`oo connector logout` 会移除 `[self_hosted]` 区块。损坏的 `connector.toml` 也会被
logout 一并清除，因此 logout 总能保证配置被移除。

## 服务端契约

要作为自部署 Connector 被使用，你的服务必须实现以下 HTTP 端点。所有路径都通过字符串
拼接追加到已配置的基础 URL 之后，因此基础 URL 中的任何路径前缀（例如
`https://example.com/oo-connector`）都会被保留。

| 方法 | 路径 | 使用者 | 用途 |
| --- | --- | --- | --- |
| `GET` | `/v1/health` | `oo connector login` | 登录校验用的健康检查 |
| `GET` | `/v1/actions/search?q=<text>` | `oo connector search`、`oo search` | 语义化动作搜索 |
| `GET` | `/v1/actions/<service>.<action>` | `oo connector schema` | 动作元数据 / schema |
| `POST` | `/v1/actions/<service>.<action>` | `oo connector run` | 执行单个动作 |
| `GET` | `/v1/apps/services/<service>` | `oo connector apps` | 列出某服务已连接的 app |
| `POST` | `/v1/proxy/<service>` | `oo connector proxy` | 代理一个 provider API 请求 |

service 与 action 名称会经过 URL 编码；run/schema 路径使用 `<service>.<action>`
形式（例如 `/v1/actions/gmail.send_email`）。

### 鉴权

- 若配置了 Runtime 令牌（通过 `--token`、`connector.toml` 或
  `OO_CONNECTOR_TOKEN`），每个请求都会携带 `Authorization: Bearer <token>` 头，
  请按精确匹配校验。
- 未启用鉴权的服务应当接受不带 `Authorization` 头的请求。
- 返回 HTTP `401` 表示需要令牌。`oo connector login` 会把 `401` 转换为一条提示，
  引导用户前往 `<url>/access`。

### 健康响应（`GET /v1/health`）

返回 HTTP `200`，其 JSON 信封的 `success` 为 `true`、`data.ok` 为 `true`。信封中
的其他字段会被忽略，因此你可以自由扩展：

```json
{ "success": true, "data": { "ok": true } }
```

以下情形都会被 `oo connector login` 视为失败：非 `200` 状态、非 JSON 响应体，或
`success` 与 `data.ok` 未同时为 `true` 的信封。

### 搜索响应（`GET /v1/actions/search`）

返回带 `data` 数组的 JSON 对象。每一项描述一个动作，CLI 会读取 `service`、`name`、
`description`、`authenticated`、`accessStatus`、`inputSchema` 和 `outputSchema`：

```json
{
  "data": [
    {
      "service": "gmail",
      "name": "send_email",
      "description": "Send an email",
      "authenticated": true,
      "accessStatus": "available",
      "inputSchema": { "...": "..." },
      "outputSchema": { "...": "..." }
    }
  ]
}
```

`authenticated` 表示该服务在服务端是否已有已连接、已授权的 app。`accessStatus` 的值为
`available` 或 `connection_required`，表示该 action 是否可以立即使用。服务端可以省略
`accessStatus`；此时 CLI 会在 `authenticated` 为 `true` 时推导为
`available`，否则推导为 `connection_required`。CLI 会在搜索输出中直接呈现这两个
字段，并用返回的 `inputSchema` / `outputSchema` 预热本地 schema 缓存。

### 元数据响应（`GET /v1/actions/<service>.<action>`）

在顶层 `data` 对象下返回该动作的契约，字段与搜索相同：`service`、`name`、
`description`、`inputSchema`、`outputSchema`。

### 执行请求（`POST /v1/actions/<service>.<action>`）

CLI 会发送 `Content-Type: application/json`，请求体形如：

```json
{ "input": { "...": "动作输入数据" } }
```

成功响应使用稳定的 `{ data, meta: { executionId } }` 结构。失败时，请尽量在响应体中
包含 `message` 与 `errorCode`，CLI 会在错误输出中呈现二者。

### Apps 与 Proxy

- `GET /v1/apps/services/<service>` 返回某服务已连接的 app，供 `oo connector apps`
  使用。
- `POST /v1/proxy/<service>` 代理一个 provider API 请求，供 `oo connector proxy`
  使用。仅在你支持 proxy 执行时才需实现。

### `/access` 页面

`<base-url>/access` 是一个网页（并非 CLI 调用的 API），供用户创建和管理 Runtime
令牌。CLI 会在登录输出和 `401` 错误提示中引用它，因此在该路径托管一个页面能让令牌
管理更易被发现。

## 排障

| 现象 | 可能原因与处理 |
| --- | --- |
| `The connector URL ... is not a valid http(s) URL.`（退出码 2） | URL 不是 `http(s)`，或带有查询、片段或内嵌凭据。请传入干净的源，例如 `http://localhost:3000`。 |
| `The connector token must not be empty or contain whitespace or control characters.`（退出码 2） | `--token` 的值为空，或包含空白 / 控制字符。 |
| `Could not reach the connector server at ...`（退出码 1） | 登录时服务不可达。请确认服务已启动、URL 正确。 |
| `The connector server rejected the request (HTTP 401).`（退出码 1） | 服务需要令牌。请在 `<url>/access` 创建令牌，并通过 `--token` 传入。 |
| `The server at ... did not return a connector health response.`（退出码 1） | URL 指向的并非 connector 服务，或 `/v1/health` 未返回预期信封。 |
| `Could not reach the self-hosted connector at ...`（执行命令时） | 已保存的服务已宕机。请启动它，或运行 `oo connector login` 重新配置。这不是沙箱或权限问题，请勿以提升权限重试。 |
| `The --team option is not supported by a self-hosted connector.`（退出码 2） | 自部署运行时没有团队身份。请去掉 `--team`。 |
| 某命令需要 OOMOL 账号 | 非 connector 功能（文件上传、LLM、skills）仍需 `oo auth login`。 |
