# oo 命令参考

[English](./commands.md) | [简体中文](./commands.zh-CN.md)

项目概览见 [README-ZH_CN.md](../README-ZH_CN.md)

## 全局选项

- `--debug`：在 CLI 退出时将当前日志文件路径输出到 `stderr`。
- `--lang <lang>`：为当前命令临时指定显示语言。支持的值：`en`、`zh`。
- `-h, --help`：显示当前命令的帮助信息。
- `-V, --version`：显示当前 CLI 版本、构建时间和 commit hash。

## 环境变量

CLI 读取以下环境变量以支持内置和自动化场景。真值为 `1`、`true`、`yes` 或 `on`
（大小写不敏感）。

- `OO_CONFIG_DIR`：覆盖配置根目录，其中包含 `auth.toml`、`connector.toml`、
  `settings.toml` 和 telemetry 数据（在未设置 `OO_DATA_DIR` 时也包含 `data`
  子目录）。优先级高于 `XDG_CONFIG_HOME`。
- `OO_DATA_DIR`：覆盖数据目录，其中包含本地缓存、上传和下载会话状态。默认值为
  `<配置根目录>/data`。
- `OO_OPEN_FLOW_COMMAND_DIR`：本地联调 Open Flow 时，让 `oo flow`
  使用指定的已展开命令产物目录。该目录必须包含 `entry.js`；Open Flow
  仓库的标准构建会将它写到
  `packages/open-flow/dist/command/open-flow-command`。未设置时，`oo flow`
  使用当前 `oo` 版本固定的 Open Flow release。
- `OO_OPEN_FLOW_URL`：用完整 HTTP(S) origin 选择自部署 Open Flow Server，例如
  `http://127.0.0.1:3000`。必须与 `OO_OPEN_FLOW_TOKEN` 同时设置；两者生效时，
  `oo flow` 不使用 OOMOL 账号、Team 或 `OO_ENDPOINT`。
- `OO_OPEN_FLOW_TOKEN`：自部署 Server 的 operator token，值应与该部署的
  `OPEN_FLOW_TOKEN` 相同。它只会作为 Bearer token 发往所选 origin 的
  `/v1/` API，并且必须与 `OO_OPEN_FLOW_URL` 同时设置。
- `OO_FLOW_PROJECT`：只为当前调用选择 Open Flow Project。它的优先级高于
  `oo flow project use` 按账号和 Team 保存的 Project，且不会写回配置。
- `OO_FLOW_ACCOUNT`：只为当前 `oo flow` 调用选择一个已保存账号，不修改
  `auth.toml` 中的 active account。值可以是精确账号 ID 或 `endpoint/name`；如果
  后者匹配多个账号，必须改用账号 ID。与 `OO_API_KEY` 同时设置时仍然后者优先。
- `OO_LOG_DIR`：覆盖 debug 日志目录。优先级高于所有平台默认值。
- `OO_API_KEY`：使用该 API key 执行命令，无需交互式登录。设置后 CLI 会构造一个
  内存账号，不读取、不要求、也不写入 `auth.toml`，且优先级高于任何已保存的账号。
  由于设置它之后任何已保存账号都不会生效，`oo auth logout`、`oo auth switch`、
  `oo team use` 会成为空操作并保持 `auth.toml` 不变；
  `oo auth login` 仍会保存账号，但会说明该变量的优先级高于它。`oo auth status`
  会展示该变量提供的身份。已保存的默认团队同样不会生效：该 key 可能属于另一个
  账号，因此除非设置了 `OO_TEAM_ID` 或 `OO_TEAM_NAME`，命令都不发送团队选择，
  由服务端套用默认团队。
- `OO_ENDPOINT`：基础域名（例如 `oomol.com` 或 `oomol.dev`），用于派生执行命令的
  所有服务 URL。它与 `OO_API_KEY` 搭配使用，会覆盖已保存账号的 endpoint（包括
  `oo auth status` 展示与校验所用的 endpoint），并决定 `oo auth login` 校验所用的
  endpoint。
- `OO_CONNECTOR_URL`：自部署 Connector 服务地址。它会覆盖 `oo connector login`
  保存的配置。只有 connector 相关命令（`oo connector
  search/schema/run/proxy/apps` 及顶层 `oo search`）会将请求路由到该地址；
  其他命令不会向它发送请求，但 `oo auth status` 与 `oo auth login`
  会展示该自部署 Connector 配置，需要账号的命令在未登录时的报错也会提及它。
- `OO_CONNECTOR_TOKEN`：与 `OO_CONNECTOR_URL` 搭配使用的可选 Runtime API
  令牌。未设置 `OO_CONNECTOR_URL` 时会被忽略。
- Connector 相关命令按以下优先级解析目标服务：
  `OO_CONNECTOR_URL` > `OO_API_KEY` > 已保存的自部署 Connector 配置
  （`oo connector login`）> 当前激活账号。
- `OO_TEAM_ID`：让团队相关命令（`oo connector run`、`oo connector proxy`、
  `oo connector apps`、`oo connector search` / `oo search`、
  `oo variables list/get/create/delete`，以及 `oo file upload`）以该 id
  对应的团队身份运行。优先级高于 `OO_TEAM_NAME` 和账号保存的默认团队；
  每次运行的 `--team` 标志仍然优先于它。执行前 CLI 会校验该 id 并解析出团队
  名称（每次调用多一个请求），因此请求会同时携带名称与 id；账号无法使用
  的 id——不是成员、团队不存在、团队已删除——以退出码 `1` 失败。若查询
  本身无法完成，则只按原样发送 id，由服务端裁决。connector 目标为自部署
  服务时，只有 connector 命令会忽略它；variables 命令始终遵循它。
- `OO_TEAM_NAME`：与 `OO_TEAM_ID` 相同，但按名称选择团队。执行前 CLI
  会通过账号的团队成员关系将名称解析为团队 id（每次调用多一个请求），
  因此请求会同时携带名称与 id；账号无法访问的名称以退出码 `1` 失败。
  若查询本身无法完成，则只发送名称，由服务端裁决。`oo connector run
  --dry-run` 不发送执行请求，也会完全跳过该查询，保持离线。设置了
  `OO_TEAM_ID` 时会被忽略；connector 目标为自部署服务时，只有 connector
  命令会忽略它，variables 命令始终遵循它。
- 团队相关命令按以下优先级解析团队身份：
  `--team` > `OO_TEAM_ID` > `OO_TEAM_NAME` > 当前账号保存的默认团队 >
  服务端默认团队。需要团队名称的命令 (`oo flow`、`oo team current`、
  `oo auth status`) 不信任本地保存的名称：有保存的默认团队时按团队 id 向后端
  刷新名称 (团队改名后仍可用)，没有保存时向后端询问它套用的默认团队；其他
  命令原样发送保存的选择，由服务端按 id 解析，没有选择时套用同一个默认团队。
  不存在按用户私有的作用域。
- `OO_SKILLS_SYNC_DISABLED`：设为真值会禁用启动时的 managed skill 同步，
  使 CLI 不会向 `~/.agents`、`~/.claude` 等代理主目录写入任何 skill 文件。
- `OO_NO_SELF_UPDATE`：设为真值会禁用 `oo update`、`oo install` 和
  `oo check-update`，并强制关闭 self-update 的 PATH 改写。

## Open Flow

### `oo flow [args...]`

运行当前 `oo` 版本固定的 Open Flow CLI release。首次调用会下载并验证对应的
不可变命令归档；之后直接离线复用已验证的本地缓存，不会在每次启动时检查更新。

- `flow` 后的全部参数都会原样传给 Open Flow；主 `oo` CLI
  不解析、不重排，也不把这些参数写入日志。
- 当前生效的 `oo --lang` locale 会以 `en` 或 `zh-CN` 传给 Open Flow；
  Open Flow 自己拥有并随版本发布对应的命令翻译文案。
- 因此 `oo flow --help` 和 `oo flow --version` 都属于 Open Flow 命令。
  如需在不加载 Open Flow 的情况下查看宿主侧命令说明，请使用 `oo help flow`。
- 根帮助和生成的 shell 补全始终会列出 `flow`，Hosted 与自部署模式一致。
- `--lang`、`--debug` 等 `oo` 全局选项必须放在 `flow` 前面；
  `flow` 后的选项归 Open Flow 所有。
- Open Flow 使用当前进程的工作目录、标准输入输出、环境变量和信号；
  它的退出码会直接成为 `oo` 的退出码。
- 未传入后续参数时，Open Flow 只打印帮助且不等待输入；stdin 和 stdout 都是
  TTY 时也保持相同行为。
- 只有归档长度和 SHA-256 与 `oo` 固定的 release 一致，且内部 manifest 和完整
  文件集合与该 release 相符时，下载内容才会被接受。Artifact 中记录的 Bun 构建
  版本不需要与 `oo` 使用的 Bun runtime 版本一致。
- Command Artifact v2 只包含 Control API CLI entry 和 license 文件，不包含
  Workbench assets、Deployment Runtime、skills 或本地 Project 实现。
- 缓存未命中时，交互式终端会在 stderr 原地刷新字节进度；非交互式输出会分别打印
  一行开始和完成信息。命中缓存时保持静默。
- `OO_OPEN_FLOW_COMMAND_DIR` 仅用于本地仓库联调；设置后会跳过下载和缓存解析。
- 默认情况下，Open Flow 子命令使用当前 `oo` 登录凭证和生效的 Team。Hosted
  gateway 由当前 endpoint 派生为 `https://open-flow.<endpoint>`；例如
  `OO_ENDPOINT=oomol.dev` 使用 `https://open-flow.oomol.dev`。
- 同时设置 `OO_OPEN_FLOW_URL` 与 `OO_OPEN_FLOW_TOKEN` 后，CLI 会改为直连该自部署
  Server。此模式不读取 OOMOL 账号或 Team，也不使用 `OO_ENDPOINT`；token 必须与
  Server 部署的 `OPEN_FLOW_TOKEN` 相同。
- `OO_FLOW_ACCOUNT=<account-id|endpoint/name>` 只为本次 Hosted Flow 调用选择已保存
  账号，同时使用该账号的 endpoint、Team 和已保存 Project context，不会修改全局
  active account；自部署变量生效时它不起作用。
