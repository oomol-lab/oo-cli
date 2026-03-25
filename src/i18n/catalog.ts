import { APP_NAME } from "../application/config/app-config.ts";

export const enMessages = {
    "app.description": `${APP_NAME} is OOMOL's CLI toolkit. Everything can be done in the CLI.`,
    "auth.login.callbackAlreadyUsed": "This login callback has already been used.",
    "auth.login.callbackInvalid": "The login callback payload is invalid.",
    "auth.login.callbackNotFound": "The requested login callback endpoint was not found.",
    "auth.login.callbackSuccess": "Login completed. You can close this tab now.",
    "auth.login.openManually": "Open this URL in your browser to continue: {url}",
    "auth.login.success": "Logged in to {endpoint} account {name}",
    "auth.login.waitingForBrowser": "Waiting for the browser login to complete...",
    "auth.logout.success": "Logged out the current account.",
    "auth.status.accountId": "Account ID",
    "auth.status.activeAccount": "Active account",
    "auth.status.apiKeyInvalid": "Invalid",
    "auth.status.apiKeyRequestFailed": "Request failed",
    "auth.status.apiKeyStatus": "API key status",
    "auth.status.apiKeyValid": "Valid",
    "auth.status.loggedIn": "Logged in to {endpoint} account {name}",
    "auth.status.loggedOut": "Not logged in to any OOMOL account.",
    "auth.status.missing": "The active account is missing from the auth store.",
    "auth.switch.success": "Switched active account for {endpoint} to {name}",
    "commands.auth.description": "Manage CLI authentication accounts.",
    "commands.auth.login.description": "Log in with an OOMOL account in the browser.",
    "commands.auth.login.summary": "Log in with a browser flow",
    "commands.auth.logout.description": "Remove the current account from persisted auth data.",
    "commands.auth.logout.summary": "Log out the current account",
    "commands.auth.status.description": "Show the current auth account and validate its API key.",
    "commands.auth.status.summary": "Show auth status",
    "commands.auth.summary": "Manage CLI authentication",
    "commands.auth.switch.description": "Switch to the next saved auth account.",
    "commands.auth.switch.summary": "Switch to the next auth account",
    "commands.cloudTask.description": "Manage cloud task execution workflows.",
    "commands.cloudTask.list.description": "List cloud tasks with optional filters.",
    "commands.cloudTask.list.summary": "List cloud tasks",
    "commands.cloudTask.log.description": "Show paginated logs for a cloud task.",
    "commands.cloudTask.log.summary": "Show cloud task logs",
    "commands.cloudTask.result.description": "Show the current result for a cloud task.",
    "commands.cloudTask.result.summary": "Show cloud task result",
    "commands.cloudTask.run.description":
        "Validate input values and create a cloud task for a package block.",
    "commands.cloudTask.run.summary": "Create a cloud task",
    "commands.cloudTask.summary": "Manage cloud tasks",
    "commands.completion.description":
        "Output a shell completion script for a supported shell.",
    "commands.completion.summary": "Generate shell completion scripts",
    "commands.config.description": "Read and update persisted user settings.",
    "commands.config.summary": "Manage persisted configuration",
    "commands.config.get.description": "Read a persisted configuration value.",
    "commands.config.get.summary": "Read a configuration value",
    "commands.config.list.description":
        "Print all persisted configuration values that are currently configured.",
    "commands.config.list.summary": "List configured values",
    "commands.config.path.description":
        "Print the current persisted configuration file path.",
    "commands.config.path.summary": "Show config file path",
    "commands.config.set.description": "Persist a configuration value.",
    "commands.config.set.summary": "Persist a configuration value",
    "commands.config.unset.description": "Remove a persisted configuration value.",
    "commands.config.unset.summary": "Remove a configuration value",
    "commands.help.summary": "Show help for a command",
    "commands.login.description":
        "Log in with an OOMOL account in the browser. Alias for auth login.",
    "commands.login.summary": "Log in with a browser flow (alias for auth login)",
    "commands.logout.description":
        "Remove the current account from persisted auth data. Alias for auth logout.",
    "commands.logout.summary":
        "Log out the current account (alias for auth logout)",
    "commands.package.description":
        "Inspect package registry metadata and related resources.",
    "commands.package.info.description":
        "Show transformed package metadata for an explicit package specifier.",
    "commands.package.info.summary": "Show package metadata",
    "commands.package.summary": "Package utilities",
    "commands.search.description":
        "Search packages with free-form text against the intent search API.",
    "commands.search.summary": "Search packages by intent",
    "config.set.success": "Set {key} to {value}.",
    "config.unset.success": "Removed {key}.",
    "errors.commander.excessArguments": "Too many arguments were provided.",
    "errors.commander.invalidArgument": "Invalid argument: {value}.",
    "errors.commander.missingArgument": "Missing required argument: {value}.",
    "errors.commander.missingMandatoryOptionValue":
        "Missing value for required option: {value}.",
    "errors.commander.optionMissingArgument":
        "Missing value for option: {value}.",
    "errors.commander.suggestion": "Did you mean {value}?",
    "errors.commander.unknownCommand": "Unknown command: {value}.",
    "errors.commander.unknownOption": "Unknown option: {value}.",
    "errors.auth.loginTimeout":
        "Timed out waiting for the browser login callback.",
    "errors.auth.noSavedAccounts":
        "There are no auth accounts to switch to.",
    "errors.authStore.invalidToml":
        "The auth file at {path} is not valid TOML.",
    "errors.authStore.invalidSchema":
        "The auth file at {path} has an unsupported shape.",
    "errors.authStore.readFailed":
        "Failed to read the auth file at {path}.",
    "errors.authStore.writeFailed":
        "Failed to write the auth file at {path}.",
    "errors.cloudTask.activeAccountMissing":
        "The active auth account is missing from the auth store.",
    "errors.cloudTask.authRequired":
        "You must log in before using cloud-task commands.",
    "errors.cloudTask.invalidFormat":
        "Invalid format: {value}. Use json.",
    "errors.cloudTask.invalidResponse":
        "The cloud task service returned an unsupported response body.",
    "errors.cloudTask.requestError":
        "The cloud task request failed: {message}",
    "errors.cloudTask.requestFailed":
        "The cloud task request returned HTTP {status}.",
    "errors.cloudTaskList.blockIdRequiresPackageId":
        "You must provide --package-id (or --package-name) when using --block-id.",
    "errors.cloudTaskList.conflictingOptionValues":
        "Conflicting option values were provided for {left} and {right}.",
    "errors.cloudTaskList.invalidSize":
        "Invalid value for {option}: {value}. Use an integer between 1 and 100.",
    "errors.cloudTaskList.invalidStatus":
        "Invalid status: {value}. Use queued, scheduling, scheduled, running, success, or failed.",
    "errors.cloudTaskLog.invalidPage":
        "Invalid value for {option}: {value}. Use an integer greater than or equal to 1.",
    "errors.cloudTaskRun.blockIdRequired":
        "The --block-id option is required.",
    "errors.cloudTaskRun.blockNotFound":
        "The block id {blockId} was not found in the package metadata.",
    "errors.cloudTaskRun.dataFilePathRequired":
        "The @data file path cannot be empty.",
    "errors.cloudTaskRun.dataReadFailed":
        "Failed to read input data from {path}: {message}",
    "errors.cloudTaskRun.dataRequired":
        "The --data option is required.",
    "errors.cloudTaskRun.invalidDataJson":
        "The --data value is not valid JSON: {message}",
    "errors.cloudTaskRun.invalidHandleSchema":
        "The input schema for handle {handle} is invalid: {message}",
    "errors.cloudTaskRun.invalidPackageSpecifier":
        "Invalid package specifier: {value}. Use PACKAGE_NAME@SEMVER.",
    "errors.cloudTaskRun.invalidPayload":
        "The value for handle {handle} is invalid: {message}",
    "errors.cloudTaskRun.invalidPayloadShape":
        "The --data payload must be a JSON object.",
    "errors.cloudTaskRun.unknownInputHandle":
        "The handle {handle} is not defined by block {blockId}.",
    "errors.cloudTaskRun.unsupportedContentMediaType":
        "The handle {handle} uses unsupported contentMediaType {contentMediaType}.",
    "errors.completion.invalidShell":
        "Unsupported shell: {value}. Use bash, zsh, or fish.",
    "errors.config.invalidKey": "Invalid config key: {value}.",
    "errors.config.invalidLangValue":
        "Invalid lang value: {value}. Use en or zh.",
    "errors.config.invalidUpdateNotifierValue":
        "Invalid update-notifier value: {value}. Use on or off.",
    "errors.lang.invalidFlag":
        "Invalid value for --lang: {value}. Use en or zh.",
    "errors.search.activeAccountMissing":
        "The active auth account is missing from the auth store.",
    "errors.search.authRequired":
        "You must log in before using the search command.",
    "errors.search.invalidFormat":
        "Invalid format: {value}. Use json.",
    "errors.search.invalidResponse":
        "The search service returned an unsupported response body.",
    "errors.search.requestError":
        "The search request failed: {message}",
    "errors.search.requestFailed":
        "The search request returned HTTP {status}.",
    "errors.packageInfo.activeAccountMissing":
        "The active auth account is missing from the auth store.",
    "errors.packageInfo.authRequired":
        "You must log in before using the package info command.",
    "errors.packageInfo.invalidFormat":
        "Invalid format: {value}. Use json.",
    "errors.packageInfo.invalidPackageSpecifier":
        "Invalid package specifier: {value}.",
    "errors.packageInfo.invalidResponse":
        "The package info service returned an unsupported response body.",
    "errors.packageInfo.requestError":
        "The package info request failed: {message}",
    "errors.packageInfo.requestFailed":
        "The package info request returned HTTP {status}.",
    "errors.store.invalidToml":
        "The settings file at {path} is not valid TOML.",
    "errors.store.invalidSchema":
        "The settings file at {path} has an unsupported shape.",
    "errors.store.readFailed":
        "Failed to read the settings file at {path}.",
    "errors.store.writeFailed":
        "Failed to write the settings file at {path}.",
    "errors.unexpected": "Unexpected error: {message}",
    "update.available.message":
        "Update available {currentVersion} → {latestVersion}",
    "update.available.command":
        "Run {command} to update",
    "help.arguments": "Arguments:",
    "help.commands": "Commands:",
    "help.extra.choices": "choices",
    "help.extra.default": "default",
    "help.extra.env": "env",
    "help.extra.preset": "preset",
    "help.globalOptions": "Global Options:",
    "help.options": "Options:",
    "help.appDescription.colored":
        "{appName} is {companyName}'s CLI toolkit. Everything can be done in the CLI.",
    "help.usage": "Usage:",
    "options.blockId": "Specify the target block id",
    "options.blockName": "Alias for --block-id",
    "options.data": "Provide JSON input values or @path to a JSON file",
    "options.dryRun": "Validate the request without creating a task",
    "options.help": "Show help for command",
    "options.format": "Specify output format (use json for structured output)",
    "options.json": "Alias for --format=json",
    "options.onlyPackageId": "Return only package ids",
    "options.nextToken": "Specify the pagination token for the next page",
    "options.packageId": "Filter by package id",
    "options.packageName": "Alias for --package-id",
    "options.page": "Specify the log page number",
    "options.size": "Specify the number of items per page",
    "options.status": "Filter by task status",
    "options.lang": "Specify the display language",
    "options.version": "Show the current version",
    "versionInfo.version": "Version",
    "versionInfo.buildTime": "Build Time",
    "versionInfo.commit": "Commit",
    "versionInfo.unknown": "unknown",
    "arguments.key": "Configuration key",
    "arguments.packageSpecifier": "Package specifier",
    "arguments.shell": "Target shell",
    "arguments.taskId": "Task id",
    "arguments.text": "Search text",
    "arguments.value": "Configuration value",
    "cloudTask.text.dryRunPassed": "Validation passed.",
    "cloudTask.text.error": "Error",
    "cloudTask.text.inputValues": "Input values",
    "cloudTask.text.nextToken": "Next token",
    "cloudTask.text.noLogs": "No logs were returned.",
    "cloudTask.text.noTasks": "No tasks were found.",
    "cloudTask.text.packageBlock": "Package/Block",
    "cloudTask.text.progress": "Progress",
    "cloudTask.text.resultData": "Result data:",
    "cloudTask.text.resultUrl": "Result URL",
    "cloudTask.text.status": "Status",
    "cloudTask.text.taskId": "Task ID",
    "cloudTask.text.createdAt": "Created",
    "cloudTask.text.updatedAt": "Updated",
    "cloudTask.text.workload": "Workload",
    "cloudTask.status.failed": "failed",
    "cloudTask.status.running": "running",
    "cloudTask.status.scheduled": "scheduled",
    "cloudTask.status.scheduling": "scheduling",
    "cloudTask.status.success": "success",
    "cloudTask.status.queued": "queued",
    "search.text.blocks": "Blocks:",
    "search.text.noResults": "No matching packages were found.",
    "search.text.unnamedBlock": "unnamed-block",
    "search.text.unnamedPackage": "unnamed-package",
    "packageInfo.text.blocks": "Blocks:",
    "packageInfo.text.inputHandle": "Input:",
    "packageInfo.text.outputHandle": "Output:",
    "packageInfo.text.optional": "[optional]",
    "packageInfo.text.required": "[required]",
} as const;

