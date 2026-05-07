# 隐私

`oo` 默认记录受隐私约束的命令使用 telemetry。Telemetry 用于了解命令使用分布、错误率、
更新通道健康度，以及 package 或 skill 维度的使用分布。

Telemetry 事件发送到 OOMOL 的 telemetry endpoint，后端使用 EU 区域的 PostHog Cloud。
每条事件都会关闭 PostHog person profile 处理，并使用本地随机 device id 做设备级聚合。
该 device id 不从 OOMOL 账号派生。

## 不采集的数据

Telemetry 事件不包含：

- free-form 输入文本，例如搜索关键词或 connector payload
- 文件路径、工作目录、文件名、用户名或 hostname
- IP 地址
- 真实 OOMOL 账号 ID、账号名或账号邮箱
- 账号化名、`$set`、`$set_once` 或 `$identify` properties
- 错误消息全文、堆栈、崩溃 dump 或性能 profiling
- URL host 或完整 URL

CLI 只会用 `authenticated`、`anonymous` 或 `unknown` 记录账号状态。

## 可能采集的数据

Telemetry 事件可能包含：

- 命令名、退出码、成功状态、耗时、参数数量和 flag 数量
- CLI 版本、commit、安装方式、操作系统、架构、运行时、语言、CI 状态和 TTY 状态
- package name、package version、skill id、bundled skill name、connector service name、
  connector action name，以及公开 enum 类选项值
- 桶化后的数量、字节数和字符串长度

## 用户控制

使用任一环境变量可关闭当前 invocation 的 telemetry：

- `OO_TELEMETRY_DISABLED=1`
- `DO_NOT_TRACK=1`

使用以下命令可持久化关闭 telemetry：

- `oo telemetry disable`
- `oo config set telemetry.enabled false`

使用以下命令可持久化重新开启 telemetry：

- `oo telemetry enable`
- `oo config set telemetry.enabled true`
- `oo config unset telemetry.enabled`

使用以下命令查看实际开关状态、已存在的本地 device id 前缀、本地待发送事件数量和最后
flush 时间：

- `oo telemetry status`

`oo telemetry disable` 和 `oo config set telemetry.enabled false` 会立即尝试删除本地待发送
telemetry 事件。即使本地 telemetry store 暂时不可用，它们也会阻止后续 telemetry 发送，
但无法撤回已经通过网络发出的字节。