- 凭据只附加到所选 origin 的 `/v1/` 请求。宿主会先删除 command artifact 提供的
  身份 header 和 Cookie，再写入 Hosted credential 与 Team selector，或 Server
  Bearer token。Connector 与 Trigger 操作仍通过 Control API，artifact 不直连它们的
  后端服务。
- `oo flow project use <project>` 会先通过所选部署验证 Project；Hosted 模式再按当前
  账号和 Team 保存其 ID。切换账号或 Team 后不会复用其他 scope 的 Project。
  `OO_API_KEY` 身份没有可持久化的账号 scope，因此应改用 `OO_FLOW_PROJECT`。
  自部署模式会按 Server origin 把选择结果保存在本地 CLI settings 中，不会写入
  OOMOL 账号。选择 current Project 后，后续 Flow 命令可以省略 `--project`；
  该选项只用于单次命令临时覆盖。
- 命令覆盖 Project 与 Flow authoring、节点、连线、CodeModule、
  Connector Task、Trigger、检查、Draft/Live Run、Publication、Rollback 和
  Workbench deep link。`--json` 输出带版本的机器格式，`--project <ID 或精确名称>`
  只覆盖当前命令的 Project。
- `oo flow inspect <flow>` 固定并读取一个不可变 Draft Revision，一次返回 Node、
  Task/CodeModule、Edge、Trigger 和该 Revision 的权威 check。`--summary` 保留同一份
  Edge、check 与 Revision 结构视图，但只返回紧凑的 Node/Trigger identity，不包含
  Code source、完整 Task 或完整 Trigger 对象。两种形式都不会执行用户代码或调用
  外部服务。
- `oo flow apply <flow> --file <path|-> [--expected-revision <revision>]` 接受
  version 1 的一次性 JSON authoring request，并用一次 Draft CAS 提交其中的所有新
  Node、Trigger 和 Edge。`nodes` 与 `triggers` 都使用 request-local reference 作为
  key。Trigger kind 支持 `webhook`、`cron` 与 `provider`；provider Trigger 使用
  `key`、可选 `connection`、`config`、`every` 或 `cron` 以及 `timezone`。Code Node
  的 `code` 可以是内联 JavaScript 或 `@path`；Connector Node 使用 `action`、可选的
  `connection`（支持 `default`）和可选 `inputs`。每条 Edge 包含 `source`、
  `output`、`target` 与 `input`；request-local Trigger 可以作为 `source`，其输出为
  `payload`。该 request 不是本地 Project 或 import 格式。apply 成功后会检查新
  Revision，但不会运行或发布。Connector add 与 apply 在 `connection` 省略或为
  `default` 时选择 Action 当前的 active default Connection；不存在默认连接时仍会
  保存未绑定的 Connector Node，JSON 输出不包含 `connectionId`。provider Trigger
  必须使用 active Connection。若写入已成功但最终 check 暂时不可用，输出仍会报告
  已接受的 Revision，并明确提示调用方不要重试 apply。
- `oo flow node add <flow> code <name> --code <javascript|@file|->` 在一个原子
  change set 中创建 Node、Task、CodeModule 和最终 source，并返回三个 opaque ID。
  `oo flow check` 只校验不可变 Revision；credential 当前是否可用以及 Connector 的
  真实副作用只会由显式 `oo flow run` 检查。
- `oo flow open [flow]` 会在系统浏览器打开所选部署的 Workbench，并同时输出 URL；
  `oo flow workbench [flow]` 只输出相同 URL，不打开浏览器，适用于脚本和 Agent
  内置预览。省略 `flow` 时打开 Flow 列表，提供 `flow` 时打开对应 Flow 的设计页。
  Hosted URL 会携带当前 CLI 账号的短期一次性网页登录 code，并限定在生效团队的
  当前名称下：账号保存的默认团队会按团队 id 刷新名称 (改名后仍可打开)，未保存时
  为后端报告的服务端默认团队 (与本次调用的 Cloud 请求作用于同一个团队)。保存的
  默认团队已不存在或已无权访问时命令以 `1` 退出并说明原因；未保存且后端未报告
  默认团队时命令失败，并提示使用 `oo login` / `oo team use <name>`。
  自部署 URL 直接指向 Server Workbench，由浏览器自行建立 operator session；
  operator token 不会写入 URL。
- 宿主 telemetry 只把本次委托记录为顶层命令 `flow`，并记录成功/失败和耗时；
  不记录委托的子命令、flags、Project/Flow ID、自由文本参数或命令输出。

本地仓库联调示例：

```bash
cd /path/to/open-flow
bun run --filter @oomol-lab/open-flow build

cd /path/to/oo-cli
OO_OPEN_FLOW_COMMAND_DIR=/path/to/open-flow/packages/open-flow/dist/command/open-flow-command \
  bun run index.ts flow --help
```

使用本地构建的 Open Flow 命令测试线上 dev Cloud（需要已登录 dev 账号及已选择 Team）：

```bash
OO_ENDPOINT=oomol.dev \
OO_OPEN_FLOW_COMMAND_DIR=/path/to/open-flow/packages/open-flow/dist/command/open-flow-command \
  bun run index.ts flow project list
```

连接自部署 Server：

```bash
export OO_OPEN_FLOW_URL=http://127.0.0.1:3000
export OO_OPEN_FLOW_TOKEN="$OPEN_FLOW_TOKEN"
oo flow
```

使用 `oo flow project use <project>` 可以按该 Server origin 记住 Project。
脚本可以使用 `OO_FLOW_PROJECT` 或 `--project` 做单次调用覆盖。

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
  - `--team <name>`：登录后将账号的默认团队身份设置为指定团队。该名称必须是
    当前账号的团队成员关系之一，否则命令以 `1` 退出（账号本身仍会被保存）。
    与三种登录方式均可组合。
- 默认团队：登录成功后，CLI 会获取账号的团队成员关系并把默认团队身份持久化到
  已保存的账号上。未传 `--team` 时，若账号已保存的默认团队仍在成员关系中则
  保留（并补齐其团队 id）；否则采用后端报告的服务端默认团队 (即不带团队
  选择的请求所作用的团队)。后端未报告默认团队时 (账号未创建过任何团队)，
  不会持久化任何内容，也不打印默认团队行，登录仍以 `0` 退出。否则成功输出会打印生效的
  默认团队（`当前默认团队身份：<name>`）；当账号拥有多个团队时，还会打印团队
  数量（最多列出 5 个名称，其余以省略号截断）以及使用 `oo team use <name>`
  切换的提示。未传 `--team` 且成员关系请求或默认团队查询失败时，登录仍以 `0`
  退出，并提示默认团队保持不变。设置了 `OO_TEAM_ID` / `OO_TEAM_NAME` 时默认值仍会被保存，
  但会提示 env 覆盖的优先级依然更高。
- 说明：如果已配置自部署 Connector（`oo connector login`），登录后 connector
  相关命令仍会继续使用它；成功输出会打印一行提示，说明可运行
  `oo connector logout` 切回 OOMOL。
- 设置了 `OO_API_KEY` 时，登录仍会校验并保存账号，但该变量的优先级依然高于它。
  成功输出会打印一行提示，说明取消 `OO_API_KEY` 后刚保存的账号才会生效。
- `OO_ENDPOINT` 决定三种登录方式（device login、session token、API key）校验所用
  的 host，保存的账号也会记录该 endpoint；未设置时使用公有默认值。

### `oo auth logout`

从持久化认证数据中移除当前账号。

- 设置了 `OO_API_KEY` 时，提供凭证的是该变量而非已保存账号，因此没有任何可登出的
  对象。命令以 `0` 退出，不修改 `auth.toml`，并说明没有登出任何账号。

### `oo auth status`

显示已保存的全部认证账号，并校验当前激活账号的 API key 状态。

- 别名：`oo auth info`。
- 展示的是命令实际生效的身份，它未必是当前激活的已保存账号：`OO_API_KEY`
  的优先级完全高于 `auth.toml`，`OO_ENDPOINT` 则会重定向已保存账号的 endpoint。
  展示的 endpoint 就是校验 API key 所使用的 endpoint。
- 设置了 `OO_API_KEY` 时，状态恒为 `logged-in`（`auth.toml` 中过期的 active id
  不再有影响），不会有任何已保存账号被标注 `[active]`，文本输出会说明已保存账号
  不会被使用。此时 `auth.toml` 仅作为账号列表的来源：文件缺失时不会被创建，
  文件无法读取时 `accounts[]` 为空而不是让命令失败。
- 无法读取的 `auth.toml` 不会让命令失败：status 会正常渲染报告，并输出一条
  指明该文件路径的警告，账号列表为空，退出码为 0。使用 `--format json` 时
  警告输出到 stderr，stdout 保持为合法 JSON。缺失的文件不会被创建。
- 文本输出会在 `Accounts:` 区块下列出所有已保存账号。当前激活账号会标注
  `[active]`，并额外显示其 `API key status`——通过一次 profile 请求向该账号
  对应的 endpoint 校验得到。其它账号不参与校验，所以已保存账号的数量不会影响
  发出的请求数。
- 当前身份区块还会显示一行「默认团队」，其解析方式与 `oo team current`
  相同：设置了 `OO_TEAM_ID` / `OO_TEAM_NAME` 时显示 env 覆盖值（并标注来源
  变量），否则显示当前账号保存的默认团队，都未设置时显示服务端默认团队
  （未保存默认团队）。设置了 `OO_API_KEY` 时，除非 `OO_TEAM_*` 变量选择了
  团队，否则该行恒为服务端默认团队。
- 当身份来自 `OO_TEAM_ID` 或 `OO_TEAM_NAME` 时，会查询补全缺失的那一半——id
  解析出名称，名称通过账号的团队成员关系解析出 id——该行显示为
  `<名称>（<id>）`。查询未成功时仍会显示 env 提供的值，并附上原因：当前账号
  不是该团队的成员、不存在该 id 对应的团队、该团队已被删除、或无法完成查询。
  查询失败既不会改变退出码，也不会影响所报告的 `API key status`。
  账号保存的默认团队也按同样方式查询：通过保存的 id (只有名称的默认团队则通过
  成员关系) 刷新，因此该行显示的是团队当前名称，无法确认时附上原因；未保存默认
  团队时则显示后端报告的服务端默认团队。