export const zhMessages = {
    "app.description": `${APP_NAME} 是 OOMOL 的 CLI 工具集，一切均可在 CLI 中完成`,
    "auth.login.callbackAlreadyUsed": "这个登录回调已经被使用过。",
    "auth.login.callbackInvalid": "登录回调携带的数据无效。",
    "auth.login.callbackNotFound": "未找到请求的登录回调地址。",
    "auth.login.callbackSuccess": "登录完成，现在可以关闭这个页面。",
    "auth.login.openManually": "请在浏览器中打开这个 URL 继续登录：{url}",
    "auth.login.success": "已登录 {endpoint} 账号 {name}",
    "auth.login.waitingForBrowser": "正在等待浏览器完成登录...",
    "auth.logout.success": "已登出当前账号。",
    "auth.status.accountId": "账号 ID",
    "auth.status.activeAccount": "当前激活账号",
    "auth.status.apiKeyInvalid": "无效",
    "auth.status.apiKeyRequestFailed": "请求失败",
    "auth.status.apiKeyStatus": "API key 状态",
    "auth.status.apiKeyValid": "有效",
    "auth.status.loggedIn": "已登录 {endpoint} 账号 {name}",
    "auth.status.loggedOut": "当前没有登录任何 OOMOL 账号。",
    "auth.status.missing": "当前激活账号不存在于认证数据中。",
    "auth.switch.success": "已将 {endpoint} 的当前激活账号切换为 {name}",
    "commands.auth.description": "管理 CLI 的认证账号。",
    "commands.auth.login.description": "在浏览器中登录 OOMOL 账号。",
    "commands.auth.login.summary": "通过浏览器登录",
    "commands.auth.logout.description": "从持久化认证数据中移除当前账号。",
    "commands.auth.logout.summary": "登出当前账号",
    "commands.auth.status.description": "显示当前认证账号并校验其 API key。",
    "commands.auth.status.summary": "显示认证状态",
    "commands.auth.summary": "管理 CLI 认证",
    "commands.auth.switch.description": "切换到下一个已保存的认证账号。",
    "commands.auth.switch.summary": "切换到下一个认证账号",
    "commands.cloudTask.description": "管理云任务执行流程。",
    "commands.cloudTask.list.description": "按可选条件列出云任务。",
    "commands.cloudTask.list.summary": "列出云任务",
    "commands.cloudTask.log.description": "查看云任务的分页日志。",
    "commands.cloudTask.log.summary": "显示云任务日志",
    "commands.cloudTask.result.description": "查看云任务当前结果。",
    "commands.cloudTask.result.summary": "显示云任务结果",
    "commands.cloudTask.run.description": "校验输入值并为包内 block 创建云任务。",
    "commands.cloudTask.run.summary": "创建云任务",
    "commands.cloudTask.summary": "管理云任务",
    "commands.completion.description": "输出受支持 shell 的补全脚本。",
    "commands.completion.summary": "生成 shell 补全脚本",
    "commands.config.description": "读取并更新持久化的用户配置。",
    "commands.config.summary": "管理持久化配置",
    "commands.config.get.description": "读取一个持久化配置值。",
    "commands.config.get.summary": "读取配置值",
    "commands.config.list.description": "查看当前已配置的全部持久化配置值。",
    "commands.config.list.summary": "查看已配置的配置值",
    "commands.config.path.description": "打印当前持久化配置文件路径。",
    "commands.config.path.summary": "显示配置文件路径",
    "commands.config.set.description": "持久化一个配置值。",
    "commands.config.set.summary": "持久化配置值",
    "commands.config.unset.description": "移除一个持久化配置值。",
    "commands.config.unset.summary": "移除配置值",
    "commands.help.summary": "显示命令帮助",
    "commands.login.description": "在浏览器中登录 OOMOL 账号。是 auth login 的别名。",
    "commands.login.summary": "通过浏览器登录（auth login 的别名）",
    "commands.logout.description": "从持久化认证数据中移除当前账号。是 auth logout 的别名。",
    "commands.logout.summary": "登出当前账号（auth logout 的别名）",
    "commands.package.description": "查看包注册表元数据及相关资源。",
    "commands.package.info.description": "按显式包标识显示转换后的包元数据。",
    "commands.package.info.summary": "显示包元数据",
    "commands.package.summary": "包相关工具",
    "commands.search.description": "使用自由文本通过意图搜索 API 搜索包。",
    "commands.search.summary": "按意图搜索包",
    "config.set.success": "已将 {key} 设置为 {value}。",
    "config.unset.success": "已移除 {key}。",
    "errors.commander.excessArguments": "提供了过多的参数。",
    "errors.commander.invalidArgument": "参数无效：{value}。",
    "errors.commander.missingArgument": "缺少必填参数：{value}。",
    "errors.commander.missingMandatoryOptionValue":
        "缺少必填选项的值：{value}。",
    "errors.commander.optionMissingArgument": "选项缺少值：{value}。",
    "errors.commander.suggestion": "你是想输入 {value} 吗？",
    "errors.commander.unknownCommand": "未知命令：{value}。",
    "errors.commander.unknownOption": "未知选项：{value}。",
    "errors.auth.loginTimeout": "等待浏览器登录回调超时。",
    "errors.auth.noSavedAccounts": "没有可切换的认证账号。",
    "errors.authStore.invalidToml": "认证文件 {path} 不是有效的 TOML。",
    "errors.authStore.invalidSchema": "认证文件 {path} 的结构不受支持。",
    "errors.authStore.readFailed": "读取认证文件 {path} 失败。",
    "errors.authStore.writeFailed": "写入认证文件 {path} 失败。",
    "errors.cloudTask.activeAccountMissing":
        "当前激活账号不存在于认证数据中。",
    "errors.cloudTask.authRequired":
        "使用 cloud-task 命令前请先登录。",
    "errors.cloudTask.invalidFormat":
        "无效的 format：{value}。请使用 json。",
    "errors.cloudTask.invalidResponse":
        "云任务服务返回了不受支持的响应内容。",
    "errors.cloudTask.requestError":
        "云任务请求失败：{message}",
    "errors.cloudTask.requestFailed":
        "云任务请求返回了 HTTP {status}。",
    "errors.cloudTaskList.blockIdRequiresPackageId":
        "使用 --block-id 时必须同时提供 --package-id（或 --package-name）。",
    "errors.cloudTaskList.conflictingOptionValues":
        "为 {left} 和 {right} 提供了冲突的选项值。",
    "errors.cloudTaskList.invalidSize":
        "{option} 的值无效：{value}。请使用 1 到 100 之间的整数。",
    "errors.cloudTaskList.invalidStatus":
        "无效的 status：{value}。请使用 queued、scheduling、scheduled、running、success 或 failed。",
    "errors.cloudTaskLog.invalidPage":
        "{option} 的值无效：{value}。请使用大于等于 1 的整数。",
    "errors.cloudTaskRun.blockIdRequired":
        "--block-id 选项为必填。",
    "errors.cloudTaskRun.blockNotFound":
        "包元数据中不存在 block id {blockId}。",
    "errors.cloudTaskRun.dataFilePathRequired":
        "@data 文件路径不能为空。",
    "errors.cloudTaskRun.dataReadFailed":
        "读取 {path} 中的输入数据失败：{message}",
    "errors.cloudTaskRun.dataRequired":
        "--data 选项为必填。",
    "errors.cloudTaskRun.invalidDataJson":
        "--data 的值不是合法 JSON：{message}",
    "errors.cloudTaskRun.invalidHandleSchema":
        "Handle {handle} 的输入 schema 无效：{message}",
    "errors.cloudTaskRun.invalidPackageSpecifier":
        "无效的包标识：{value}。请使用 PACKAGE_NAME@SEMVER。",
    "errors.cloudTaskRun.invalidPayload":
        "Handle {handle} 的值无效：{message}",
    "errors.cloudTaskRun.invalidPayloadShape":
        "--data 的 payload 必须是 JSON object。",
    "errors.cloudTaskRun.unknownInputHandle":
        "Block {blockId} 未定义 handle {handle}。",
    "errors.cloudTaskRun.unsupportedContentMediaType":
        "Handle {handle} 使用了暂不支持的 contentMediaType {contentMediaType}。",
    "errors.completion.invalidShell":
        "不支持的 shell：{value}。请使用 bash、zsh 或 fish。",
    "errors.config.invalidKey": "无效的配置键：{value}。",
    "errors.config.invalidLangValue":
        "无效的 lang 值：{value}。请使用 en 或 zh。",
    "errors.config.invalidUpdateNotifierValue":
        "无效的 update-notifier 值：{value}。请使用 on 或 off。",
    "errors.lang.invalidFlag":
        "--lang 的值无效：{value}。请使用 en 或 zh。",
    "errors.search.activeAccountMissing":
        "当前激活账号不存在于认证数据中。",
    "errors.search.authRequired":
        "使用 search 命令前请先登录。",
    "errors.search.invalidFormat":
        "无效的 format：{value}。请使用 json。",
    "errors.search.invalidResponse":
        "搜索服务返回了不受支持的响应内容。",
    "errors.search.requestError":
        "搜索请求失败：{message}",
    "errors.search.requestFailed":
        "搜索请求返回了 HTTP {status}。",
    "errors.packageInfo.activeAccountMissing":
        "当前激活账号不存在于认证数据中。",
    "errors.packageInfo.authRequired":
        "使用 package info 命令前请先登录。",
    "errors.packageInfo.invalidFormat":
        "无效的 format：{value}。请使用 json。",
    "errors.packageInfo.invalidPackageSpecifier":
        "无效的包标识：{value}。",
    "errors.packageInfo.invalidResponse":
        "包信息服务返回了不受支持的响应内容。",
    "errors.packageInfo.requestError":
        "包信息请求失败：{message}",
    "errors.packageInfo.requestFailed":
        "包信息请求返回了 HTTP {status}。",
    "errors.store.invalidToml": "配置文件 {path} 不是有效的 TOML。",
    "errors.store.invalidSchema": "配置文件 {path} 的结构不受支持。",
    "errors.store.readFailed": "读取配置文件 {path} 失败。",
    "errors.store.writeFailed": "写入配置文件 {path} 失败。",
    "errors.unexpected": "发生了未预期错误：{message}",
    "update.available.message":
        "发现新版本 {currentVersion} → {latestVersion}",
    "update.available.command":
        "运行 {command} 进行升级",
    "help.arguments": "参数：",
    "help.commands": "命令：",
    "help.extra.choices": "可选值",
    "help.extra.default": "默认值",
    "help.extra.env": "环境变量",
    "help.extra.preset": "预设值",
    "help.globalOptions": "全局选项：",
    "help.options": "选项：",
    "help.appDescription.colored":
        "{appName} 是 {companyName} 的 CLI 工具集，一切均可在 CLI 中完成",
    "help.usage": "用法：",
    "options.blockId": "指定目标 block id",
    "options.blockName": "--block-id 的别名",
    "options.data": "提供 JSON 输入值，或使用 @路径 读取 JSON 文件",
    "options.dryRun": "仅校验请求，不真正创建任务",
    "options.help": "显示命令帮助",
    "options.format": "指定输出格式（使用 json 返回结构化内容）",
    "options.json": "--format=json 的别名",
    "options.onlyPackageId": "仅返回 package id",
    "options.nextToken": "指定下一页分页令牌",
    "options.packageId": "按 package id 过滤",
    "options.packageName": "--package-id 的别名",
    "options.page": "指定日志页码",
    "options.size": "指定每页数量",
    "options.status": "按任务状态过滤",
    "options.lang": "指定显示语言",
    "options.version": "显示当前版本",
    "versionInfo.version": "版本",
    "versionInfo.buildTime": "构建时间",
    "versionInfo.commit": "提交",
    "versionInfo.unknown": "未知",
    "arguments.key": "配置键",
    "arguments.packageSpecifier": "包标识",
    "arguments.shell": "目标 shell",
    "arguments.taskId": "任务 ID",
    "arguments.text": "搜索文本",
    "arguments.value": "配置值",
    "cloudTask.text.dryRunPassed": "校验通过。",
    "cloudTask.text.error": "错误",
    "cloudTask.text.inputValues": "输入参数",
    "cloudTask.text.nextToken": "下一页令牌",
    "cloudTask.text.noLogs": "没有返回任何日志。",
    "cloudTask.text.noTasks": "未找到任何任务。",
    "cloudTask.text.packageBlock": "包 / Block",
    "cloudTask.text.progress": "进度",
    "cloudTask.text.resultData": "结果数据：",
    "cloudTask.text.resultUrl": "结果 URL",
    "cloudTask.text.status": "状态",
    "cloudTask.text.taskId": "任务 ID",
    "cloudTask.text.createdAt": "创建时间",
    "cloudTask.text.updatedAt": "更新时间",
    "cloudTask.text.workload": "工作负载",
    "cloudTask.status.failed": "失败",
    "cloudTask.status.running": "运行中",
    "cloudTask.status.scheduled": "已调度",
    "cloudTask.status.scheduling": "调度中",
    "cloudTask.status.success": "成功",
    "cloudTask.status.queued": "排队中",
    "search.text.blocks": "功能块：",
    "search.text.noResults": "未找到匹配的包。",
    "search.text.unnamedBlock": "未命名功能块",
    "search.text.unnamedPackage": "未命名包",
    "packageInfo.text.blocks": "功能块：",
    "packageInfo.text.inputHandle": "输入：",
    "packageInfo.text.outputHandle": "输出：",
    "packageInfo.text.optional": "[可选]",
    "packageInfo.text.required": "[必填]",
} satisfies Record<keyof typeof enMessages, string>;

export const messageCatalog = {
    en: enMessages,
    zh: zhMessages,
} as const;

export type MessageKey = keyof typeof enMessages;