- 因此 `oo auth status` 最多发送 2 次请求：API key 校验，以及 1 次团队查询
  (env 选定的团队、保存的默认团队或服务端默认团队)。两者相互独立，并发发出。
- 文本和 JSON 输出都永远不会包含 API key 实际内容。
- 当配置了自部署 Connector（`oo connector login` 或 `OO_CONNECTOR_URL`）时，
  文本输出会额外显示一个自部署 Connector 区块，包含服务地址、是否已配置令牌
  以及配置来源。令牌内容永远不会被打印。
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

- 当配置了自部署 Connector 时，以上三种形态都可能额外携带一个可选的顶层
  `connector` 字段：

  ```json
  {
    "connector": { "url": "http://localhost:3000", "tokenConfigured": true, "source": "file" }
  }
  ```

- 当存在默认团队身份时，`oo auth status --json` 的输出——即上面的 `logged-in`
  形态——会携带一个可选的顶层 `team` 字段。`source` 表示由哪种机制选中
  (`env_id`、`env_name`、`account`，或 `backend_default`，即未保存默认团队时
  后端报告的服务端默认团队)，`status` 报告团队查询的结果：

  ```json
  {
    "team": { "name": "acme", "id": "team-7", "source": "account", "status": "valid" }
  }
  ```

  ```json
  {
    "team": {
      "name": "platform",
      "id": "019ed9dd-57b1-77eb-86b7-09724abe8037",
      "source": "env_id",
      "status": "valid"
    }
  }
  ```

  `backend_default` 来源下 `status` 恒为 `valid`；`account` 来源下它报告按 id
  刷新是否确认了保存的默认团队 (`valid`，或无法确认的原因)，显示的是团队当前
  的名称而不是登录时保存的名称。未尝试查询时为 `null`。env 选定的身份下取值为
  `valid`、`not_a_member`、`not_found`、`deleted`、`request_failed`、
  `request_failed_sandbox` 或 `no_credential` 之一。只有 `status` 为 `valid`
  时查询补全的那一半才有值——`env_id` 下补全名称，`env_name` 下补全 id——
  env 提供的那一半则始终存在。

- 当由 `OO_API_KEY` 提供凭证时，`oo auth status --json` 的输出恒为 `logged-in`
  形态，并携带一个可选的顶层 `envOverride` 字段：

  ```json
  {
    "status": "logged-in",
    "activeAccountId": "oo-env-override",
    "envOverride": { "endpoint": "oomol.dev", "apiKeyStatus": "valid" },
    "accounts": [
      { "id": "user-1", "name": "Alice", "endpoint": "oomol.com", "active": false }
    ]
  }
  ```

- 说明（JSON）：
  - **绝不**输出 `apiKey` 字段；JSON payload 在任何字段下都不包含实际 API key 字符串。
  - `accounts[]` 按原顺序列出本地 auth file 中保存的全部账号，每条 entry 为
    `{ id, name, endpoint, active, apiKeyStatus? }`。
  - `activeAccountId` 是当前激活账号 ID；无可用激活账号时（包括
    `active-account-missing` 状态）为 `null`。设置了 `OO_API_KEY` 时为稳定的
    合成 ID `oo-env-override`，它并非已保存账号，因此不会出现在 `accounts[]` 中。
  - `accounts[].active` 仅在激活账号上为 `true`；设置了 `OO_API_KEY` 时，
    所有 entry 均为 `false`。
  - `accounts[].apiKeyStatus` 只在激活账号 entry 出现，枚举为
    `valid` / `invalid` / `request_failed` / `request_failed_sandbox`。
  - `envOverride` 仅在设置了 `OO_API_KEY` 时出现，此时状态恒为 `logged-in`。
    它报告生效的 `endpoint`（来自 `OO_ENDPOINT`，否则为公有默认值）以及该环境
    凭证的 `apiKeyStatus`，枚举与 `accounts[].apiKeyStatus` 相同。API key
    实际内容永远不会被输出。
  - `accounts[].endpoint` 是 `auth.toml` 中保存的 endpoint。单独设置
    `OO_ENDPOINT`（不设 `OO_API_KEY`）会重定向文本输出与 API key 校验所用的
    endpoint，但不会改写该字段。
  - `team` 仅在 `logged-in` 形态且存在默认团队身份时出现。`source` 为
    `account`（账号保存的默认值）、`env_id`（`OO_TEAM_ID`）、
    `env_name`（`OO_TEAM_NAME`）或 `backend_default` (未保存默认团队时后端
    报告的服务端默认团队)。env 选定的身份会发送 1 次请求补全并校验
    缺失的那一半，因此成功时同时携带 `name` 与 `id`；查询未成功时保留 env
    提供的那一半，并由 `status` 说明原因。`account` 来源同样发送 1 次请求，
    按保存的 id 刷新 (只有名称的默认团队则通过成员关系补全)，因此 `name` 是
    团队当前名称，成功时 `id` 也会补齐；查询未成功时保留保存的值，并由
    `status` 说明原因。
  - `missingAccountId` 仅在 auth file 记录的 active id 已不存在于
    `accounts[]` 时出现。
  - `connector` 仅在配置了自部署 Connector 时出现，报告已配置的自部署
    Connector（`OO_CONNECTOR_URL` 覆盖优先于 `connector.toml`）：
    `url`、`tokenConfigured` 和 `source`（`env` / `file`）。注意：设置了
    `OO_API_KEY` 时，connector 命令会路由到托管的 OOMOL Connector 服务，
    而不是 `source: "file"` 的配置（只有 `OO_CONNECTOR_URL` 的优先级高于
    `OO_API_KEY`）。令牌内容永远不会被输出。`connector.toml`
    无法读取时该字段会被省略。
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
- 设置了 `OO_API_KEY` 时，任何已保存账号都不可能生效，因此切换不会改变后续命令
  的任何行为。命令以 `0` 退出，不读取也不重写 `auth.toml`，并说明没有切换任何
  账号。该行为在传与不传 `--user` 时一致，且优先于「没有已保存账号」的报错。
- 任何输出路径都不会将 API key 写入 stdout/stderr。

### `oo auth web`

生成一个短期有效的 URL，在浏览器中打开后即以当前账号登录 OOMOL 网站。
命令会在标准输出打印该 URL 以及使用提示、有效期和安全提醒，不会自动拉起浏览器。

- 需要凭证：当前激活的已保存账号或 `OO_API_KEY`。URL 由后端基于该凭证签发，
  在浏览器中打开即可直接登录同一账号，无需再次输入凭证。
- 选项：
  - `--redirect <url>`：登录完成后浏览器跳转的地址。必须是主机为当前账号
    endpoint 域名或其子域名的 `http(s)` URL（默认 endpoint 下即 `oomol.com`
    与 `*.oomol.com`）。跨环境地址会被拒绝：endpoint 为 `oomol.dev` 时，
    跳转到 `oomol.com` 会以 `2` 退出。默认为该 endpoint 的控制台
    `https://console.<endpoint>/`。不允许的值会以 `2` 退出，且不会请求后端。
- URL 中携带一个短期有效的登录码，会在后端返回的秒数（当前为 300）后失效。
  失效前任何打开它的人都会登录该账号，请将此 URL 视为机密信息。
- JSON 输出（`--json`）：

```json
{
  "expiresIn": 300,
  "url": "https://api.oomol.com/v1/auth/session_code/exchange?redirect=https%3A%2F%2Fconsole.oomol.com%2F&session_code=..."
}
```

### `oo login`

`oo auth login` 的别名。支持相同的 `--session-token <session-token>`、
`--api-key <api-key>` 与 `--team <name>` 选项。

### `oo logout`

`oo auth logout` 的别名。

## 团队

团队身份决定团队相关命令以哪个团队运行：包括 connector 命令
（`oo connector run`、`oo connector proxy`、`oo connector apps`）、variables
命令（`oo variables list/get/create/delete`，其数据本身就归团队所有），以及
`oo file upload`（上传按该团队计费与计量）。它由同一条优先级阶梯选出：先是每次
运行的 `--team <name>`，其次是环境变量 `OO_TEAM_ID` / `OO_TEAM_NAME`，最后是
保存在当前账号上的默认团队。没有任何一项选中团队时，命令不发送团队选择，由服务端
套用该账号的默认团队。下列命令用于发现当前账号可用的团队并管理该默认值。

默认团队属于已保存的账号：用 `oo auth switch` 切换账号时默认团队随之切换，
`oo auth logout` 会连同账号一起移除它。旧版本把默认团队保存在全局配置项
`identity.team` 中；CLI 会在下一次运行时把该值迁移到当前账号并删除该配置项。
设置了 `OO_API_KEY` 时不会应用任何已保存的默认团队——请改用 `OO_TEAM_ID` /
`OO_TEAM_NAME`。

`oo team list` 与 `oo team use` 需要向 OOMOL 查询团队成员关系，因此需要 OOMOL
账号；当仅配置了自部署 Connector 时不可用。`oo team current` 不受此限制：它只读
本地状态，且只在有账号可用时才额外查询团队名称来丰富输出。

`oo auth login`（及其别名 `oo login`）会自动持久化该默认值：账号上仍然有效的
默认团队会被保留，否则采用后端报告的服务端默认团队 (后端有报告时)；也可通过
`--team <name>` 显式指定。

### `oo team list`

列出当前活动账号可认证的团队。该命令是只读的。

- 选项：`--format=json` 与 `--json` 输出 JSON 数组。
- 输出：JSON 条目包含稳定的 CLI 字段 `name`、`id`、`role`、`current`。`role` 为
  `creator` 或 `member`。`current` 对 connector 命令默认使用的团队为 `true`：
  设置了 `OO_TEAM_ID`（按 id 匹配）或 `OO_TEAM_NAME`（按名称匹配）时为
  env 指定的团队，否则为与账号默认团队匹配的团队。
- 输出：将 `name` 的值传给 `--team <name>`（或 `oo team use <name>`），将 `id`
  的值传给 `OO_TEAM_ID`。
- 输出：文本输出为每个团队打印一行列对齐的记录，并标出当前默认团队。当账号没有任何
  团队时，会提示团队相关命令不会发送团队选择。
- 行为：当账号保存的默认团队缺少团队 id 时，该命令会用刚获取的成员关系列表补齐
  它，不发送额外请求；写入失败会被忽略。

### `oo team current`

显示未传 `--team` 时团队相关命令（connector、variables、file upload）使用的
团队身份：设置了 `OO_TEAM_ID` / `OO_TEAM_NAME` 环境变量时为 env 指定的团队，
否则为当前账号保存的默认团队。两者都未设置时，命令不发送团队选择，由服务端
套用它自己的默认团队。

- 发送 1 次请求，以团队当前名称报告身份：env 选定的身份补全并校验缺失的那一半
  (id 解析出团队名称，名称通过账号的团队成员关系解析出 id，这与 connector 命令
  执行前的检查相同，因此该命令报告的身份就是实际运行会使用的身份)，保存的默认
  团队按保存的 id 刷新 (只有名称的默认团队则通过成员关系补全)，未保存时由后端
  报告它套用的服务端默认团队。
- 无 OOMOL 账号时同样可用：此时跳过查询而不是让命令失败，只单独展示 env
  提供的值。
- 选项：`--format=json` 与 `--json` 输出 JSON 对象。
- 输出：JSON 为 `{ "team": <name|null>, "teamId": <id|null>, "source":
  <"env_id"|"env_name"|"account"|"backend_default"|null>, "status":
  <status|null> }`。`source` 表示团队由哪种机制选定：未保存默认团队且后端
  报告了它套用的服务端默认团队时为 `backend_default`；后端未报告 (账号未创建
  过任何团队) 或该查询失败时为 `null`。`team` 是团队当前的名称：有保存的默认
  团队时按 id 刷新 (只有名称的默认团队则通过成员关系补全)，因此改名后的团队
  会以新名称报告，本地保存的值保持不变。`status` 报告团队查询的结果：未尝试
  查询时为 `null`（`--dry-run` 这类离线路径），`backend_default` 来源恒为
  `valid`，否则为 `valid`、`not_a_member`、`not_found`、`deleted`、
  `request_failed`、`request_failed_sandbox` 或 `no_credential` 之一；account
  来源下非 `valid` 的状态会保留保存的名称与 id，文本输出末尾附上原因。
- 输出：`OO_TEAM_ID` / `OO_TEAM_NAME` 生效且两项信息都已知时，文本输出显示
  `<名称>（<id>）`。查询未成功时仍会显示 env 提供的值并附上原因，命令依然以
  `0` 退出。
- 输出：设置了环境变量时，文本输出会指明变量名，并说明账号保存的默认团队在
  覆盖生效期间不会被使用。

### `oo team use <name>`

在确认当前活动账号可访问后，将默认团队身份设置为 `<name>`。

- 参数：`<name>` 为团队名称，取值见 `oo team list`。
- Shell 补全：生成的 Bash、Zsh 与 Fish 补全脚本会提示当前账号可访问的团队名称。
  成员关系列表按账号和 endpoint 缓存最多一分钟；查询失败时不提供候选项。
- 行为：会用账号可访问的团队校验该名称；无法访问的名称以退出码 `1` 拒绝，且默认值保持
  不变。成功时把团队名称与 id 保存到当前账号上。
- 行为：设置了 `OO_TEAM_ID` / `OO_TEAM_NAME` 时，默认值仍会保存，但输出会说明该
  环境变量在取消之前持续优先于它。
- 行为：设置了 `OO_API_KEY` 时命令不保存任何内容，以 `0` 退出，并说明该变量没有
  可保存的默认团队。

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
  它设置 `oo connector run`、`oo connector proxy`、`oo connector apps` 和
  `oo connector search` / `oo search` 在未传 `--team`、且未
  设置 `OO_TEAM_ID` / `OO_TEAM_NAME` 环境变量时使用的默认团队身份。

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
  `oo skills add`，让 bundled skills 刷新到已安装的 CLI 版本。
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
  staging 与 locks，以及 bundled skills。
- 默认保留：不动 PATH 配置；registry skills、local skills、以及任何不受 oo
  管理的同名目录都保留；用户数据仅在 `--purge` 时删除。
- skill 安全规则：仅当 `.oo-metadata.json` 能证明 oo 所有权（`kind: "bundled"`，
  或 `kind: "registry"` 且在 `--purge` 下）时才删除。metadata 缺失、损坏、local
  或不匹配的目录一律不删，因此用户手写的同名 skill 是安全的。
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
- 选项：`--format=json` 和 `--json` 会输出匹配 action 条目的 JSON 数组。
- 选项：`--team <name>` 以指定团队身份报告每条结果的 `authenticated` 状态。
  省略时有效身份依次取 `OO_TEAM_ID` / `OO_TEAM_NAME`、当前账号保存的默认团队，
  最后回退到服务端默认团队。
- 输出：每条结果都会包含 `authenticated` 和 `accessStatus`。
- 输出：JSON 条目只包含稳定的 CLI 字段：`service`、`name`、`description`、
  `authenticated` 和 `accessStatus`。`accessStatus` 的值为 `available` 或
  `connection_required`。
- 输出：文本输出会为每个 action 打印一个块，包含 service/action 标识、可选
  描述、认证状态和访问状态。
- 说明：action 列表本身与身份无关，每条结果的 `authenticated` 和
  `accessStatus` 字段反映有效身份下的已连接应用；因此团队下的连接只有当该团队为
  有效身份时才会影响这两个字段。
- 说明：使用 `oo connector schema "<service>.<action>"` 查看选中 action 的
  contract。
- 说明：搜索结果附带 schema 数据时还会更新本地 action schema 缓存，因此随后
  对返回 action 执行 `oo connector schema` 通常直接由本地缓存应答，无需重新
  请求 metadata。

### `oo connector schema <actionId...>`

显示一个或多个 connector action 的稳定 schema contract。

- 参数：`<actionId...>` 为一个或多个 `<service>.<action>` 形式的 action 标识，
  例如 `cal.create_schedule`。
- 选项：`-a, --action <action>` 用于指定 action 名称，并将唯一的位置参数视为
  纯服务名。该旧写法为向后兼容而保留：只接受一个纯服务名，并会拒绝额外的
  位置参数以及 `<service>.<action>` 形式。
- 选项：`--refresh` 会直接从 connector metadata API 获取最新 schema。
- 选项：`--format <format>` 与 `--json` 为与其他命令保持一致而接受；命令始终
  输出 JSON。`--show-schema-version` 会按共享的 JSON 输出约定加入
  `schemaVersion` 字段。
- 输出：当只请求一个 action 时，命令输出 JSON 对象，包含稳定 CLI 字段
  `service`、`name`、`description`、`inputSchema` 和 `outputSchema`，指定
  `--show-schema-version` 时该对象会获得顶层 `schemaVersion` 字段；当请求两个
  或更多 action 时，则按请求顺序输出这些对象组成的 JSON 数组，指定
  `--show-schema-version` 时数组会按共享约定包装为
  `{ "schemaVersion": "1.0.0", "items": [...] }`。
- 说明：`--refresh` 会强制为每个选中的 action 重新获取 schema。
- 说明：此前查询或 connector 搜索缓存的 schema 会在过期前被复用；需要
  最新远端 contract 时请使用 `--refresh`。

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
- 选项：`--connection-name <connection-name>` 使用指定 connector app 连接名称
  运行该 action。可用 `oo connector apps <serviceName>` 查看可用连接名称。
- 选项：`--wait` 会轮询选中的 action，直到进入终态。只有选中 action 的
  schema 声明了异步结果 lifecycle 时，这个选项才有效。
- 选项：`--wait-result` 会提交异步 submit action，然后轮询它配置的结果
  action。只有选中 action 的 schema 声明了异步 submit lifecycle 时，这个选项才有效。
- 选项：`--team <name>` 以指定团队身份运行该 action。省略时，若设置了
  `OO_TEAM_ID` / `OO_TEAM_NAME` 则使用 env 选定的团队，其次使用
  当前账号保存的默认团队，否则使用服务端默认团队。
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
  `errorCode`，也会一并输出；两者都缺失时，会输出原始响应体（已去除首尾空白
  并限制长度），以免丢失失败详情。
- 说明：命令会在执行前根据选中 action 的 contract 校验输入。
- 说明：text 模式下等待 async result action 时，交互式终端会在 stderr
  显示进度。JSON 输出不会混入进度文本。
- 说明：面向自部署 Connector 时，传入 `--team` 会被拒绝（exit `2`），
  账号保存的默认团队和 `OO_TEAM_ID` / `OO_TEAM_NAME`
  环境变量会被忽略。
  由于自部署 runtime 不提供异步 lifecycle contract，`--wait` 和
  `--wait-result` 会以现有的“不支持”错误失败。

### `oo connector apps [serviceName]`

按当前生效身份列出已连接的 connector app。该命令只读。

- 参数：`[serviceName]` 可选。省略时列出所有 provider 下已连接的 app；提供时仅列出
  该服务的 app。
- 选项：`--team <name>` 以指定团队身份列出已连接的 app。省略时，若设置了
  `OO_TEAM_ID` / `OO_TEAM_NAME` 则按 env 选定的团队列出，其次按
  当前账号保存的默认团队列出，否则按服务端默认团队列出。
- 选项：`--format=json` 和 `--json` 会输出 JSON 数组。
- 输出：JSON 条目包含稳定 CLI 字段 `service`、`connectionName`、`displayName`、
  `accountLabel`、`status`、`authType`、`isDefault` 和 `scopes`。不会包含
  app id 字段。
- 输出：当 app 没有连接名称时，JSON 输出使用 `null`，文本输出显示 `-`。
- 输出：文本输出每个 app 一行，列对齐。跨全部 provider 的列表以 `Service` 列开头；
  单服务列表则省略该列，因为服务已由参数固定。在支持颜色的终端上，状态列与默认列会
  着色；管道输出或 `NO_COLOR` 下为纯对齐文本。
- 说明：可将列出的 `connectionName` 值传给
  `oo connector run <serviceName> --connection-name <connection-name>`。
- 说明：对自部署 Connector，`--team` 会以退出码 `2` 拒绝，已配置的
  账号保存的默认团队和 `OO_TEAM_ID` / `OO_TEAM_NAME` 环境变量会被忽略。

### `oo connector proxy <serviceName>`

通过已连接的 connector app 代理 provider API 请求。

- 参数：`<serviceName>` 为服务名。
- 选项：`-d, --data <data>` 接收完整 proxy request JSON object，或使用
  `@路径` 读取 JSON 文件。对象形状为
  `{ endpoint, method, query?, headers?, body? }`。
- 选项：`--input <data>` 是 `--data <data>` 的 alias。
- 选项：未传 `--data` 时，使用 `--endpoint <endpoint>` 和
  `--method <method>`，以及可选的 `--query <json>`、`--headers <json>`、
  `--body <json>` 组装同样的 request object。`--data` 形式不能与这些拆分
  request 选项同时使用。
- 选项：`--endpoint` 是相对于 provider proxy base URL 的 provider endpoint
  path，或允许的绝对 HTTPS URL。
- 选项：`--method` 必须是 `GET`、`POST`、`PUT`、`PATCH` 或 `DELETE`，大小写不敏感。
- 选项：`--query` 必须是 JSON object，值只能是 string、number、boolean 或
  `null`。
- 选项：`--headers` 必须是 string 值的 JSON object。认证 header 会由
  connector service 根据已连接 app 注入；调用方不应通过 CLI 选项传 provider
  credential。
- 选项：`--body` 会按 JSON 解析。如需发送文本 body，请传 JSON string，例如
  `"hello"`。
- 选项：`--team <name>` 以指定团队身份运行该 proxy 请求。省略时，若设置了
  `OO_TEAM_ID` / `OO_TEAM_NAME` 则使用 env 选定的团队，其次使用
  当前账号保存的默认团队，否则使用服务端默认团队。
- 选项：`--format=json` 和 `--json` 会输出 JSON 对象。
- 输出：JSON 输出保持稳定结构
  `{ data: { status, headers, data }, meta: { executionId, service } }`。
- 错误：stderr 会打印 connector proxy HTTP 状态；如果失败响应提供了
  `message` 和 `errorCode`，也会一并包含；两者都缺失时，会输出原始响应体
  （已去除首尾空白并限制长度），以免丢失失败详情。
- 说明：`oo connector proxy` 不使用 connector action schema 或 schema cache。
  当选中的 connector 支持 proxy execution 且没有专用 connector action 时使用。
- 说明：面向自部署 Connector 时，传入 `--team` 会被拒绝（exit `2`），
  账号保存的默认团队和 `OO_TEAM_ID` / `OO_TEAM_NAME`
  环境变量会被忽略。proxy execution 取决于服务端支持；开源 runtime
  目前会返回错误。

### `oo connector login <url>`

校验并保存一个自部署 Connector 服务，使 connector 相关命令改用该服务，而不再
使用 OOMOL 托管的 Connector。

- 参数：`<url>` 为自部署 Connector 服务地址，例如 `http://localhost:3000`。
- 选项：`--token <token>` 指定该服务的 Runtime API 令牌（在服务的 `/access`
  页面创建）。
- 输出：文本输出会确认已连接的服务地址、报告令牌是否通过验证，并提示可在
  `<url>/access` 管理 Runtime Token。
- 说明：命令会先通过服务的健康检查端点校验该服务，然后才保存配置。登录成功后，
  所有 connector 相关命令——`oo connector search/schema/run/proxy/apps` 及
  顶层 `oo search`——都会改用该服务，而不再使用 OOMOL 托管的 Connector。
- 说明：当服务接受未认证请求时，传入的令牌无法被验证；配置仍会被保存，并
  打印一条提示。
- 说明：当没有登录 OOMOL 账号且未设置 `OO_API_KEY` 时，命令会打印一条提示，
  说明非 connector 命令仍需要 `oo auth login`。
- 错误：无效 URL（非 http(s) URL）或无效令牌（为空、或包含空白/控制字符）以
  `2` 退出。服务不可达、返回 HTTP 401、或返回非预期/非 Connector 响应时以
  `1` 退出；401 错误会附带在 `<url>/access` 创建 Runtime Token 的提示。

### `oo connector logout`

移除已保存的自部署 Connector 配置。

- 参数：无。
- 输出：文本输出会确认断开了哪个服务。除非仍设置了 `OO_CONNECTOR_URL`，否则
  connector 相关命令回落到当前激活的 OOMOL 账号。
- 说明：当没有配置自部署 Connector 时，命令打印一条提示而不会失败。
- 说明：命令只移除已保存的配置；`OO_CONNECTOR_URL` 环境变量不受影响。
- 说明：损坏的 `connector.toml` 也会被一并清除，因此 `oo connector logout`
  总能保证配置被移除。

## Search

### `oo search <text>`

使用一个自由文本查询搜索 connector action。

- 参数：`<text>` 为语义搜索文本。
- 选项：`--format=json` 和 `--json` 会输出匹配 action 条目的 JSON 数组。
- 选项：`--team <name>` 以指定团队身份报告每条结果的 `authenticated` 状态。
  省略时有效身份依次取 `OO_TEAM_ID` / `OO_TEAM_NAME`、当前账号保存的默认团队，
  最后回退到服务端默认团队。
- 输出：每条结果都会包含 `authenticated` 和 `accessStatus`。
- 输出：JSON 条目只包含稳定的 CLI 字段：`service`、`name`、`description`、
  `authenticated` 和 `accessStatus`。`accessStatus` 的值为 `available` 或
  `connection_required`。
- 输出：文本输出会为每个 action 打印一个块，包含 service/action 标识、可选
  描述、认证状态和访问状态。
- 说明：action 列表本身与身份无关，每条结果的 `authenticated` 和
  `accessStatus` 字段反映有效身份下的已连接应用；因此团队下的连接只有当该团队为
  有效身份时才会影响这两个字段。
- 说明：使用 `oo connector schema "<service>.<action>"` 获取完整 connector
  action contract。
- 说明：搜索结果附带 schema 数据时还会更新本地 action schema 缓存，因此随后
  对返回 action 执行 `oo connector schema` 通常直接由本地缓存应答，无需重新
  请求 metadata。

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
- 不可用的 Agent 目录：如果某个受支持 Agent 的 skill 目录路径被 `oo` 无法在其上
  创建目录的东西占用（例如目标已被删除的软链接，或一个普通文件），该 Agent 会被
  跳过，其余 Agent 仍正常安装；`oo info` 仍会列出该 Agent，便于发现损坏路径。
- 共享 Agent 目录：如果多个受支持 Agent 的 skill 目录指向同一个位置（例如
  `~/.claude/skills` 软链接到 `~/.agents/skills`），它们会被视为同一个 host：
  skill 只安装一次，并归属到更具体的 Agent，即通用 `~/.agents` host 让位于与
  它共享目录的已检测 Agent。
- 迁移：启动同步不会改写同版本的历史软链接目标。请用 `oo skills add` 刷新内置
  skill，用 `oo skills update` 刷新 registry skill，从而显式替换历史软链接。成功
  的 `oo install` / `oo update` 会运行这两个维护步骤。
- 安全规则：启动同步不会请求 registry，不要求登录，不会产生额外命令输出，也
  不会覆盖不由 `oo` 管理的同名目标。空的目标目录不含任何 skill，因此会像缺失
  目标一样被直接填充。

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
- 生成的 `SKILL.md` frontmatter 包含嵌套的 `metadata.title` 和
  `metadata.icon`。未提供 `--title` 时，标题会从 skill id 生成。未提供
  `--icon` 时，会使用通用本地工作流 icon。
- 生成的 `SKILL.md` 正文包含用于描述本地工作流适用场景、输入、执行、结果处理和失败处理的可编辑占位章节。
- 元数据：创建出的 skill 目录会包含 `.oo-metadata.json`，用于标记该 skill 是由
  `oo` 管理的 local skill。
- 选项：`--icon <icon>` 将非空 icon 引用写入生成的 `SKILL.md` frontmatter
  `metadata.icon`。值可以是 emoji、图片 URL，或 `:collection:icon:` 格式，
  其中 `collection` 和 `icon` 是 <https://icones.js.org/> 上的名称。
- 选项：`--title <title>` 将 `metadata.title` 写入生成的 `SKILL.md`
  frontmatter。
- 目标目录：skill 会创建在所选 Agent 的 `<agent-home>/skills/<skill-id>`。
- 发布方式：命令不会把新的 local skill 复制到其他 Agent。
- 失败行为：如果所选 Agent home 不存在，或目标目录已经存在，命令会在写入 skill
  前以非零状态退出，并提示已有工作流目录可以使用 `oo skills adopt`。
- 输出：文本输出会打印已初始化的 skill id 和目标路径。

### `oo skills adopt <path>`

将已有本地工作流目录转换为由 oo 管理的本地 skill，并且不覆盖工作流实现。

- 参数：`<path>` 必须是已存在的目录。相对路径从当前工作目录解析。
- Skill id：提供 `--name <name>` 时，该值会规范化为小写 hyphen-case，并用作
  skill id 和 frontmatter `name`。未提供时，命令优先使用已有 `SKILL.md`
  frontmatter `name`，否则使用源目录名。
- 选项：`--agent <agent>` 选择 Agent skill 目录。可选值为 `universal`、
  `claude`、`hermes`、`codebuddy`、`workbuddy`、`trae`、`trae-cn`、
  `openclaw`、`qoderwork` 和 `deepseek-tui`。
- 目标行为：不带 `--agent` 时，命令在 `<path>` 原地接管。带 `--agent` 时，如果
  `<path>` 已经是所选 Agent 的 `<agent-home>/skills/<skill-id>` 目录，命令原地
  接管；否则先将已有目录复制到该目标路径，再接管。源目录不会被删除。
- 内容行为：已有工作流文件会被保留。已有 `SKILL.md` 正文会被保留；命令只 patch
  skill 契约需要的 frontmatter 字段。如果缺少 `SKILL.md`，命令会创建包含本地工作流
  占位章节的文件。
- 描述：`--description <text>` 写入 frontmatter `description`。只有当已有
  `SKILL.md` 没有非空 frontmatter `description` 时才必填。
- 展示元数据：`--title <title>` 写入 `metadata.title`，`--icon <icon>` 写入
  `metadata.icon`。未提供时会保留已有嵌套 metadata；如果存在顶层 `title` 或
  `icon`，会复制到嵌套 `metadata`；否则使用默认展示元数据。
- 元数据：接管后的 skill 目录包含 `.oo-metadata.json`，用于标识该 skill 是由
  oo 管理的 local skill。
- 安全规则：如果目录的 `.oo-metadata.json` 标识 bundled 或 registry skill，或
  oo metadata 无效，命令会拒绝接管。带 `--agent` 时，如果不同的目标目录已存在，
  命令会拒绝覆盖。
- 校验：写入 skill 契约和 local metadata 后，命令会校验接管后的 skill 目录，并将
  warning 打印到 stderr。
- 输出：文本输出会打印已接管的 skill id 和目标路径。

### `oo skills validate <path>`

按照通用 skill 契约校验本地 skill 目录。

- 参数：`<path>` 是包含 `SKILL.md` 的 skill 目录。
- 校验：`SKILL.md` frontmatter 必须是字典，并包含字符串 `name` 和非空字符串
  `description` 字段。
- 校验：嵌套的 `metadata` 可以省略；如果提供，则必须是字典。嵌套的
  `metadata.icon` 和 `metadata.title` 可以省略；如果提供，则必须是非空字符串。
- 警告：缺少 `metadata.icon` 或 `metadata.title` 会打印 warning，但不会导致校验失败。
  如果存在顶层 `icon` 或 `title`，但缺少嵌套的 `metadata.icon` 或
  `metadata.title`，warning 会说明顶层字段不等同于展示元数据。
- 输出：成功时命令会打印简短成功消息。失败时打印校验错误并以非零状态退出。

### `oo skills publish <path>`

将一个 skill 转换为 OOMOL 包，并执行发布步骤。

- 参数：`<path>` 必须是包含 `SKILL.md` 的 skill 目录，或 `SKILL.md` 文件本身。
  相对路径会从当前工作目录解析。该命令不解析裸 skill id；需要时请先使用
  `oo skills locate <skill-id>`。
- 选项：`--visibility <visibility>` 设置 registry 包可见性。可选值为
  `private` 和 `public`。省略时，已有包会沿用当前 registry 可见性。如果无法读取
  已有可见性，交互式终端会询问发布为 `private` 还是 `public`；非交互式首次发布
  必须传入 `--visibility private` 或 `--visibility public`。
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
  提示词会要求对方先按通用说明检查 OO CLI 和登录状态，再执行安装命令。skill 目标
  和 package 目标都会给出相同形式的安装命令：公开包为
  `oo skills install <packageName>`，私有包为
  `oo skills install <packageName>#<shareID>`。私有包提示词会突出展示必须精确
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

### `oo skills install [packageName...]`

将内置或已发布 skill 安装到受支持的本地 skill 目录。

- 别名：`oo skills add [packageName...]`。
- 参数：`[packageName...]` 接受零个或多个 package 名称。
- 参数：未提供时，该命令会安装全部内置 skill。
- 参数：传入多个 package 名称时，会按顺序逐个安装；若后面的 package 失败，
  之前已完成的安装会保留。
- 参数：当某个 package 名称为 `oo`、`oo-find-skills`、`oo-create-skill` 或
  `oo-publish-skill` 时，命令安装对应的内置 skill。
- 参数：当某个 package 名称为已发布 package 名称时，命令从该 package 中
  安装 skill。package 名称可以包含显式版本，格式为
  `<packageName>@<version>`，也支持 `@scope/name@1.2.3` 这类 scoped package
  形式。
- 参数：package 名称也可以使用 `<packageName>#<shareID>`。这种形式会从
  `<packageName>` 读取 package 的 skill 列表，并通过 `<shareID>` 对应的 share
  下载 package 归档。
- 行为：命令默认安装每个 package 中的**全部**已发布 skill；可选的
  `-s, --skill` 过滤会收窄实际安装的 skill。
- 选项：`-s, --skill <skills...>` 将安装限定为指定的 skill。该选项可选，可传多个
  值（例如 `-s foo bar`）。匹配大小写不敏感，可用 skill 名称或其目录名。未匹配到
  任何 skill 的名称会被忽略。传入多个 package 时，过滤会跨所有 package 生效：某个
  package 没有任何被请求的 skill 时会被**静默跳过**；只有当**所有** package
  （对于无参的内置安装，则是任一内置 skill）都不匹配任何请求名称时，命令才会失败
  并列出可用的 skill。显式命名的内置 skill 本身已是单 skill 选择，不会再被
  `--skill` 收窄。
- 选项：由于 `-s, --skill` 接受多个值，请把所有 package 名称放在它**之前**
  （例如 `oo skills install @scope/pkg -s foo bar`）。`--skill` 之后、直到下一个
  选项（如 `--json`）之前的 token 都会被当作 skill 名称，而非 package 名称。
- 选项：`-f, --force` 在目标目录存在同名 skill 但**不受 oo 管理**（没有有效的
  `oo` 元数据）时，允许覆盖安装。覆盖会先移除原目录内容再写入新
  skill，并以 `warn` 日志记录此事件。`--force` **不会**绕过路径校验、
  package 校验、auth 或下载校验；**不影响**启动自动同步、`oo skills update`、
  `oo skills sync`、`oo skills uninstall`、`oo skills publish`。
- 选项：`--out-dir <dir>` 会将 skill 释放到 `<dir>`，而不是安装到本地 AI Agent
  的 skill 目录。这是一个纯导出操作：只在 `<dir>` 内写入文件，不会改动 oo 的受管
  存储，也不会改动任何 Agent 的主目录。每个被选中的 skill 写入到
  `<dir>/<skill-id>/`；已存在的 `<dir>/<skill-id>` 目录会被替换，而 `<dir>` 中的
  其他内容保持不变。导出的 skill 仅以 skill id 作为目录名，因此当多个被选中的
  skill 解析到同一个 id（跨多个 package，或 registry skill 与内置 skill 同名）时，
  后写入者会覆盖先前的导出。内置 skill 与已发布的 registry package 都可以导出：
  内置 skill 名称（或无参形式）会离线生成，已发布的 package 名称则会被下载、解压
  并以其发布形态写入。registry 导出会携带当前账号的 `Authorization` 头。`-s, --skill` 过滤
  会缩小每个 registry package 导出的 skill，以及无参形式下导出的内置 skill；显式
  传入内置 skill 名称则只导出该 skill。`--force` 在导出模式下无效。
- 选项：`--agent-format <agent>` 选择导出内置 skill 的渲染格式，且仅在与
  `--out-dir` 一起使用时生效；不带 `--out-dir` 使用它会失败。它不会改变导出的
  registry skill，后者始终以发布形态写入。默认值为 `universal`（即
  `~/.agents` 格式）。可选值为 `universal`、`claude`、`hermes`、`codebuddy`、
  `workbuddy`、`trae`、`trae-cn`、`openclaw`、`qoderwork`、`deepseek-tui`。
- 输出：使用 `--out-dir` 时，命令会输出已导出的 skill 及其目标目录；`--json` /
  `--format json` 会输出 `command: "skills.install.export"` 的导出报告，列出每个已
  导出 skill 的 `kind`（`bundled` 或 `registry`）、来源 `packageName`（内置 skill
  为 `null`）、`path` 与写入的 `files`，以及解析后的 `agentFormat` 和
  `outputDirectory`。当请求的 registry package 无法导出时，失败会记录在报告的
  `errors[]` 中，命令以退出码 `1` 结束。同一 package 中在后续 skill 失败之前已
  导出的 skill 仍会列入报告的已导出 skill 列表，此时状态为 `partial-failure`。
- 路径规则：使用 `--out-dir` 时，registry skill 名仅在其为单个安全路径段、且保持
  在输出目录内时才被接受；否则导出会在下载或写入任何内容之前以 `invalid_path`
  拒绝。
- 输出：非交互安装成功时，会按已安装 skill 和目标 AI Agent 聚合输出精简摘要；
  当实际只写入一个目标时，摘要会包含该目标路径。传入多个 package 时，每个
  package 会按顺序各自输出摘要。
- 说明：如果 package 发布了多个 skill，命令会全部安装；如果只发布了一个
  skill，则安装那一个。
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
  记录当前 `oo` 版本；registry metadata 记录来源 package 与 package 版本。旧版本
  留下的、缺少 schema version 标记的 metadata 文件不再被识别为 `oo` metadata。
- 说明：安装已发布 skill 时，所有 registry 请求都会携带当前激活账号的
  `Authorization` header。
- 说明：如果同名目标目录没有有效的 `oo` 元数据，会被视为非 OOMOL skill；该
  skill 的安装会以 `name_conflict` 失败，除非使用 `--force`（会覆盖它）。如果同名
  skill 已由 `oo` 管理，则会被覆盖，即使它来自另一个 package。空目录里没有任何
  skill，因此不构成冲突：安装会直接写入，并报告 `previousState: "absent"`。
- 说明：只要通用 `~/.agents` host 的 skill 目录能被创建，它就始终可用（该目录缺失
  时自动创建），因此命令通常至少有一个安装目标。只有当 `~/.agents/skills` 被
  `oo` 无法在其上创建目录的东西占用时它才会被排除；如果因此没有任何可用 host，
  命令会报告 `no_supported_hosts`。
- 说明：只有当 bundled 或 registry skill 的 `.oo-metadata.json` 能识别对应来源
  时，`oo` 才会认为这是自己管理的安装；否则会视为其他 skill，并拒绝覆盖。
- 选项：`--json` / `--format json` 输出结构化 payload（见下方"mutation 命令的
  JSON 输出"）。
- `error.code` 枚举（install JSON）：`not_authenticated` / `no_supported_hosts`
  / `invalid_path` / `invalid_package_specifier` / `package_lookup_failed`
  / `package_download_failed` / `invalid_package_archive`
  / `skill_not_found_in_package` / `name_conflict` / `storage_conflict`
  / `publication_failed` / `skill_filter_no_match` / `unknown`。
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

### `oo skills update [packageName...]`

更新已安装且由 oo 管理的已发布 skill。

- 参数：`[packageName...]` 接受零个或多个包名。**破坏性变更**：早期版本中这些
  位置参数是 skill id，现在改为包名。
- 参数：省略时，会更新所有已安装且由 oo 管理的 registry skill。
- 参数：提供一个或多个包名时，会更新每个指定包下已安装的全部 skill；同一个包
  的所有已安装 skill 会被一起更新。
- 未安装的包：若某个包名下没有任何已安装且由 oo 管理的 skill，则以
  `package_not_installed` 失败。文本模式下命令会报错中止；`--json` 模式下按 entry
  上报该失败并以 `1` 退出。
- 内置 skill：bundled `oo`、`oo-find-skills`、`oo-create-skill`、
  `oo-publish-skill` 等内置 skill 不在此命令处理范围内。将内置名作为包名参数传入
  会以 `bundled_unsupported` 失败。请使用
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
- 选项：`-s, --skill <skills...>` 将更新限定为指定的 skill。该选项可选，可传多个
  值（例如 `-s foo bar`）。匹配大小写不敏感，可用 skill 名称或其目录名。未匹配到
  任何已安装 skill 的名称会被忽略。当所请求的名称都不匹配解析出的 skill 时，
  命令会失败（文本模式报错并列出解析出的 skill；`--json` 上报
  `skill_filter_no_match` 并以 `1` 退出）。
- 选项：由于 `-s, --skill` 接受多个值，请把所有 package 名称放在它**之前**
  （例如 `oo skills update @scope/pkg -s foo`）。`--skill` 之后、直到下一个选项
  （如 `--json`）之前的 token 都会被当作 skill 名称，而非 package 名称。
- 选项：`--json` / `--format json` 输出结构化 payload（见下方"mutation 命令的
  JSON 输出"）。
- `skills[].status`（update JSON）：`updated | repaired | current | failed`。
  - `updated`：至少一个 host 版本号已升级。
  - `repaired`：版本号未变，但有 host 的 publication 被重写（legacy symlink、
    metadata 漂移等）。
  - `current`：所有 host 无需写入。
- `error.code` 枚举（update JSON）：`not_authenticated` / `no_supported_hosts`
  / `invalid_path` / `bundled_unsupported` / `package_not_installed`
  / `package_lookup_failed` / `package_download_failed` /
  `invalid_package_archive` / `publication_failed` / `skill_filter_no_match` /
  `unknown`。

### `oo skills check-update [packageName...]`

检查由 oo 管理的 registry skill 是否有新版本，或本地内容是否已偏离 canonical。
**只查询，不下载 package archive，不写入任何 skill 目录**。

- 参数：`[packageName...]` 接受零个或多个包名。**破坏性变更**：早期版本中
  `--skill` 接受 skill id 并作为主选择器；该职责现由这些位置包名参数承担。
  （`--skill` 仍作为可选过滤器存在 —— 见选项。）
- 参数：省略时，会检查所有已安装且由 oo 管理的 registry skill。
- 参数：提供一个或多个包名时，会检查每个指定包下已安装的全部 skill。重复包名
  会去重，输出按原始输入顺序。
- 选项：`-s, --skill <skills...>` 将检查限定为指定的 skill。该选项可选，可传多个
  值（例如 `-s foo bar`）。匹配大小写不敏感，可用 skill 名称或其目录名。未匹配到
  任何解析出 skill 的名称会被忽略。当所请求的名称都不匹配解析出的 registry skill
  时，命令会失败并以 `1` 退出，错误信息会列出可用的 skill（此时不输出 JSON
  payload）。
- 选项：由于 `-s, --skill` 接受多个值，请把所有 package 名称放在它**之前**
  （例如 `oo skills check-update @scope/pkg -s foo`）。`--skill` 之后、直到下一个
  选项（如 `--json`）之前的 token 都会被当作 skill 名称，而非 package 名称。
- 选项：`--format=json` 与 `--json` 切换到结构化 JSON 输出。
  `--show-schema-version`（仅在 JSON 模式下生效）会向 payload 顶层添加
  `schemaVersion`。
- 范围：只检查 `kind=registry` 的 skill。内置名，或没有任何已安装且由 oo 管理
  skill 的包名，会作为 `failed` entry 上报，其 `skillId` 回显所请求的包名，并带
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
- `currentVersion` 是该 skill 所有已安装副本（共享的 canonical 副本与每个
  agent host 副本）中的最高版本；部分更新遗留的落后副本通过 `status` 表达，
  不会拉低 `currentVersion`。`oo skills sync upload` 上报同一版本。
- 退出码：即使 entry 含 `failed`，命令仍以 0 退出（失败由 payload 字段表达）。
  参数错误（如 `--format xml`）仍以 2 退出。
- `error.code` 枚举：`bundled_unsupported` / `package_not_installed` /
  `package_lookup_failed` / `unknown`。

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

### `oo skills auto-trigger`

控制 agent 能否在用户未点名的情况下自行加载内置 skill。这是一个命令组，包含三个
子命令，仅作用于四个内置 skill（`oo`、`oo-find-skills`、`oo-create-skill`、
`oo-publish-skill`），registry skill 与本地 skill 不受影响。

关闭自动触发后，skill 仍然安装着、仍可按名调用——在 Claude Code 及兼容 agent 中
使用 `/oo`，在 Codex 中使用 `$oo`。改变的只是 agent 不再主动使用它。

- 维度：设置按 skill 生效，不按 agent。一次执行即应用到所有受支持的 agent 宿主，
  各自使用该 agent 能识别的机制。
- 持久化：选择存储在 CLI 设置文件的 `[skills.auto_trigger]` 下，跨会话保留。
- 生效时机：该设置是 skill 发布时的输入，不是运行时开关。`off`/`on` 会立即重新
  发布内置 skill。启动同步不会检测手工修改的 `[skills.auto_trigger]`；手改后请用
  `oo skills repair --skill oo --skill oo-find-skills --skill oo-create-skill
  --skill oo-publish-skill` 应用（`--skill` 是必填项）。
- `--all` 是常驻策略而非快照：后续版本新增的内置 skill 也会被它覆盖，无需再次
  执行命令。该策略生效期间，针对单个 skill 的 `off`/`on` 仍会更新持久化列表，但
  对 agent 而言没有任何变化，文本输出会明确提示这一点。
- 连带影响：自动触发关闭后，会把 skill 描述从自身上下文中移除的 agent 将无法再
  主动使用它。内置 `oo` skill 的收尾阶段推荐即属于此类行为，在重新开启自动触发
  之前不会再发生。

#### `oo skills auto-trigger off [skillName...]`

把内置 skill 改为仅手动触发。

- 参数：`[skillName...]` 要改为仅手动触发的内置 skill 名称；会写入持久化列表，
  去重并排序。
- 选项：`--all` 把所有内置 skill 改为仅手动触发（含后续版本新增的），并清空
  per-skill 列表，因为它已被覆盖。`--json` / `--format json` /
  `--show-schema-version` 控制输出。
- 校验：传入 skill 名称**或** `--all`，不能同时传、也不能都不传，两种误用均以
  `2` 退出。不属于内置 skill 的名称以 `2` 退出并列出可用名称。
- 安全性：非 `oo` 管理的同名 skill 目录不会被覆盖，会在输出中报告为已跳过。这与
  `oo skills install` 不同——后者遇到此类目录会让整次运行失败；而修改偏好设置必须
  仍然能对其他 agent 生效。
- 退出码：设置已保存但有 skill 目标未能重新发布时退出 `1`，消息会点名这些目标，
  并给出用于完成应用的 `oo skills repair` 命令。

#### `oo skills auto-trigger on [skillName...]`

重新允许 agent 自行加载内置 skill。

- 参数：`[skillName...]` 要从列表中移除的内置 skill 名称。
- 选项：`--all` 把所有内置 skill 恢复为出厂默认，同时清除常驻策略和 per-skill
  列表，不会遗留任何仍处于仅手动状态的 skill。输出选项与 `off` 相同。
- 校验：与 `off` 相同，但 `on` 额外接受已存在于 `disabled` 列表中的名称，即使它
  在当前版本中已不是内置 skill。移除条目本就是该命令的职责；否则后续版本删除的
  内置 skill 将只能用 `--all` 清除。
- 安全性与退出码同 `off`。

#### `oo skills auto-trigger status`

显示每个内置 skill 已配置的自动触发策略。

- 选项：`--json` / `--format json` / `--show-schema-version`。
- 文本输出：先输出一行整体状态，再为每个内置 skill 输出一行，取值为 `自动`、
  `手动` 或 `手动（全部关闭）`。
- 范围：显示的是已保存的设置，而非当前已发布到磁盘的内容。除非手改了设置文件却
  没有重新发布，两者一致——参见上文「生效时机」。

#### JSON 输出

`status` 输出状态；`off` 与 `on` 输出同样的状态，外加本次发布的结果。

```json
{
  "disabled": ["oo-create-skill"],
  "disabledAll": false,
  "skills": [
    { "autoTrigger": true, "name": "oo", "reason": "default" },
    { "autoTrigger": true, "name": "oo-find-skills", "reason": "default" },
    { "autoTrigger": false, "name": "oo-create-skill", "reason": "skill" },
    { "autoTrigger": true, "name": "oo-publish-skill", "reason": "default" }
  ],
  "publications": [
    { "agent": "universal", "skill": "oo", "status": "published" },
    { "agent": "claude", "skill": "oo", "status": "skipped" }
  ]
}
```

- `disabled` 原样回显持久化的 per-skill 列表，包括在当前版本中已不对应任何内置
  skill 的名称。此类条目不产生任何效果；用 `on <name>` 即可清除——`on` 接受列表
  中已存在的名称。
- `reason` 取值为 `default`（自动触发开启）、`skill`（该 skill 被单独指定）或
  `all`（被常驻策略覆盖）。`all` 优先于 `skill`。
- `publications` 仅出现在 `off` 与 `on` 中。`status` 取值为 `published`、
  `skipped`（目标不由 `oo` 管理）或 `failed`。

### `oo skills recommend`

为内置 `oo` skill 提供收尾阶段的 skill 推荐，并提供静音控制。内置 `oo` skill 会
调用这些命令，也可直接运行。这是一个命令组，包含三个子命令。

#### `oo skills recommend plan [connectorService...]`

根据本次会话用到的 connector service，判断哪些 skill 应推荐安装或更新，哪些应跳过。

- 参数：`[connectorService...]` 接受零个或多个 connector service 标识（`oo search`
  结果中的 `service` 字段）。每个通过"加 `oo-` 前缀并把下划线换成连字符"映射到一个
  skill 包（`github` → `oo-github`，`aliyun_oss` → `oo-aliyun-oss`）。空白项被忽略；
  推导出的包会去重，输出保留输入顺序。不传参数时计划为空。
- 选项：`--format=json` 与 `--json` 切换到结构化 JSON 输出。`--show-schema-version`
  （仅在 JSON 下有意义）会在顶层添加 `schemaVersion`。`--force` 会重新展示本应被会话冷却
  抑制的推荐（见下文）。
- 行为：每个推导出的 `oo-<service>` 包都会向 registry 确认。包已发布但本地未安装时推荐
  `install`；已安装且有更新的已发布版本时推荐 `update`；当包已是最新、未发布、此前被忽略
  或被全局静音时跳过。当推荐被全局静音时，计划返回 `muted: true` 且无推荐项。
- 会话冷却：某条推荐被展示后，在一个较短的时间窗内，后续运行会抑制同一条推荐，从而避免重复的
  wrap-up 每次都再次展示它。被抑制的推荐会以 `recently-suggested` 原因出现在 `skipped` 中，
  而不是 `recommendations`。冷却按单条推荐计算：切换到不同的 service，或推荐内容发生变化
  （例如 `install` 变为 `update`，或出现更新的最新版本）都会再次展示；传 `--force` 也会。
  被全局静音的计划不展示任何内容，也不会开启冷却。该抑制是尽力而为的：当其本地状态不可用时，
  计划会在不去重的情况下返回。
- 网络：每个未被忽略、未被静音的包都会发一次公开的 registry package-info 请求（确认存在性
  与最新版本）。该端点无需登录，因此不需要账号或 API key——有账号时用其 endpoint，否则用默认
  endpoint；请求以较小的并发上限执行。被忽略、被静音的包不需要网络。`404` 视为"未发布"
  （静默跳过）；其它查询失败则跳过该包，而不会让命令失败。
- JSON 结构：

  ```json
  {
    "muted": false,
    "recommendations": [
      { "packageName": "oo-gmail", "action": "install" },
      {
        "packageName": "oo-notion",
        "action": "update",
        "currentVersion": "1.0.0",
        "latestVersion": "1.2.0"
      }
    ],
    "skipped": [
      { "packageName": "oo-drive", "reason": "up-to-date" },
      { "packageName": "oo-slack", "reason": "dismissed" }
    ]
  }
  ```

- `action` 取值：`install` / `update`。
- `reason` 取值：`up-to-date` / `not-published` / `dismissed` / `muted` /
  `lookup-failed` / `recently-suggested`。
- 退出码：即使查询失败或包未发布也返回 `0`（二者都编码为跳过项）。参数错误（如
  `--format xml`）以 exit 2 退出。

#### `oo skills recommend mute [packageName...]`

停止推荐指定的包，使后续会话不再提示它们。

- 参数：`[packageName...]` 要停止推荐的包名，会加入持久化的忽略列表，并去重、排序。
- 选项：`--all` 静音所有后续推荐，而非指定的包。`--format=json` / `--json` /
  `--show-schema-version` 控制输出。
- 校验：传包名**或** `--all`，不能同时传也不能都不传；任一误用以 exit 2 退出。
- 持久化：该选择存储在 CLI 设置文件的 `[skills.recommend]` 段中，跨会话保留。
- JSON 结构：`{ "muted": <bool>, "dismissed": ["oo-gmail", ...] }`——持久化后的状态。

#### `oo skills recommend unmute [packageName...]`

恢复推荐指定的包。

- 参数：`[packageName...]` 要从忽略列表移除的包名。
- 选项：`--all` 清除全局静音，而非指定的包。输出选项与 `mute` 一致。
- 校验：传包名**或** `--all`，不能同时传也不能都不传；任一误用以 exit 2 退出。
- JSON 结构：`{ "muted": <bool>, "dismissed": [...] }`——持久化后的状态。

### `oo skills uninstall [skills...]`

从受支持的本地 skill 目录移除由 oo 管理的 skill。

- 别名：`oo skills remove [skills...]`。
- 参数：未提供任何名称时，命令会移除全部内置 skill。
- 参数：可提供一个或多个名称，并且可以混用 skill 名与包名，例如
  `oo skills remove @scope/pkg other-skill`。
- 选项：`--agent <agent>` 将 local skill 删除限制到一个受支持 Agent，用于消除
  多个 Agent 中存在同名 local skill 时的歧义。
- 名称解析：每个名称会先按 skill 名处理，命令会检查内置 skill、agent-native
  local skill 以及已发布的 registry 安装；当 registry 与 local 同名时会同时移除，
  且 registry 安装先于本地安装移除。
- 包名回退：当某个名称匹配不到任何已安装的 skill 时，会将其当作包名处理，并移除
  属于该包的全部已安装 registry skill。以 `@` 开头且包含 `/` 的名称（即带 scope
  的包标识，如 `@scope/pkg`）始终被当作包名处理，不会再尝试作为 skill 名。
- 包归属：包匹配依据每个已安装 skill 记录的包标识。即使另一个包发布了同名 skill，
  来自其他包的 skill 也不会被移除。
- 多名称：使用 `--json` 时会尝试每个名称，并将各名称的结果汇总进报告；文本输出
  会按顺序处理名称，遇到第一个失败即停止。
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
- 选项：`--team <team>` 以指定团队上传该文件，上传按该团队计费与计量。
  未传时，团队来自已设置的 `OO_TEAM_ID` / `OO_TEAM_NAME`，否则为当前账号
  保存的默认团队。
- 说明：团队选择只随文件服务请求发送；分片上传直接发往存储服务，不携带它。
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

在 OOMOL 云端存取具名字符串变量。别名：`oo variable`、`oo var`、
`oo vars`。所有子命令都需要当前账号；value 以字符串存储（如需存 JSON 请自行序列化）。

变量属于团队而不是单个用户：团队全体成员读写同一份变量，同名写入 last-write-wins。
每个子命令按同一条阶梯解析所使用的团队：`--team <team>` > `OO_TEAM_ID` >
`OO_TEAM_NAME` > 当前账号保存的默认团队 > 服务端默认团队。没有选中任何团队时
不发送团队选择，由服务端套用它自己的默认团队；不存在按用户私有的作用域。
`--team` 传空值以退出码 `2` 失败。

所有子命令都支持 `--team <team>`。当前账号不属于任何团队时无法使用
变量：命令以退出码 `1` 失败并给出说明。选择了账号不是成员的团队，或团队不存在时，
同样以退出码 `1` 失败。

### `oo variables list`

列出当前团队的全部变量，按最近更新时间倒序（无分页；每个团队最多 200 个）。

- 文本输出：每行一个变量，只显示 `name` 和 `updatedAt`；不打印完整 value。读取
  value 请用 `oo variables get` 或 `--json`。
- 选项：`--team <team>` 以该团队执行命令。
- 选项：`--format <format>` / `--json` 返回结构化输出
  `{ "variables": [{ "name", "value", "updatedAt", "updatedBy" }] }`，包含完整
  value。`updatedBy` 为最后写入该变量的团队成员 id，服务端未提供时不出现。

### `oo variables get <name>`

读取当前团队指定变量的值。

- 参数：`<name>` 必填（1-256 个字符；不能包含 `/` 或控制字符）。
- 文本输出：原始 value，并追加换行。
- 选项：`--team <team>` 用于选择团队，含义同 `oo variables list`。
- 选项：`--format <format>` / `--json` 返回
  `{ "name", "value", "updatedAt", "updatedBy" }`。
- 说明：变量不存在时以非零码退出。

### `oo variables create <name> [value]`（别名：`oo variables update`）

为当前团队创建或替换变量（last-write-wins）。`create` 与 `update` 完全等价。

- 参数：`<name>` 必填。`[value]` 为可选的位置参数值。
- value 来源：`[value]`、`--from-file <path>`、`--stdin` 三者必须且只能提供一个。
  允许空字符串。
- 选项：`--from-file <path>` 按 UTF-8 原文读取文件内容作为 value。
- 选项：`--stdin` 从标准输入读取到 EOF 作为 value（原文）；当 stdin 是交互式终端时报错。
- 选项：`--team <team>` 用于选择团队，含义同 `oo variables list`。
- 选项：`--format <format>` / `--json` 返回
  `{ "name", "value", "updatedAt", "updatedBy" }`。
- 说明：value 上限为 64 KiB（65536 字节，UTF-8）。
- 说明：每个团队最多存储 200 个变量；超出配额时以退出码 `1` 失败。

### `oo variables delete <name>`

删除当前团队的变量。幂等：即使 name 不存在也成功。

- 参数：`<name>` 必填。
- 选项：`--team <team>` 用于选择团队，含义同 `oo variables list`。
- 选项：`--json` 返回 `{ "name", "deleted": true }`。

## Shell 补全

### `oo completion <shell>`

生成 shell 补全脚本。

- 参数：`<shell>` 为目标 shell。支持的值：`bash`、`zsh`、`fish`。
- 行为：生成的脚本会为 `oo team use <name>` 动态补全当前账号可访问的团队名称。
  候选项按账号和 endpoint 缓存一分钟。
