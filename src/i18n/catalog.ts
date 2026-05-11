import { APP_NAME } from "../application/config/app-config.ts";

export const enMessages = {
    "app.description": `${APP_NAME} is OOMOL's CLI toolkit. Everything can be done in the CLI.`,
    "auth.login.code": "Enter this code to continue: {code}",
    "auth.login.openManually": "Open this URL in your browser to continue: {url}",
    "auth.account.activeAccountMissing":
        "The active account is missing from the auth store.",
    "auth.account.loggedIn": "Logged in to {endpoint} account {name}",
    "auth.login.waiting": "Waiting for the device login to complete...",
    "auth.logout.success": "Logged out the current account.",
    "auth.status.accountId": "Account ID",
    "auth.status.activeAccount": "Active account",
    "auth.status.apiKeyInvalid": "Invalid",
    "auth.status.apiKeyRequestFailed": "Request failed",
    "auth.status.apiKeyRequestFailedSandbox":
        "Request failed (network-restricted sandbox, try requesting elevated permissions)",
    "auth.status.apiKeyStatus": "API key status",
    "auth.status.apiKeyValid": "Valid",
    "auth.status.loggedOut": "Not logged in to any OOMOL account.",
    "auth.switch.success": "Switched active account for {endpoint} to {name}",
    "commands.auth.description": "Manage CLI authentication accounts.",
    "commands.auth.login.description":
        "Log in with an OOMOL account using device login or a session token.",
    "commands.auth.login.summary": "Log in with an OOMOL account",
    "commands.auth.logout.description": "Remove the current account from persisted auth data.",
    "commands.auth.logout.summary": "Log out the current account",
    "commands.auth.status.description": "Show the current auth account and validate its API key.",
    "commands.auth.status.summary": "Show auth status",
    "commands.auth.summary": "Manage CLI authentication",
    "commands.auth.switch.description": "Switch to the next saved auth account.",
    "commands.auth.switch.summary": "Switch to the next auth account",
    "commands.checkUpdate.description":
        "Check whether a newer CLI release is available.",
    "commands.checkUpdate.summary": "Check for CLI updates",
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
    "commands.cloudTask.wait.description":
        "Wait for a cloud task to finish by polling its result.",
    "commands.cloudTask.wait.summary": "Wait for cloud task completion",
    "commands.cloudTask.summary": "Manage cloud tasks",
    "commands.connector.description":
        "Search connector actions and run authenticated connector operations.",
    "commands.connector.summary": "Manage connector actions",
    "commands.connector.search.description":
        "Search connector actions and cache their schemas locally.",
    "commands.connector.search.summary": "Search connector actions",
    "commands.connector.schema.description":
        "Show the schema contract for one connector action.",
    "commands.connector.schema.refresh.description":
        "Clear all locally cached connector action schemas.",
    "commands.connector.schema.refresh.summary":
        "Clear connector action schema cache",
    "commands.connector.schema.summary": "Show connector action schema",
    "commands.connector.run.description":
        "Validate input data and run one connector action.",
    "commands.connector.run.summary": "Run a connector action",
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
    "commands.telemetry.description":
        "Inspect and update privacy-constrained CLI telemetry settings.",
    "commands.telemetry.summary": "Manage CLI telemetry",
    "commands.telemetry.disable.description":
        "Disable CLI telemetry and synchronously purge pending telemetry events.",
    "commands.telemetry.disable.summary": "Disable CLI telemetry",
    "commands.telemetry.enable.description": "Enable CLI telemetry.",
    "commands.telemetry.enable.summary": "Enable CLI telemetry",
    "commands.telemetry.status.description":
        "Show the effective telemetry state, device id prefix, pending count, and last flush time.",
    "commands.telemetry.status.summary": "Show telemetry status",
    "commands.file.cleanup.description":
        "Delete expired or stale file transfer records.",
    "commands.file.cleanup.summary": "Clean file transfer records",
    "commands.file.description": "Manage temporary file transfers.",
    "commands.file.list.description":
        "List locally recorded temporary file uploads.",
    "commands.file.list.summary": "List uploaded files",
    "commands.file.download.description":
        "Download one file from a URL and save it locally.",
    "commands.file.download.summary": "Download a file from a URL",
    "commands.file.summary": "Manage temporary file transfers",
    "commands.file.upload.description":
        "Upload a file and store the signed download URL locally.",
    "commands.file.upload.summary": "Upload a file",
    "commands.install.description":
        "Install one oo-managed CLI release into the local managed runtime.",
    "commands.install.summary": "Install the CLI",
    "commands.llm.config.description":
        "Print the current account's LLM client configuration as JSON.",
    "commands.llm.config.summary": "Show LLM client config",
    "commands.llm.description":
        "Expose LLM client configuration for the current account.",
    "commands.llm.json.description":
        "Call the configured LLM, require structured JSON output, validate it against a JSON Schema, and retry malformed or schema-invalid responses.",
    "commands.llm.json.summary": "Generate validated JSON with the LLM",
    "commands.llm.summary": "Manage LLM client config",
    "commands.help.summary": "Show help for a command",
    "commands.log.description": "Inspect persisted CLI debug logs.",
    "commands.log.summary": "Manage persisted debug logs",
    "commands.log.path.description": "Print the current persisted log directory path.",
    "commands.log.path.summary": "Show log directory path",
    "commands.log.print.description":
        "Print one previous persisted debug log file by index.",
    "commands.log.print.summary": "Print a previous debug log",
    "commands.login.description":
        "Log in with an OOMOL account using device login or a session token. Alias for auth login.",
    "commands.login.summary": "Log in with an OOMOL account (alias for auth login)",
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
    "commands.mixedSearch.description":
        "Search packages and connector actions with one free-form query.",
    "commands.mixedSearch.summary":
        "Search packages and connector actions",
    "commands.search.description":
        "Search packages with free-form text against the intent search API.",
    "commands.search.summary": "Search packages by intent",
    "commands.skills.description":
        "Manage local AI agent skills.",
    "commands.skills.summary": "Manage AI agent skills",
    "commands.skills.search.description":
        "Search published skills against the skills search API.",
    "commands.skills.search.summary":
        "Search published skills",
    "commands.skills.list.description":
        "List bundled, registry, and local skills.",
    "commands.skills.list.summary":
        "List skills",
    "commands.skills.sync.description":
        "Sync oo-managed registry skills through the skills sync API.",
    "commands.skills.sync.summary": "Sync registry skills",
    "commands.skills.sync.upload.description":
        "Upload installed oo-managed registry skills to the skills sync API.",
    "commands.skills.sync.upload.summary": "Upload registry skills",
    "commands.skills.sync.apply.description":
        "Install uploaded oo-managed registry skills into supported local skill directories.",
    "commands.skills.sync.apply.summary": "Apply uploaded registry skills",
    "commands.skills.check.description":
        "Check whether this environment can edit local skills.",
    "commands.skills.check.summary": "Preflight local skill editing",
    "commands.skills.init.description":
        "Initialize a local skill and publish it to supported local skill directories.",
    "commands.skills.init.summary": "Initialize a local skill",
    "commands.skills.validate.description":
        "Validate a local skill directory against the generic skill contract.",
    "commands.skills.validate.summary": "Validate a skill directory",
    "commands.skills.publish.description":
        "Convert one skill into an OOMOL package and publish it.",
    "commands.skills.publish.summary": "Publish a skill",
    "commands.skills.share.description":
        "Share a published skill, including private packages through temporary shares.",
    "commands.skills.share.summary": "Share a published skill",
    "commands.skills.install.description":
        "Install bundled or published skills into supported local skill directories.",
    "commands.skills.install.summary": "Install skills",
    "commands.skills.update.description":
        "Update installed oo-managed published skills to the latest available version.",
    "commands.skills.update.summary": "Update oo-managed skills",
    "commands.skills.uninstall.description":
        "Remove oo-managed skills from supported local skill directories.",
    "commands.skills.uninstall.summary": "Remove a managed skill",
    "config.set.success": "Set {key} to {value}.",
    "config.unset.success": "Removed {key}.",
    "telemetry.disable.success": "Telemetry disabled.",
    "telemetry.enable.success": "Telemetry enabled.",
    "telemetry.status.deviceId": "device_id: {value}",
    "telemetry.status.enabled": "enabled: {value}",
    "telemetry.status.lastFlush": "last_flush: {value}",
    "telemetry.status.none": "none",
    "telemetry.status.pending": "pending: {value}",
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
    "errors.auth.loginInvalidResponse":
        "The auth login service returned an unsupported response body.",
    "errors.auth.loginRequestError":
        "The auth login request failed: {message}",
    "errors.auth.loginRequestFailed":
        "The auth login request returned HTTP {status}.",
    "errors.auth.loginTimeout":
        "Timed out waiting for the device login to complete.",
    "errors.auth.noSavedAccounts":
        "There are no auth accounts to switch to.",
    "errors.auth.required":
        "You must log in before using this command.",
    "errors.auth.sessionTokenRequired":
        "Session token must not be empty.",
    "errors.authStore.invalidToml":
        "The auth file at {path} is not valid TOML.",
    "errors.authStore.invalidSchema":
        "The auth file at {path} has an unsupported shape.",
    "errors.authStore.readFailed":
        "Failed to read the auth file at {path}.",
    "errors.authStore.writeFailed":
        "Failed to write the auth file at {path}.",
    "errors.billing.insufficientCredit":
        "Your OOMOL account balance is insufficient. Recharge before retrying: {url}",
    "errors.shared.invalidFormat":
        "Invalid format: {value}. Use json.",
    "errors.shared.invalidPositiveIntegerOption":
        "Invalid value for {option}: {value}. Use an integer greater than or equal to 1.",
    "errors.shared.networkRestrictedSandboxHint":
        "Current environment may be running in a network-restricted sandbox. Try requesting elevated permissions.",
    "errors.cloudTask.invalidResponse":
        "The cloud task service returned an unsupported response body.",
    "errors.cloudTask.requestError":
        "The cloud task request failed: {message}",
    "errors.cloudTask.requestFailed":
        "The cloud task request returned HTTP {status}.",
    "errors.cloudTaskWait.failed":
        "Cloud task {taskId} finished with a failed status.",
    "errors.cloudTaskWait.invalidTimeout":
        "Invalid value for {option}: {value}. Use 10s to 24h, with optional s, m, or h suffixes.",
    "errors.cloudTaskWait.timedOut":
        "Timed out after {timeout} while waiting for cloud task {taskId}.",
    "errors.cloudTaskList.blockIdRequiresPackageId":
        "You must provide --package-id (or --package-name) when using --block-id.",
    "errors.cloudTaskList.conflictingOptionValues":
        "Conflicting option values were provided for {left} and {right}.",
    "errors.cloudTaskList.invalidSize":
        "Invalid value for {option}: {value}. Use an integer between 1 and 100.",
    "errors.cloudTaskList.invalidStatus":
        "Invalid status: {value}. Use queued, scheduling, scheduled, running, success, or failed.",
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
    "errors.cloudTaskRun.validation.credentialUnsupported":
        "Credential inputs are not supported in the CLI.",
    "errors.cloudTaskRun.validation.expectedType":
        "Expected type {expectedType}, but got {actualType}.",
    "errors.cloudTaskRun.validation.invalidStoragePath":
        "Expected a Unix-style path starting with {prefix}.",
    "errors.cloudTaskRun.invalidPayloadShape":
        "The --data payload must be a JSON object.",
    "errors.cloudTaskRun.unknownInputHandle":
        "The handle {handle} is not defined by block {blockId}.",
    "errors.cloudTaskRun.unsupportedContentMediaType":
        "The handle {handle} uses unsupported contentMediaType {contentMediaType}.",
    "errors.connectorAuthenticated.invalidResponse":
        "The authenticated connector services response body is unsupported.",
    "errors.connectorAuthenticated.requestError":
        "The authenticated connector services request failed: {message}",
    "errors.connectorAuthenticated.requestFailed":
        "The authenticated connector services request returned HTTP {status}.",
    "errors.connectorMetadata.invalidResponse":
        "The connector action metadata response body is unsupported.",
    "errors.connectorMetadata.requestError":
        "The connector action metadata request failed: {message}",
    "errors.connectorMetadata.requestFailed":
        "The connector action metadata request returned HTTP {status}.",
    "errors.connectorRun.actionRequired":
        "The --action option is required.",
    "errors.connectorRun.dataFilePathRequired":
        "The @data file path cannot be empty.",
    "errors.connectorRun.dataReadFailed":
        "Failed to read input data from {path}: {message}",
    "errors.connectorRun.invalidActionSchema":
        "The connector action input schema is invalid: {message}",
    "errors.connectorRun.invalidDataJson":
        "The --data value is not valid JSON: {message}",
    "errors.connectorRun.invalidPayload":
        "The connector action input payload is invalid: {message}",
    "errors.connectorRun.invalidResponse":
        "The connector action run response body is unsupported.",
    "errors.connectorRun.asyncFailed":
        "The async connector action failed with state {state}.",
    "errors.connectorRun.asyncHandleMissing":
        "The async connector action response is missing handle field {field}.",
    "errors.connectorRun.asyncResultMissing":
        "The async connector action poll response is missing result field {field}.",
    "errors.connectorRun.asyncStateMissing":
        "The async connector action poll response is missing state field {field}.",
    "errors.connectorRun.asyncTimedOut":
        "Timed out waiting for async connector action {action}.",
    "errors.connectorRun.asyncUnknownState":
        "The async connector action returned unsupported state {state}.",
    "errors.connectorRun.requestError":
        "The connector action run request failed: {message}",
    "errors.connectorRun.requestFailed":
        "The connector action run request returned HTTP {status}.",
    "errors.connectorRun.requestFailedWithCode":
        "The connector action run request returned HTTP {status} (errorCode: {errorCode}).",
    "errors.connectorRun.requestFailedWithMessage":
        "The connector action run request returned HTTP {status}: {message}",
    "errors.connectorRun.requestFailedWithMessageAndCode":
        "The connector action run request returned HTTP {status} (errorCode: {errorCode}): {message}",
    "errors.connectorSchema.asyncPollSchemaMissing":
        "The async connector action poll schema is missing for action {action}.",
    "errors.connectorSchema.asyncResultSchemaMissing":
        "The async connector action result schema is missing field {field}.",
    "errors.connectorSchema.readFailed":
        "Failed to read the connector action schema cache at {path}: {message}",
    "errors.connectorSchema.writeFailed":
        "Failed to write the connector action schema cache at {path}: {message}",
    "errors.connectorSearch.invalidResponse":
        "The connector action search response body is unsupported.",
    "errors.connectorSearch.requestError":
        "The connector action search request failed: {message}",
    "errors.connectorSearch.requestFailed":
        "The connector action search request returned HTTP {status}.",
    "errors.llmJson.authFailed":
        "The LLM request returned HTTP {status}. Check the current account credentials.",
    "errors.llmJson.endpointNotFound":
        "The LLM chat completions endpoint returned HTTP {status}. Use the normalized endpoint from oo llm config.",
    "errors.llmJson.inputFilePathRequired":
        "The @input file path cannot be empty.",
    "errors.llmJson.inputReadFailed":
        "Failed to read input from {path}: {message}",
    "errors.llmJson.invalidInputJson":
        "The --input value is not valid JSON: {message}",
    "errors.llmJson.invalidMaxRetries":
        "Invalid value for {option}: {value}. Use an integer between 0 and {max}.",
    "errors.llmJson.invalidResponse":
        "The LLM response body is unsupported.",
    "errors.llmJson.invalidSchema":
        "The response JSON Schema is invalid: {message}",
    "errors.llmJson.invalidSchemaJson":
        "The --schema value is not valid JSON: {message}",
    "errors.llmJson.rateLimited":
        "The LLM request returned HTTP {status}. Retry later or reduce request frequency.",
    "errors.llmJson.requestError":
        "The LLM request failed: {message}",
    "errors.llmJson.requestFailed":
        "The LLM request returned HTTP {status}.",
    "errors.llmJson.schemaFilePathRequired":
        "The @schema file path cannot be empty.",
    "errors.llmJson.schemaReadFailed":
        "Failed to read schema from {path}: {message}",
    "errors.llmJson.schemaRequired":
        "The --schema option is required.",
    "errors.llmJson.systemFilePathRequired":
        "The @system file path cannot be empty.",
    "errors.llmJson.systemReadFailed":
        "Failed to read system prompt from {path}: {message}",
    "errors.llmJson.unsupportedRootSchema":
        "The response JSON Schema root type must be object for this endpoint.",
    "errors.llmJson.validationFailed":
        "The LLM did not return valid JSON matching the schema after retries: {message}",
    "errors.completion.invalidShell":
        "Unsupported shell: {value}. Use bash, zsh, or fish.",
    "errors.checkUpdate.failed": "Failed to check for CLI updates.",
    "errors.config.invalidKey": "Invalid config key: {value}.",
    "errors.config.invalidLangValue":
        "Invalid lang value: {value}. Use en or zh.",
    "errors.config.invalidFileDownloadOutDirValue":
        "Invalid file.download.out_dir value: {value}. Use a non-empty path.",
    "errors.config.invalidTelemetryEnabledValue":
        "Invalid telemetry.enabled value: {value}. Use true or false.",
    "errors.skills.invalidName":
        "Unsupported skill: {value}. Use {choices}.",
    "errors.skills.invalidPath":
        "Skill name {name} resolves outside the local skill directories.",
    "errors.skills.init.invalidIcon":
        "Invalid value for --icon. Use a non-empty icon reference.",
    "errors.skills.init.invalidTitle":
        "Invalid value for --title. Use a non-empty display title.",
    "errors.skills.init.descriptionRequired":
        "Missing required --description. Provide a concise trigger description for the generated skill.",
    "errors.skills.init.invalidName":
        "Invalid skill name: {value}. Use a name that can be normalized to lowercase hyphen-case.",
    "errors.skills.publish.invalidPackageMetadata":
        "Invalid skill package metadata: {message}",
    "errors.skills.publish.invalidAgent":
        "Unsupported skill agent: {value}. Use codex, claude, hermes, codebuddy, workbuddy, trae, trae-cn, openclaw, or qoderwork.",
    "errors.skills.publish.invalidSkillFile":
        "Cannot publish the skill at {path}: {message}",
    "errors.skills.publish.invalidVisibility":
        "Invalid skill publish visibility: {value}. Use private or public.",
    "errors.skills.publish.adoptionCancelled":
        "Publishing skill {name} was cancelled before moving {path} into local storage.",
    "errors.skills.publish.adoptionConfirmationRequired":
        "Skill {name} was found at {path}. Run in an interactive terminal to confirm moving it into local storage at {localPath}.",
    "errors.skills.publish.bundledSkill":
        "Bundled skill {name} cannot be published directly because it is managed by the oo CLI release. Create or adopt a local copy before publishing.",
    "errors.skills.publish.localSkillMissing":
        "Local skill {name} does not exist at {path}.",
    "errors.skills.publish.localCopyDrift":
        "Local skill {name} has modified agent copies at {paths}. Publishing uses canonical storage at {localPath}; pass --force to ignore agent-side changes.",
    "errors.skills.publish.registryMetadataMissing":
        "Registry skill {name} cannot be published because its metadata file at {path} does not identify a packageName.",
    "errors.skills.publish.registryPackageConfirmationRequired":
        "Skill {name} is installed from {packageName}. Run in an interactive terminal to confirm publishing it as {targetPackageName}.",
    "errors.skills.publish.registryPackageMismatch":
        "Publishing skill {name} as {targetPackageName} was cancelled because it is installed from {packageName}.",
    "errors.skills.publish.remotePackageHasBlocks":
        "Publishing skill {name} as {packageName} was cancelled because remote package {packageName}@{version} contains blocks.",
    "errors.skills.publish.remotePackageHasBlocksConfirmationRequired":
        "Remote package {packageName}@{version} contains blocks. Run in an interactive terminal to confirm publishing skill {name} as {packageName}.",
    "errors.skills.publish.remotePackageInvalidVersion":
        "Cannot publish skill {name} as {packageName}: remote package {packageName}@{version} has an invalid semver version.",
    "errors.skills.publish.requestError":
        "The skill package publish request failed: {message}",
    "errors.skills.publish.requestFailed":
        "The skill package publish request returned HTTP {status}: {message}",
    "errors.skills.publish.skillNotFound":
        "Cannot find skill {name} in local, bundled, registry, requested agent, or path sources.",
    "errors.skills.publish.visibilityRequired":
        "Package {packageName} does not have an existing visibility to preserve. Run in an interactive terminal or pass --visibility private or --visibility public.",
    "errors.skills.share.cancelled":
        "Share cancelled for skill {name}.",
    "errors.skills.share.confirmationRequired":
        "Confirm the skill before sharing. Run again with -y to share skill {name} from package {packageName}.",
    "errors.skills.share.invalidNumberOption":
        "Invalid value for {option}: {value}. Use a number.",
    "errors.skills.share.invalidResponse":
        "The skill package share response was invalid.",
    "errors.skills.share.notPublished":
        "Package or skill {name} is not published yet.",
    "errors.skills.share.referenceRequired":
        "Provide a skill id, package name, or skill directory path to share.",
    "errors.skills.share.requestError":
        "The skill package share request failed: {message}",
    "errors.skills.share.requestFailed":
        "The skill package share request returned HTTP {status}.",
    "errors.fileDownload.downloadFailed":
        "Failed to download the file at {path}: {message}",
    "errors.fileDownload.invalidExt":
        "Invalid value for --ext: {value}. Use a non-empty extension without path separators.",
    "errors.fileDownload.invalidName":
        "Invalid value for --name: {value}. Use a non-empty file name without path separators.",
    "errors.fileDownload.invalidUrl":
        "Invalid URL: {value}. Use an http or https URL.",
    "errors.fileDownload.outDirCreateFailed":
        "Failed to prepare the output directory {path}: {message}",
    "errors.fileDownload.outDirNotDirectory":
        "The output path {path} exists but is not a directory.",
    "errors.fileDownload.requestError":
        "The download request failed: {message}",
    "errors.fileDownload.requestFailed":
        "The download request returned HTTP {status}.",
    "errors.fileList.invalidStatus":
        "Invalid status: {value}. Use active or expired.",
    "errors.fileUpload.invalidResponse":
        "The file upload service returned an unsupported response body.",
    "errors.fileUpload.pathNotFile":
        "The path {path} is not a regular file.",
    "errors.fileUpload.readFailed":
        "Failed to read file metadata from {path}: {message}",
    "errors.fileUpload.requestError":
        "The file upload request failed: {message}",
    "errors.fileUpload.requestFailed":
        "The file upload request returned HTTP {status}.",
    "errors.fileUpload.tooLarge":
        "The file at {path} is {size} bytes, which exceeds the 500 MiB limit of {max} bytes.",
    "errors.lang.invalidFlag":
        "Invalid value for --lang: {value}. Use en or zh.",
    "errors.search.invalidResponse":
        "The search service returned an unsupported response body.",
    "errors.search.requestError":
        "The search request failed: {message}",
    "errors.search.requestFailed":
        "The search request returned HTTP {status}.",
    "errors.skillsSearch.invalidResponse":
        "The skills search service returned an unsupported response body.",
    "errors.skillsSearch.requestError":
        "The skills search request failed: {message}",
    "errors.skillsSearch.requestFailed":
        "The skills search request returned HTTP {status}.",
    "errors.packageInfo.invalidPackageSpecifier":
        "Invalid package specifier: {value}.",
    "errors.packageInfo.invalidResponse":
        "The package info service returned an unsupported response body.",
    "errors.packageInfo.requestError":
        "The package info request failed: {message}",
    "errors.packageInfo.requestFailed":
        "The package info request returned HTTP {status}.",
    "errors.skills.codexNotInstalled":
        "Codex is not installed. Expected the Codex home directory at {path}.",
    "errors.skills.claudeNotInstalled":
        "Claude Code is not installed. Expected the Claude home directory at {path}.",
    "errors.skills.codebuddyNotInstalled":
        "CodeBuddy is not installed. Expected the CodeBuddy home directory at {path}.",
    "errors.skills.hermesNotInstalled":
        "Hermes is not installed. Expected the Hermes home directory at {path}.",
    "errors.skills.openclawNotInstalled":
        "OpenClaw is not installed. Expected the OpenClaw home directory at {path}.",
    "errors.skills.qoderworkNotInstalled":
        "QoderWork is not installed. Expected the QoderWork home directory at {path}.",
    "errors.skills.traeNotInstalled":
        "Trae is not installed. Expected the Trae home directory at {path}.",
    "errors.skills.traeCnNotInstalled":
        "Trae CN is not installed. Expected the Trae CN home directory at {path}.",
    "errors.skills.workbuddyNotInstalled":
        "WorkBuddy is not installed. Expected the WorkBuddy home directory at {path}.",
    "errors.skills.noSupportedBundledSkillHosts":
        "No supported skill host is installed. Expected one of: {paths}.",
    "errors.skills.install.confirmationRequired":
        "Skill {name} already exists and requires interactive confirmation.",
    "errors.skills.install.invalidArchive":
        "Downloaded package archive does not contain a valid skill directory for {name}.",
    "errors.skills.install.invalidPackageInfo":
        "The skills install package info service returned an unsupported response body.",
    "errors.skills.install.invalidPackageSpecifier":
        "Invalid skills package specifier: {value}.",
    "errors.skills.install.noPublishedSkills":
        "Package {packageName} does not publish any skills.",
    "errors.skills.install.nonInteractiveSelection":
        "Package {packageName} has multiple skills. Use --skill <name>, --all -y, or run in an interactive terminal.",
    "errors.skills.list.invalidSource":
        "Invalid source: {value}. Use bundled, registry, or local.",
    "errors.skills.sync.invalidResponse":
        "The skills sync service returned an unsupported response body.",
    "errors.skills.sync.invalidSource":
        "Invalid sync source: {value}. Use registry.",
    "errors.skills.sync.requestError":
        "The skills sync request failed: {message}",
    "errors.skills.sync.requestFailed":
        "The skills sync request returned HTTP {status}.",
    "errors.skills.install.packageDownloadError":
        "The skills package download failed: {message}",
    "errors.skills.install.packageDownloadFailed":
        "The skills package download returned HTTP {status}.",
    "errors.skills.install.packageInfoRequestError":
        "The skills install package info request failed: {message}",
    "errors.skills.install.packageInfoRequestFailed":
        "The skills install package info request returned HTTP {status}.",
    "errors.skills.install.skillNotFound":
        "Skill {name} was not found in package {packageName}.",
    "errors.skills.update.bundledUnsupported":
        "Bundled skill {name} is managed by oo and cannot be updated with skills update. Use oo skills add {name} instead.",
    "errors.skills.update.packageNameMissing":
        "Managed skill {name} cannot be updated in {hostNames} because its package metadata is missing.",
    "errors.skills.update.notManaged":
        "Skill {name} in host {hostName} is not managed by oo and cannot be updated.",
    "errors.skills.nameConflict":
        "Skill name {name} is already used by a non-OOMOL skill at {path}.",
    "errors.skills.storageConflict":
        "Bundled skill storage for {name} is already occupied by non-OOMOL content at {path}.",
    "errors.skills.notInstalled":
        "Skill {name} is not installed at {path}.",
    "errors.skills.notManaged":
        "{name} is not managed by oo and cannot be removed.",
    "errors.skills.check.storageNotWritable":
        "Local skill storage at {path} is not writable: {message}",
    "errors.skills.validate.failed":
        "Skill validation failed: {message}",
    "errors.store.invalidToml":
        "The settings file at {path} is not valid TOML.",
    "errors.store.invalidSchema":
        "The settings file at {path} has an unsupported shape.",
    "errors.store.readFailed":
        "Failed to read the settings file at {path}.",
    "errors.store.writeFailed":
        "Failed to write the settings file at {path}.",
    "errors.selfUpdate.downloadError":
        "Failed to download the target CLI release: {message}",
    "errors.selfUpdate.downloadFailed":
        "The CLI download request returned HTTP {status}.",
    "errors.selfUpdate.downloadStalled":
        "The download stopped making progress after several retries. Please try again later.",
    "errors.selfUpdate.downloadTimedOut":
        "Timed out while downloading the target CLI release.",
    "errors.selfUpdate.invalidTargetVersion":
        "Invalid target CLI version: {version}. Use a semver version.",
    "errors.selfUpdate.latestVersionUnavailable":
        "Failed to resolve the latest CLI release version.",
    "errors.selfUpdate.unsupportedPlatform":
        "Self-update is not supported on {platform}/{arch}.",
    "errors.selfUpdate.verifyEntrypointInvalid":
        "The installed CLI entrypoint at {path} is invalid.",
    "errors.selfUpdate.verifyEntrypointMissing":
        "The installed CLI entrypoint at {path} is missing.",
    "errors.selfUpdate.verifyTargetMissing":
        "The installed CLI version file at {path} is missing.",
    "errors.unexpected": "Unexpected error: {message}",
    "errors.log.invalidIndex":
        "Invalid log index: {value}. Use an integer greater than or equal to 1.",
    "log.print.missing": "No debug log was found for index {index}.",
    "checkUpdate.unavailable":
        "Unable to check for updates right now. Please try again later.",
    "checkUpdate.upToDate": "Already up to date at {version}.",
    "checkUpdate.unsupportedVersion":
        "Current version {version} does not support update checks.",
    "update.available.message":
        "Update available {currentVersion} → {latestVersion}",
    "update.available.command":
        "Run {command} to update",
    "commands.update.description":
        "Update the managed CLI install to the latest published release.",
    "commands.update.summary": "Update the CLI",
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
    "arguments.install.version":
        "Specify the target CLI version to install",
    "options.blockId": "Specify the target block id",
    "options.action": "Specify the target action name",
    "options.blockName": "Alias for --block-id",
    "options.connectorKeywords":
        "Specify comma-separated keywords to refine the connector action search",
    "options.data": "Provide JSON input values or @path to a JSON file",
    "options.dryRun": "Validate the request without creating a task",
    "options.debug": "Print the current log file path when the CLI exits",
    "options.description": "Set the required generated skill description",
    "options.days":
        "Set temporary private share duration in days (default 7, maximum 7)",
    "options.downloads":
        "Limit temporary private share installs",
    "options.fileDownloadExt": "Specify the saved file extension",
    "options.fileDownloadName": "Specify the saved file name without the extension",
    "options.fileStatus": "Filter by upload status",
    "options.force":
        "Force reinstallation even when the target version already exists",
    "options.refresh": "Bypass any cached response and fetch fresh data",
    "options.help": "Show help for command",
    "options.noModifyPath":
        "Do not add the executable directory to PATH automatically",
    "options.limit": "Specify the maximum number of items to return",
    "options.format": "Specify output format (use json for structured output)",
    "options.input": "Provide LLM input JSON or @path to a JSON file",
    "options.json": "Alias for --format=json",
    "options.keywords":
        "Specify comma-separated keywords to refine the skill search",
    "options.maxRetries": "Maximum retry count",
    "options.model": "LLM model name",
    "options.skillListSource":
        "Filter by skill source (bundled, registry, or local)",
    "options.skillSyncSource":
        "Select the skill sync source (registry; default registry)",
    "options.skillSyncIgnore":
        "Ignore registry skills by package or skill name pattern",
    "options.icon": "Set the generated skill icon reference",
    "options.title": "Set the generated skill display title",
    "options.visibility":
        "Set package visibility (private or public)",
    "options.skill":
        "Specify skill names to install (use * for all skills)",
    "options.onlyPackageId": "Return only package ids",
    "options.all":
        "Install all published skills without prompting for skill selection",
    "options.agent": "Check one supported skill host",
    "options.nextToken": "Specify the pagination token for the next page",
    "options.packageId": "Filter by package id",
    "options.packageName": "Alias for --package-id",
    "options.page": "Specify the log page number",
    "options.showUrl": "Include download URLs in text output",
    "options.size": "Specify the number of items per page",
    "options.status": "Filter by task status",
    "options.sessionToken": "Log in with a session token",
    "options.schema": "Provide response JSON Schema or @path to a JSON file",
    "options.system": "System prompt text or @path to a text file",
    "options.timeout":
        "Set how long to wait before timing out (default 6h, range 10s to 24h)",
    "options.yes": "Skip confirmation prompts",
    "options.lang": "Specify the display language",
    "options.version": "Show the current version",
    "selfUpdate.install.success": "Installed oo {version}.",
    "selfUpdate.install.executable": "Executable: {path}",
    "selfUpdate.pathConfiguredNote":
        "Added {path} to PATH. Restart your shell to reload PATH and use oo.",
    "selfUpdate.pathPartiallyConfigured.updatedHeader":
        "Updated PATH in:",
    "selfUpdate.pathPartiallyConfigured.failedHeader":
        "Could not update:",
    "selfUpdate.pathPartiallyConfigured.restart":
        "Restart your shell to reload PATH and use oo.",
    "selfUpdate.install.pathNote":
        "Add {path} to PATH to run oo in new shells.",
    "selfUpdate.pathShadowedNote":
        "PATH currently resolves oo to {path} before the managed directory {directory}. Move {directory} earlier in PATH or remove that oo entry, then restart your shell.",
    "selfUpdate.progress.install.header": "Installing oo",
    "selfUpdate.progress.update.header": "Updating oo",
    "selfUpdate.progress.resolve.start": "Resolving latest release...",
    "selfUpdate.progress.resolve.complete": "Resolved latest release {version}.",
    "selfUpdate.progress.prepare.start": "Preparing managed install...",
    "selfUpdate.progress.prepare.complete": "Prepared managed install.",
    "selfUpdate.progress.download.start": "Downloading oo {version}...",
    "selfUpdate.progress.download.complete": "Downloaded oo {version}.",
    "selfUpdate.progress.reuse.start": "Reusing installed oo {version}...",
    "selfUpdate.progress.reuse.complete": "Reused installed oo {version}.",
    "selfUpdate.progress.activate.start": "Activating executable...",
    "selfUpdate.progress.activate.complete": "Activated executable.",
    "selfUpdate.progress.verify.start": "Verifying installation...",
    "selfUpdate.progress.verify.complete": "Verified installation.",
    "selfUpdate.progress.cleanup.start": "Cleaning up old artifacts...",
    "selfUpdate.progress.cleanup.complete": "Cleaned up old artifacts.",
    "selfUpdate.progress.skillsUpdate.start": "Updating installed skills...",
    "selfUpdate.progress.skillsUpdate.complete": "Finished installed skill update.",
    "selfUpdate.lockBusy":
        "Another update is already in progress. Please try again later.",
    "selfUpdate.lockBusyWithPid":
        "Another update is already in progress (PID {ownerPid}). Please try again later.",
    "selfUpdate.unsupportedDevelopmentVersion":
        "Current version {version} does not support managed install or update.",
    "selfUpdate.update.success":
        "Updated oo from {currentVersion} to {version}.",
    "skills.install.allSelected":
        "Installing all {count} skills.",
    "skills.check.success":
        "Local skill editing is ready. Writable storage: {path}. Supported hosts: {count}.",
    "skills.list.noResults":
        "No skills were found.",
    "skills.list.host": "Host",
    "skills.list.host.claude": "Claude Code",
    "skills.list.host.codebuddy": "CodeBuddy",
    "skills.list.host.codex": "Codex",
    "skills.list.host.hermes": "Hermes",
    "skills.list.host.openclaw": "OpenClaw",
    "skills.list.host.qoderwork": "QoderWork",
    "skills.list.host.trae": "Trae",
    "skills.list.host.traeCn": "Trae CN",
    "skills.list.host.workbuddy": "WorkBuddy",
    "skills.list.source": "Source",
    "skills.list.package": "Package",
    "skills.list.path": "Path",
    "skills.list.summary":
        "Found {count} skills.",
    "labels.blocks": "Blocks:",
    "labels.status": "Status",
    "labels.version": "Version",
    "skills.init.success": "Initialized skill {name} in canonical storage at {path}.",
    "skills.init.copied": "Copied skill {name} to {path}.",
    "skills.publish.success":
        "Published skill {name} as {visibility} package {packageName}@{version}. View it at {hubUrl}.",
    "skills.publish.adopted":
        "Adopted skill {name} into local canonical storage at {path}.",
    "skills.publish.adoption.prompt":
        "Skill {name} was found at {path}. Move it into local storage at {localPath} and publish it as {packageName}? [y/N] ",
    "skills.publish.confirm.invalid":
        "Invalid choice. Enter y/yes or n/no.",
    "skills.publish.visibility.invalid":
        "Invalid choice. Enter private or public.",
    "skills.publish.visibility.private": "private",
    "skills.publish.visibility.prompt":
        "Publish skill {name} as package {packageName} with which visibility? [private/public] ",
    "skills.publish.visibility.public": "public",
    "skills.publish.registryPackage.prompt":
        "Skill {name} is installed from {packageName}. Publish it as {targetPackageName}? [y/N] ",
    "skills.publish.remoteBlocks.invalid":
        "Invalid choice. Enter y/yes or n/no.",
    "skills.publish.remoteBlocks.prompt":
        "Remote package {packageName}@{version} contains blocks. Continue publishing skill {name} as {packageName}? [y/N] ",
    "skills.share.confirm.invalid":
        "Invalid choice. Enter y/yes or n/no.",
    "skills.share.confirm.packagePrompt":
        "Share package {packageName}? [y/N] ",
    "skills.share.confirm.prompt":
        "Share skill {name} from package {packageName}? [y/N] ",
    "skills.share.reference.prompt":
        "Which skill id, package name, or skill directory path do you want to share? ",
    "skills.share.packageSuccess":
        "Share prompt for {visibility} package {packageName}:",
    "skills.share.success":
        "Share prompt for skill {skillName} in {visibility} package {packageName}:",
    "warnings.skills.localCopyDriftOverwritten":
        "Warning: Local skill {name} copy at {path} differs from canonical storage and was overwritten.",
    "warnings.skills.publishLocalCopyDriftIgnored":
        "Warning: Local skill {name} has modified agent copies at {paths}; publishing canonical storage at {localPath} and ignoring agent-side changes.",
    "skills.install.success": "Installed skill {name} to {path}.",
    "skills.install.summary.agentsLabel": "Agents",
    "skills.install.summary.detailLine": "{label}: {values}",
    "skills.install.summary.installed": "Installed",
    "skills.install.summary.multipleSkillsMultipleAgents":
        "{status} {skillCount} skills to {agentCount} agents.",
    "skills.install.summary.multipleSkillsSingleAgent":
        "{status} {skillCount} skills to {agentName}.",
    "skills.install.summary.singleSkillMultipleAgents":
        "{status} skill {skillName} to {agentCount} agents: {agentNames}.",
    "skills.install.summary.skillsLabel": "Skills",
    "skills.install.overwrite.invalid":
        "Invalid choice. Enter y/yes or n/no.",
    "skills.install.overwrite.prompt":
        "Skill {name} already exists. Overwrite? [y/N] ",
    "skills.install.selection.prompt":
        "Select skills to install or keep installed (space to toggle)",
    "skills.install.progress.installing.start": "Installing selected skills...",
    "skills.install.progress.installing.complete":
        "Installed",
    "skills.install.progress.installing.failed":
        "Installing selected skills failed",
    "skills.install.progress.removing.start": "Removing deselected skills...",
    "skills.install.progress.removing.complete":
        "Removed",
    "skills.install.progress.removing.failed":
        "Removing deselected skills failed",
    "skills.install.skipped": "Skipped skill {name}.",
    "skills.install.status.conflict": "conflict",
    "skills.install.singleSelected":
        "Skill: {name}",
    "skills.update.noResults":
        "No updatable oo-managed skills were found.",
    "skills.update.current":
        "Skill {name} is already up to date at {version}.",
    "skills.update.failure":
        "Failed to update skill {name}: {message}",
    "skills.update.progress.header": "Updating installed skills",
    "skills.update.progress.checking": "checking for updates",
    "skills.update.progress.preparing": "updating canonical files",
    "skills.update.progress.publishing": "publishing to supported hosts",
    "skills.update.progress.current": "up to date",
    "skills.update.progress.updated": "updated",
    "skills.update.progress.failed": "failed",
    "skills.update.success": "Updated skill {name} to {path}.",
    "skills.sync.apply.noResults":
        "No uploaded registry skills were found.",
    "skills.sync.apply.success":
        "Applied {count} uploaded registry skills.",
    "skills.sync.upload.success":
        "Uploaded {count} registry skills.",
    "skills.uninstall.success": "Removed skill {name} from {path}.",
    "skills.validate.success": "Skill at {path} is valid.",
    "versionInfo.buildTime": "Build Time",
    "versionInfo.commit": "Commit",
    "versionInfo.unknown": "unknown",
    "arguments.filePath": "File path",
    "arguments.index": "Log index",
    "arguments.key": "Configuration key",
    "arguments.outDir": "Output directory",
    "arguments.packageName": "Package name",
    "arguments.packageSpecifier": "Package specifier",
    "arguments.serviceName": "Service name",
    "arguments.shell": "Target shell",
    "arguments.skill": "Skill name",
    "arguments.taskId": "Task id",
    "arguments.text": "Search text",
    "arguments.url": "URL",
    "arguments.value": "Configuration value",
    "cloudTask.text.dryRunPassed": "Validation passed.",
    "cloudTask.text.billing": "Billing",
    "cloudTask.text.error": "Error",
    "cloudTask.text.inputValues": "Input values",
    "cloudTask.text.nextToken": "Next token",
    "cloudTask.text.noLogs": "No logs were returned.",
    "cloudTask.text.noTasks": "No tasks were found.",
    "cloudTask.text.packageBlock": "Package/Block",
    "cloudTask.text.progress": "Progress",
    "cloudTask.text.resultData": "Result data:",
    "cloudTask.text.resultUrl": "Result URL",
    "cloudTask.text.taskId": "Task ID",
    "cloudTask.text.createdAt": "Created",
    "cloudTask.text.updatedAt": "Updated",
    "cloudTask.text.waitingForCompletion":
        "Waiting for completion after {elapsed}.",
    "cloudTask.text.workload": "Workload",
    "cloudTask.status.failed": "failed",
    "cloudTask.status.running": "running",
    "cloudTask.status.scheduled": "scheduled",
    "cloudTask.status.scheduling": "scheduling",
    "cloudTask.status.success": "success",
    "cloudTask.status.queued": "queued",
    "connector.search.text.authenticated": "Authenticated",
    "connector.search.text.authenticated.no": "no",
    "connector.search.text.authenticated.yes": "yes",
    "connector.search.text.noResults":
        "No matching connector actions were found.",
    "mixedSearch.text.kind": "Kind",
    "mixedSearch.text.kind.connector": "connector",
    "mixedSearch.text.kind.package": "package",
    "mixedSearch.text.noResults":
        "No matching packages or connector actions were found.",
    "connector.run.text.dryRunPassed": "Validation passed.",
    "connector.run.text.executionId": "Execution ID",
    "connector.run.text.resultData": "Result data",
    "connector.run.progress.completed":
        "Completed {action} (polls: {pollCount})",
    "connector.run.progress.polling":
        "Polling {action} (poll {pollCount}, state {state})",
    "connector.run.progress.waiting":
        "Waiting for async connector result from {action}...",
    "connector.schema.refresh.success":
        "Cleared locally cached connector action schemas.",
    "file.cleanup.success":
        "Deleted {deletedCount} expired or stale file transfer records.",
    "file.download.savedTo": "Saved to: {path}",
    "file.list.noResults": "No uploaded files were found.",
    "file.list.noResultsForStatus":
        "No {status} uploaded files were found.",
    "file.status.active": "active",
    "file.status.expired": "expired",
    "file.text.downloadUrl": "Download URL",
    "file.text.expiresAt": "Expires at",
    "file.text.fileSize": "File size",
    "file.text.id": "ID",
    "file.text.uploadedAt": "Uploaded at",
    "file.upload.success": "Uploaded {fileName}.",
    "search.text.noResults": "No matching packages were found.",
    "search.text.unnamedBlock": "unnamed-block",
    "search.text.unnamedPackage": "unnamed-package",
    "skills.search.text.noResults": "No matching skills were found.",
    "skills.search.text.package": "Package",
    "skills.search.text.unnamedSkill": "unnamed-skill",
    "packageInfo.text.inputHandle": "Input:",
    "packageInfo.text.outputHandle": "Output:",
    "packageInfo.text.optional": "[optional]",
    "packageInfo.text.required": "[required]",
} as const;

export const zhMessages = {
    "app.description": `${APP_NAME} 是 OOMOL 的 CLI 工具集，一切均可在 CLI 中完成`,
    "auth.login.code": "请输入这个 code 继续登录：{code}",
    "auth.login.openManually": "请在浏览器中打开这个 URL 继续登录：{url}",
    "auth.account.activeAccountMissing": "当前激活账号不存在于认证数据中。",
    "auth.account.loggedIn": "已登录 {endpoint} 账号 {name}",
    "auth.login.waiting": "正在等待 device login 完成...",
    "auth.logout.success": "已登出当前账号。",
    "auth.status.accountId": "账号 ID",
    "auth.status.activeAccount": "当前激活账号",
    "auth.status.apiKeyInvalid": "无效",
    "auth.status.apiKeyRequestFailed": "请求失败",
    "auth.status.apiKeyRequestFailedSandbox":
        "请求失败（网络受限沙箱，请尝试提权）",
    "auth.status.apiKeyStatus": "API key 状态",
    "auth.status.apiKeyValid": "有效",
    "auth.status.loggedOut": "当前没有登录任何 OOMOL 账号。",
    "auth.switch.success": "已将 {endpoint} 的当前激活账号切换为 {name}",
    "commands.auth.description": "管理 CLI 的认证账号。",
    "commands.auth.login.description": "通过 device login 或 session token 登录 OOMOL 账号。",
    "commands.auth.login.summary": "登录 OOMOL 账号",
    "commands.auth.logout.description": "从持久化认证数据中移除当前账号。",
    "commands.auth.logout.summary": "登出当前账号",
    "commands.auth.status.description": "显示当前认证账号并校验其 API key。",
    "commands.auth.status.summary": "显示认证状态",
    "commands.auth.summary": "管理 CLI 认证",
    "commands.auth.switch.description": "切换到下一个已保存的认证账号。",
    "commands.auth.switch.summary": "切换到下一个认证账号",
    "commands.checkUpdate.description": "检查是否有新的 CLI 版本可用。",
    "commands.checkUpdate.summary": "检查 CLI 更新",
    "commands.cloudTask.description": "管理云任务执行流程。",
    "commands.cloudTask.list.description": "按可选条件列出云任务。",
    "commands.cloudTask.list.summary": "列出云任务",
    "commands.cloudTask.log.description": "查看云任务的分页日志。",
    "commands.cloudTask.log.summary": "显示云任务日志",
    "commands.cloudTask.result.description": "查看云任务当前结果。",
    "commands.cloudTask.result.summary": "显示云任务结果",
    "commands.cloudTask.run.description": "校验输入值并为包内 block 创建云任务。",
    "commands.cloudTask.run.summary": "创建云任务",
    "commands.cloudTask.wait.description": "通过轮询任务结果等待云任务结束。",
    "commands.cloudTask.wait.summary": "等待云任务完成",
    "commands.cloudTask.summary": "管理云任务",
    "commands.connector.description":
        "搜索 connector action，并运行已认证的 connector 操作。",
    "commands.connector.summary": "管理 connector action",
    "commands.connector.search.description":
        "搜索 connector action，并将 schema 缓存到本地。",
    "commands.connector.search.summary":
        "搜索 connector action",
    "commands.connector.schema.description":
        "显示一个 connector action 的 schema contract。",
    "commands.connector.schema.refresh.description":
        "清除所有本地缓存的 connector action schema。",
    "commands.connector.schema.refresh.summary":
        "清除 connector action schema cache",
    "commands.connector.schema.summary":
        "显示 connector action schema",
    "commands.connector.run.description":
        "校验输入数据，并运行一个 connector action。",
    "commands.connector.run.summary":
        "运行 connector action",
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
    "commands.telemetry.description":
        "查看并更新受隐私约束的 CLI telemetry 设置。",
    "commands.telemetry.summary": "管理 CLI telemetry",
    "commands.telemetry.disable.description":
        "关闭 CLI telemetry，并同步清空待发送 telemetry 事件。",
    "commands.telemetry.disable.summary": "关闭 CLI telemetry",
    "commands.telemetry.enable.description": "开启 CLI telemetry。",
    "commands.telemetry.enable.summary": "开启 CLI telemetry",
    "commands.telemetry.status.description":
        "显示 telemetry 的实际开关状态、device id 前缀、待发送数量和最后 flush 时间。",
    "commands.telemetry.status.summary": "显示 telemetry 状态",
    "commands.file.cleanup.description": "删除过期或陈旧的文件传输记录。",
    "commands.file.cleanup.summary": "清理文件传输记录",
    "commands.file.description": "管理临时文件传输。",
    "commands.file.list.description": "查看本地记录的临时文件上传记录。",
    "commands.file.list.summary": "查看上传文件列表",
    "commands.file.download.description": "从 URL 下载单个文件并保存到本地。",
    "commands.file.download.summary": "下载远程文件到本地",
    "commands.file.summary": "管理临时文件传输",
    "commands.file.upload.description": "上传文件，并在本地保存带签名的下载地址。",
    "commands.file.upload.summary": "上传文件",
    "commands.install.description":
        "把一个由 oo 管理的 CLI 版本安装到本地托管运行时中。",
    "commands.install.summary": "安装 CLI",
    "commands.llm.config.description":
        "以 JSON 输出当前账号的 LLM client 配置。",
    "commands.llm.config.summary": "显示 LLM client 配置",
    "commands.llm.description":
        "导出当前账号可用的 LLM client 配置。",
    "commands.llm.json.description":
        "调用当前配置的 LLM，要求输出结构化 JSON，使用 JSON Schema 校验，并重试格式错误或不符合 schema 的响应。",
    "commands.llm.json.summary": "使用 LLM 生成已校验的 JSON",
    "commands.llm.summary": "管理 LLM client 配置",
    "commands.help.summary": "显示命令帮助",
    "commands.log.description": "查看持久化的 CLI debug 日志。",
    "commands.log.summary": "管理持久化 debug 日志",
    "commands.log.path.description": "打印当前持久化日志目录路径。",
    "commands.log.path.summary": "显示日志目录路径",
    "commands.log.print.description": "按序号打印某一份更早的持久化 debug 日志文件内容。",
    "commands.log.print.summary": "输出某一份更早的 debug 日志",
    "commands.login.description": "通过 device login 或 session token 登录 OOMOL 账号。是 auth login 的别名。",
    "commands.login.summary": "登录 OOMOL 账号（auth login 的别名）",
    "commands.logout.description": "从持久化认证数据中移除当前账号。是 auth logout 的别名。",
    "commands.logout.summary": "登出当前账号（auth logout 的别名）",
    "commands.package.description": "查看包注册表元数据及相关资源。",
    "commands.package.info.description": "按显式包标识显示转换后的包元数据。",
    "commands.package.info.summary": "显示包元数据",
    "commands.package.summary": "包相关工具",
    "commands.mixedSearch.description":
        "使用一个自由文本查询同时搜索 package 与 connector action。",
    "commands.mixedSearch.summary":
        "搜索 package 与 connector action",
    "commands.search.description": "使用自由文本通过意图搜索 API 搜索包。",
    "commands.search.summary": "按意图搜索包",
    "commands.skills.description": "管理本地 AI Agent skill。",
    "commands.skills.summary": "管理 AI Agent skill",
    "commands.skills.search.description":
        "使用自由文本通过 skills search API 搜索已发布的 skill。",
    "commands.skills.search.summary":
        "搜索已发布的 skill",
    "commands.skills.list.description":
        "列出 bundled、registry 和 local skill。",
    "commands.skills.list.summary":
        "列出 skill",
    "commands.skills.sync.description":
        "通过 skills sync API 同步由 oo 管理的 registry skill。",
    "commands.skills.sync.summary": "同步 registry skill",
    "commands.skills.sync.upload.description":
        "将已安装且由 oo 管理的 registry skill 上传到 skills sync API。",
    "commands.skills.sync.upload.summary": "上传 registry skill",
    "commands.skills.sync.apply.description":
        "将已上传且由 oo 管理的 registry skill 安装到受支持的本地 skill 目录。",
    "commands.skills.sync.apply.summary": "应用已上传的 registry skill",
    "commands.skills.check.description":
        "检查当前环境是否有权限编辑本地 skills。",
    "commands.skills.check.summary": "预检本地 skill 编辑环境",
    "commands.skills.init.description":
        "初始化本地 skill，并发布到受支持的本地 skill 目录。",
    "commands.skills.init.summary": "初始化本地 skill",
    "commands.skills.validate.description":
        "按照通用 skill 契约校验本地 skill 目录。",
    "commands.skills.validate.summary": "校验 skill 目录",
    "commands.skills.publish.description":
        "将一个 skill 转换为 OOMOL 包并发布。",
    "commands.skills.publish.summary": "发布 skill",
    "commands.skills.share.description":
        "分享已发布 skill，私有包会生成临时分享。",
    "commands.skills.share.summary": "分享已发布 skill",
    "commands.skills.install.description":
        "将内置或已发布 skill 安装到受支持的本地 skill 目录。",
    "commands.skills.install.summary": "安装 skill",
    "commands.skills.update.description":
        "将已安装且由 oo 管理的已发布 skill 更新到最新可用版本。",
    "commands.skills.update.summary": "更新由 oo 管理的 skill",
    "commands.skills.uninstall.description": "从受支持的本地 skill 目录移除由 oo 管理的 skill。",
    "commands.skills.uninstall.summary": "移除一个受管理的 skill",
    "config.set.success": "已将 {key} 设置为 {value}。",
    "config.unset.success": "已移除 {key}。",
    "telemetry.disable.success": "已关闭 telemetry。",
    "telemetry.enable.success": "已开启 telemetry。",
    "telemetry.status.deviceId": "device_id: {value}",
    "telemetry.status.enabled": "enabled: {value}",
    "telemetry.status.lastFlush": "last_flush: {value}",
    "telemetry.status.none": "none",
    "telemetry.status.pending": "pending: {value}",
    "errors.commander.excessArguments": "提供了过多的参数。",
    "errors.commander.invalidArgument": "参数无效：{value}。",
    "errors.commander.missingArgument": "缺少必填参数：{value}。",
    "errors.commander.missingMandatoryOptionValue":
        "缺少必填选项的值：{value}。",
    "errors.commander.optionMissingArgument": "选项缺少值：{value}。",
    "errors.commander.suggestion": "你是想输入 {value} 吗？",
    "errors.commander.unknownCommand": "未知命令：{value}。",
    "errors.commander.unknownOption": "未知选项：{value}。",
    "errors.auth.loginInvalidResponse": "auth login 服务返回了不受支持的响应内容。",
    "errors.auth.loginRequestError": "auth login 请求失败：{message}",
    "errors.auth.loginRequestFailed": "auth login 请求返回了 HTTP {status}。",
    "errors.auth.loginTimeout": "等待 device login 完成超时。",
    "errors.auth.noSavedAccounts": "没有可切换的认证账号。",
    "errors.auth.required":
        "使用此命令前请先登录。",
    "errors.auth.sessionTokenRequired": "session token 不能为空。",
    "errors.billing.insufficientCredit":
        "你的 OOMOL 账户余额不足。请充值后再重试：{url}",
    "errors.authStore.invalidToml": "认证文件 {path} 不是有效的 TOML。",
    "errors.authStore.invalidSchema": "认证文件 {path} 的结构不受支持。",
    "errors.authStore.readFailed": "读取认证文件 {path} 失败。",
    "errors.authStore.writeFailed": "写入认证文件 {path} 失败。",
    "errors.shared.invalidFormat":
        "无效的 format：{value}。请使用 json。",
    "errors.shared.invalidPositiveIntegerOption":
        "{option} 的值无效：{value}。请使用大于等于 1 的整数。",
    "errors.shared.networkRestrictedSandboxHint":
        "当前环境可能在网络受限的沙箱中，请尝试提权。",
    "errors.cloudTask.invalidResponse":
        "云任务服务返回了不受支持的响应内容。",
    "errors.cloudTask.requestError":
        "云任务请求失败：{message}",
    "errors.cloudTask.requestFailed":
        "云任务请求返回了 HTTP {status}。",
    "errors.cloudTaskWait.failed":
        "云任务 {taskId} 以失败状态结束。",
    "errors.cloudTaskWait.invalidTimeout":
        "{option} 的值无效：{value}。请使用 10s 到 24h 之间的值，可选后缀为 s、m 或 h。",
    "errors.cloudTaskWait.timedOut":
        "等待云任务 {taskId} 超时，已达到 {timeout}。",
    "errors.cloudTaskList.blockIdRequiresPackageId":
        "使用 --block-id 时必须同时提供 --package-id（或 --package-name）。",
    "errors.cloudTaskList.conflictingOptionValues":
        "为 {left} 和 {right} 提供了冲突的选项值。",
    "errors.cloudTaskList.invalidSize":
        "{option} 的值无效：{value}。请使用 1 到 100 之间的整数。",
    "errors.cloudTaskList.invalidStatus":
        "无效的 status：{value}。请使用 queued、scheduling、scheduled、running、success 或 failed。",
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
    "errors.cloudTaskRun.validation.credentialUnsupported":
        "CLI 暂不支持 credential 类型输入。",
    "errors.cloudTaskRun.validation.expectedType":
        "期望类型为 {expectedType}，实际为 {actualType}。",
    "errors.cloudTaskRun.validation.invalidStoragePath":
        "期望值为以 {prefix} 开头的 Unix 风格路径。",
    "errors.cloudTaskRun.invalidPayloadShape":
        "--data 的 payload 必须是 JSON object。",
    "errors.cloudTaskRun.unknownInputHandle":
        "Block {blockId} 未定义 handle {handle}。",
    "errors.cloudTaskRun.unsupportedContentMediaType":
        "Handle {handle} 使用了暂不支持的 contentMediaType {contentMediaType}。",
    "errors.connectorAuthenticated.invalidResponse":
        "已认证 connector 服务列表返回了不受支持的响应内容。",
    "errors.connectorAuthenticated.requestError":
        "获取已认证 connector 服务列表失败：{message}",
    "errors.connectorAuthenticated.requestFailed":
        "获取已认证 connector 服务列表返回了 HTTP {status}。",
    "errors.connectorMetadata.invalidResponse":
        "connector action 元数据返回了不受支持的响应内容。",
    "errors.connectorMetadata.requestError":
        "获取 connector action 元数据失败：{message}",
    "errors.connectorMetadata.requestFailed":
        "获取 connector action 元数据返回了 HTTP {status}。",
    "errors.connectorRun.actionRequired":
        "--action 选项为必填。",
    "errors.connectorRun.dataFilePathRequired":
        "@data 文件路径不能为空。",
    "errors.connectorRun.dataReadFailed":
        "读取 {path} 中的输入数据失败：{message}",
    "errors.connectorRun.invalidActionSchema":
        "connector action 的输入 schema 无效：{message}",
    "errors.connectorRun.invalidDataJson":
        "--data 的值不是合法 JSON：{message}",
    "errors.connectorRun.invalidPayload":
        "connector action 的输入 payload 无效：{message}",
    "errors.connectorRun.invalidResponse":
        "connector action 运行返回了不受支持的响应内容。",
    "errors.connectorRun.asyncFailed":
        "异步 connector action 返回失败状态 {state}。",
    "errors.connectorRun.asyncHandleMissing":
        "异步 connector action 响应缺少 handle 字段 {field}。",
    "errors.connectorRun.asyncResultMissing":
        "异步 connector action 轮询响应缺少结果字段 {field}。",
    "errors.connectorRun.asyncStateMissing":
        "异步 connector action 轮询响应缺少状态字段 {field}。",
    "errors.connectorRun.asyncTimedOut":
        "等待异步 connector action {action} 超时。",
    "errors.connectorRun.asyncUnknownState":
        "异步 connector action 返回了不支持的状态 {state}。",
    "errors.connectorRun.requestError":
        "运行 connector action 失败：{message}",
    "errors.connectorRun.requestFailed":
        "运行 connector action 返回了 HTTP {status}。",
    "errors.connectorRun.requestFailedWithCode":
        "运行 connector action 返回了 HTTP {status}（errorCode: {errorCode}）。",
    "errors.connectorRun.requestFailedWithMessage":
        "运行 connector action 返回了 HTTP {status}：{message}",
    "errors.connectorRun.requestFailedWithMessageAndCode":
        "运行 connector action 返回了 HTTP {status}（errorCode: {errorCode}）：{message}",
    "errors.connectorSchema.asyncPollSchemaMissing":
        "异步 connector action 缺少 action {action} 的轮询 schema。",
    "errors.connectorSchema.asyncResultSchemaMissing":
        "异步 connector action 的结果 schema 缺少字段 {field}。",
    "errors.connectorSchema.readFailed":
        "读取 {path} 的 connector action schema cache 失败：{message}",
    "errors.connectorSchema.writeFailed":
        "写入 {path} 的 connector action schema cache 失败：{message}",
    "errors.connectorSearch.invalidResponse":
        "connector action 搜索返回了不受支持的响应内容。",
    "errors.connectorSearch.requestError":
        "connector action 搜索请求失败：{message}",
    "errors.connectorSearch.requestFailed":
        "connector action 搜索请求返回了 HTTP {status}。",
    "errors.llmJson.authFailed":
        "LLM 请求返回了 HTTP {status}。请检查当前账号认证信息。",
    "errors.llmJson.endpointNotFound":
        "LLM chat completions endpoint 返回了 HTTP {status}。请使用 oo llm config 提供的规范化 endpoint。",
    "errors.llmJson.inputFilePathRequired":
        "@input 文件路径不能为空。",
    "errors.llmJson.inputReadFailed":
        "读取 {path} 中的输入失败：{message}",
    "errors.llmJson.invalidInputJson":
        "--input 的值不是合法 JSON：{message}",
    "errors.llmJson.invalidMaxRetries":
        "{option} 的值无效：{value}。请使用 0 到 {max} 之间的整数。",
    "errors.llmJson.invalidResponse":
        "LLM 响应内容不受支持。",
    "errors.llmJson.invalidSchema":
        "响应 JSON Schema 无效：{message}",
    "errors.llmJson.invalidSchemaJson":
        "--schema 的值不是合法 JSON：{message}",
    "errors.llmJson.rateLimited":
        "LLM 请求返回了 HTTP {status}。请稍后重试或降低请求频率。",
    "errors.llmJson.requestError":
        "LLM 请求失败：{message}",
    "errors.llmJson.requestFailed":
        "LLM 请求返回了 HTTP {status}。",
    "errors.llmJson.schemaFilePathRequired":
        "@schema 文件路径不能为空。",
    "errors.llmJson.schemaReadFailed":
        "读取 {path} 中的 schema 失败：{message}",
    "errors.llmJson.schemaRequired":
        "--schema 选项为必填。",
    "errors.llmJson.systemFilePathRequired":
        "@system 文件路径不能为空。",
    "errors.llmJson.systemReadFailed":
        "读取 {path} 中的 system prompt 失败：{message}",
    "errors.llmJson.unsupportedRootSchema":
        "当前 endpoint 要求响应 JSON Schema 的根类型必须是 object。",
    "errors.llmJson.validationFailed":
        "重试后 LLM 仍未返回符合 schema 的合法 JSON：{message}",
    "errors.completion.invalidShell":
        "不支持的 shell：{value}。请使用 bash、zsh 或 fish。",
    "errors.checkUpdate.failed": "检查 CLI 更新失败。",
    "errors.config.invalidKey": "无效的配置键：{value}。",
    "errors.config.invalidLangValue":
        "无效的 lang 值：{value}。请使用 en 或 zh。",
    "errors.config.invalidFileDownloadOutDirValue":
        "无效的 file.download.out_dir 值：{value}。请使用非空路径。",
    "errors.config.invalidTelemetryEnabledValue":
        "无效的 telemetry.enabled 值：{value}。请使用 true 或 false。",
    "errors.skills.invalidName":
        "不支持的 skill：{value}。请使用 {choices}。",
    "errors.skills.invalidPath":
        "skill 名称 {name} 解析到了本地 skill 目录之外。",
    "errors.skills.init.invalidIcon":
        "--icon 的值无效。请使用非空 icon 引用。",
    "errors.skills.init.invalidTitle":
        "--title 的值无效。请使用非空显示标题。",
    "errors.skills.init.descriptionRequired":
        "缺少必填的 --description。请为生成的 skill 提供简洁的触发描述。",
    "errors.skills.init.invalidName":
        "无效的 skill 名称：{value}。请使用可规范化为小写短横线格式的名称。",
    "errors.skills.publish.invalidPackageMetadata":
        "skill 包元数据无效：{message}",
    "errors.skills.publish.invalidAgent":
        "不支持的 skill Agent：{value}。请使用 codex、claude、hermes、codebuddy、workbuddy、trae、trae-cn、openclaw 或 qoderwork。",
    "errors.skills.publish.invalidSkillFile":
        "无法发布 {path} 中的 skill：{message}",
    "errors.skills.publish.invalidVisibility":
        "无效的 skill 发布可见性：{value}。请使用 private 或 public。",
    "errors.skills.publish.adoptionCancelled":
        "已在将 {path} 移入本地存储前取消发布 skill {name}。",
    "errors.skills.publish.adoptionConfirmationRequired":
        "在 {path} 找到 skill {name}。请在交互式终端中确认是否将它移入本地存储 {localPath}。",
    "errors.skills.publish.bundledSkill":
        "不能直接发布内置 skill {name}，因为它由 oo CLI 版本管理。请先创建或接管一个本地副本再发布。",
    "errors.skills.publish.localSkillMissing":
        "本地 skill {name} 不存在于 {path}。",
    "errors.skills.publish.localCopyDrift":
        "本地 skill {name} 的 Agent 副本在 {paths} 存在修改。发布只使用 canonical 存储 {localPath}；如需忽略 Agent 侧修改，请传入 --force。",
    "errors.skills.publish.registryMetadataMissing":
        "无法发布 registry skill {name}，因为它位于 {path} 的元数据文件没有标识 packageName。",
    "errors.skills.publish.registryPackageConfirmationRequired":
        "skill {name} 安装自 {packageName}。请在交互式终端中确认是否将它发布为 {targetPackageName}。",
    "errors.skills.publish.registryPackageMismatch":
        "已取消将 skill {name} 发布为 {targetPackageName}：它安装自 {packageName}。",
    "errors.skills.publish.remotePackageHasBlocks":
        "已取消将 skill {name} 发布为 {packageName}：远端包 {packageName}@{version} 中存在区块。",
    "errors.skills.publish.remotePackageHasBlocksConfirmationRequired":
        "远端包 {packageName}@{version} 中存在区块。请在交互式终端中确认是否将 skill {name} 发布为 {packageName}。",
    "errors.skills.publish.remotePackageInvalidVersion":
        "无法将 skill {name} 发布为 {packageName}：远端包 {packageName}@{version} 的版本不是有效 semver。",
    "errors.skills.publish.requestError":
        "skill 包发布请求失败：{message}",
    "errors.skills.publish.requestFailed":
        "skill 包发布请求返回了 HTTP {status}：{message}",
    "errors.skills.publish.visibilityRequired":
        "包 {packageName} 没有可沿用的已有可见性。请在交互式终端中运行，或传入 --visibility private / --visibility public。",
    "errors.skills.publish.skillNotFound":
        "无法在 local、bundled、registry、指定 Agent 或路径来源中找到 skill {name}。",
    "errors.skills.share.cancelled":
        "已取消分享 skill {name}。",
    "errors.skills.share.confirmationRequired":
        "分享前需要确认 skill。请重新运行并传入 -y，以分享来自 {packageName} 的 skill {name}。",
    "errors.skills.share.invalidNumberOption":
        "{option} 的值无效：{value}。请使用数字。",
    "errors.skills.share.invalidResponse":
        "skill 包分享响应无效。",
    "errors.skills.share.notPublished":
        "package 或 skill {name} 尚未发布。",
    "errors.skills.share.referenceRequired":
        "请提供要分享的 skill id、package 名称或 skill 目录路径。",
    "errors.skills.share.requestError":
        "skill 包分享请求失败：{message}",
    "errors.skills.share.requestFailed":
        "skill 包分享请求返回了 HTTP {status}。",
    "errors.fileDownload.downloadFailed":
        "下载文件到 {path} 失败：{message}",
    "errors.fileDownload.invalidExt":
        "--ext 的值无效：{value}。请使用非空且不包含路径分隔符的扩展名。",
    "errors.fileDownload.invalidName":
        "--name 的值无效：{value}。请使用非空且不包含路径分隔符的文件名。",
    "errors.fileDownload.invalidUrl":
        "无效的 URL：{value}。请使用 http 或 https URL。",
    "errors.fileDownload.outDirCreateFailed":
        "准备输出目录 {path} 失败：{message}",
    "errors.fileDownload.outDirNotDirectory":
        "输出路径 {path} 已存在且不是目录。",
    "errors.fileDownload.requestError":
        "下载请求失败：{message}",
    "errors.fileDownload.requestFailed":
        "下载请求返回了 HTTP {status}。",
    "errors.fileList.invalidStatus":
        "无效的 status：{value}。请使用 active 或 expired。",
    "errors.fileUpload.invalidResponse":
        "文件上传服务返回了不受支持的响应内容。",
    "errors.fileUpload.pathNotFile":
        "路径 {path} 不是普通文件。",
    "errors.fileUpload.readFailed":
        "读取文件 {path} 的元数据失败：{message}",
    "errors.fileUpload.requestError":
        "文件上传请求失败：{message}",
    "errors.fileUpload.requestFailed":
        "文件上传请求返回了 HTTP {status}。",
    "errors.fileUpload.tooLarge":
        "文件 {path} 的大小为 {size} 字节，超出了 500 MiB 上限 {max} 字节。",
    "errors.lang.invalidFlag":
        "--lang 的值无效：{value}。请使用 en 或 zh。",
    "errors.search.invalidResponse":
        "搜索服务返回了不受支持的响应内容。",
    "errors.search.requestError":
        "搜索请求失败：{message}",
    "errors.search.requestFailed":
        "搜索请求返回了 HTTP {status}。",
    "errors.skillsSearch.invalidResponse":
        "skills 搜索服务返回了不受支持的响应内容。",
    "errors.skillsSearch.requestError":
        "skills 搜索请求失败：{message}",
    "errors.skillsSearch.requestFailed":
        "skills 搜索请求返回了 HTTP {status}。",
    "errors.packageInfo.invalidPackageSpecifier":
        "无效的包标识：{value}。",
    "errors.packageInfo.invalidResponse":
        "包信息服务返回了不受支持的响应内容。",
    "errors.packageInfo.requestError":
        "包信息请求失败：{message}",
    "errors.packageInfo.requestFailed":
        "包信息请求返回了 HTTP {status}。",
    "errors.skills.codexNotInstalled":
        "未检测到 Codex 安装。期望的 Codex 根目录为 {path}。",
    "errors.skills.claudeNotInstalled":
        "未检测到 Claude Code 安装。期望的 Claude 根目录为 {path}。",
    "errors.skills.codebuddyNotInstalled":
        "未检测到 CodeBuddy 安装。期望的 CodeBuddy 根目录为 {path}。",
    "errors.skills.hermesNotInstalled":
        "未检测到 Hermes 安装。期望的 Hermes 根目录为 {path}。",
    "errors.skills.openclawNotInstalled":
        "未检测到 OpenClaw 安装。期望的 OpenClaw 根目录为 {path}。",
    "errors.skills.qoderworkNotInstalled":
        "未检测到 QoderWork 安装。期望的 QoderWork 根目录为 {path}。",
    "errors.skills.traeNotInstalled":
        "未检测到 Trae 安装。期望的 Trae 根目录为 {path}。",
    "errors.skills.traeCnNotInstalled":
        "未检测到 Trae CN 安装。期望的 Trae CN 根目录为 {path}。",
    "errors.skills.workbuddyNotInstalled":
        "未检测到 WorkBuddy 安装。期望的 WorkBuddy 根目录为 {path}。",
    "errors.skills.noSupportedBundledSkillHosts":
        "未检测到已安装的受支持 Agent。期望其中之一位于：{paths}。",
    "errors.skills.install.confirmationRequired":
        "Skill {name} 已存在，且需要在交互终端中确认覆盖。",
    "errors.skills.install.invalidArchive":
        "下载的包归档中不包含 {name} 对应的有效 skill 目录。",
    "errors.skills.install.invalidPackageInfo":
        "skills install 使用的包信息服务返回了不受支持的响应内容。",
    "errors.skills.install.invalidPackageSpecifier":
        "无效的 skills 包标识：{value}。",
    "errors.skills.install.noPublishedSkills":
        "包 {packageName} 没有发布任何 skill。",
    "errors.skills.install.nonInteractiveSelection":
        "包 {packageName} 包含多个 skill。请使用 --skill <name>、--all -y，或在交互终端中运行。",
    "errors.skills.list.invalidSource":
        "无效的 source：{value}。请使用 bundled、registry 或 local。",
    "errors.skills.sync.invalidResponse":
        "skills sync 服务返回了不受支持的响应内容。",
    "errors.skills.sync.invalidSource":
        "无效的 sync source：{value}。请使用 registry。",
    "errors.skills.sync.requestError":
        "skills sync 请求失败：{message}",
    "errors.skills.sync.requestFailed":
        "skills sync 请求返回了 HTTP {status}。",
    "errors.skills.install.packageDownloadError":
        "下载 skills 包失败：{message}",
    "errors.skills.install.packageDownloadFailed":
        "skills 包下载请求返回了 HTTP {status}。",
    "errors.skills.install.packageInfoRequestError":
        "skills install 的包信息请求失败：{message}",
    "errors.skills.install.packageInfoRequestFailed":
        "skills install 的包信息请求返回了 HTTP {status}。",
    "errors.skills.install.skillNotFound":
        "在包 {packageName} 中未找到 skill {name}。",
    "errors.skills.update.bundledUnsupported":
        "内置 skill {name} 由 oo 管理，不能通过 skills update 更新。请改用 oo skills add {name}。",
    "errors.skills.update.packageNameMissing":
        "无法在 {hostNames} 中更新由 oo 管理的 skill {name}，因为缺少 package 元数据。",
    "errors.skills.update.notManaged":
        "Agent {hostName} 中的 skill {name} 不是由 oo 管理的 skill，无法更新。",
    "errors.skills.nameConflict":
        "Skill 名称 {name} 已被 {path} 中的非 OOMOL skill 占用。",
    "errors.skills.storageConflict":
        "{path} 中用于 {name} 的内置 skill 存储目录已被非 OOMOL 内容占用。",
    "errors.skills.notInstalled":
        "Skill {name} 未安装在 {path}。",
    "errors.skills.notManaged":
        "{name} 不是由 oo 管理的 skill，无法移除。",
    "errors.skills.check.storageNotWritable":
        "本地 skill 存储目录 {path} 不可写：{message}",
    "errors.skills.validate.failed":
        "Skill 校验失败：{message}",
    "errors.store.invalidToml": "配置文件 {path} 不是有效的 TOML。",
    "errors.store.invalidSchema": "配置文件 {path} 的结构不受支持。",
    "errors.store.readFailed": "读取配置文件 {path} 失败。",
    "errors.store.writeFailed": "写入配置文件 {path} 失败。",
    "errors.selfUpdate.downloadError":
        "下载目标 CLI 版本失败：{message}",
    "errors.selfUpdate.downloadFailed":
        "CLI 下载请求返回了 HTTP {status}。",
    "errors.selfUpdate.downloadStalled":
        "下载长时间没有进度，自动重试后仍未完成，请稍后再试。",
    "errors.selfUpdate.downloadTimedOut":
        "下载目标 CLI 版本超时。",
    "errors.selfUpdate.invalidTargetVersion":
        "无效的目标 CLI 版本：{version}。请使用 semver 版本号。",
    "errors.selfUpdate.latestVersionUnavailable":
        "解析最新 CLI 版本失败。",
    "errors.selfUpdate.unsupportedPlatform":
        "当前平台 {platform}/{arch} 暂不支持 self-update。",
    "errors.selfUpdate.verifyEntrypointInvalid":
        "已安装的 CLI 入口文件 {path} 无效。",
    "errors.selfUpdate.verifyEntrypointMissing":
        "已安装的 CLI 入口文件 {path} 不存在。",
    "errors.selfUpdate.verifyTargetMissing":
        "已安装的 CLI 版本文件 {path} 不存在。",
    "errors.unexpected": "发生了未预期错误：{message}",
    "errors.log.invalidIndex":
        "无效的日志序号：{value}。请使用大于等于 1 的整数。",
    "log.print.missing": "未找到序号为 {index} 的 debug 日志。",
    "checkUpdate.unavailable": "暂时无法检查更新，请稍后重试。",
    "checkUpdate.upToDate": "当前已是最新版本 {version}。",
    "checkUpdate.unsupportedVersion":
        "当前版本 {version} 暂不支持执行更新检查。",
    "update.available.message":
        "发现新版本 {currentVersion} → {latestVersion}",
    "update.available.command":
        "运行 {command} 进行升级",
    "commands.update.description":
        "把托管 CLI 安装更新到最新发布版本。",
    "commands.update.summary": "更新 CLI",
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
    "arguments.install.version":
        "指定要安装的目标 CLI 版本",
    "options.blockId": "指定目标 block id",
    "options.action": "指定目标 action 名称",
    "options.blockName": "--block-id 的别名",
    "options.connectorKeywords":
        "指定用于细化 connector action 搜索的逗号分隔关键词",
    "options.data": "提供 JSON 输入值，或使用 @路径 读取 JSON 文件",
    "options.dryRun": "仅校验请求，不真正创建任务",
    "options.debug": "在 CLI 退出时打印当前日志文件路径",
    "options.description": "设置必填的生成 skill 描述",
    "options.days": "设置私有包临时分享天数（默认 7，最长 7）",
    "options.downloads": "限制私有包临时分享安装次数",
    "options.fileDownloadExt": "指定保存文件的扩展名",
    "options.fileDownloadName": "指定不带扩展名的保存文件名",
    "options.fileStatus": "按上传状态过滤",
    "options.force":
        "即使目标版本已存在也强制重新安装",
    "options.refresh": "绕过缓存并获取最新数据",
    "options.help": "显示命令帮助",
    "options.noModifyPath":
        "不要自动将可执行目录加入 PATH",
    "options.limit": "指定最多返回多少条记录",
    "options.format": "指定输出格式（使用 json 返回结构化内容）",
    "options.input": "提供 LLM 输入 JSON，或使用 @路径 读取 JSON 文件",
    "options.json": "--format=json 的别名",
    "options.keywords":
        "指定用于细化 skill 搜索的逗号分隔关键词",
    "options.maxRetries": "最大重试次数",
    "options.model": "LLM 模型名",
    "options.skillListSource":
        "按 skill 来源过滤（bundled、registry 或 local）",
    "options.skillSyncSource":
        "选择 skill 同步来源（registry；默认 registry）",
    "options.skillSyncIgnore":
        "按 package 或 skill 名称模式忽略 registry skill",
    "options.icon": "设置生成的 skill icon 引用",
    "options.title": "设置生成的 skill 显示标题",
    "options.visibility":
        "设置包可见性（private 或 public）",
    "options.skill":
        "指定要安装的 skill 名称（使用 * 表示全部）",
    "options.onlyPackageId": "仅返回 package id",
    "options.all":
        "安装全部已发布 skill，并跳过 skill 选择提示",
    "options.agent": "检查一个受支持的 Agent",
    "options.nextToken": "指定下一页分页令牌",
    "options.packageId": "按 package id 过滤",
    "options.packageName": "--package-id 的别名",
    "options.page": "指定日志页码",
    "options.showUrl": "在文本输出中包含下载 URL",
    "options.size": "指定每页数量",
    "options.status": "按任务状态过滤",
    "options.sessionToken": "使用 session token 登录",
    "options.schema": "提供响应 JSON Schema，或使用 @路径 读取 JSON 文件",
    "options.system": "System prompt 文本，或使用 @路径 读取文本文件",
    "options.timeout": "设置等待超时时间（默认 6h，范围 10s 到 24h）",
    "options.yes": "跳过确认提示",
    "options.lang": "指定显示语言",
    "options.version": "显示当前版本",
    "selfUpdate.install.success": "已安装 oo {version}。",
    "selfUpdate.install.executable": "可执行入口：{path}",
    "selfUpdate.pathConfiguredNote":
        "已将 {path} 加入 PATH。请重启 shell 以重新加载 PATH 后使用 oo。",
    "selfUpdate.pathPartiallyConfigured.updatedHeader":
        "已为以下 profile 配置 PATH：",
    "selfUpdate.pathPartiallyConfigured.failedHeader":
        "以下 profile 写入失败：",
    "selfUpdate.pathPartiallyConfigured.restart":
        "请重启 shell 以重新加载 PATH 后使用 oo。",
    "selfUpdate.install.pathNote":
        "请把 {path} 加入 PATH，新的 shell 才能直接运行 oo。",
    "selfUpdate.pathShadowedNote":
        "当前 PATH 会先解析到 {path}，早于托管目录 {directory}。请把 {directory} 移到 PATH 更靠前的位置，或移除该 oo 入口，然后重启 shell。",
    "selfUpdate.progress.install.header": "正在安装 oo",
    "selfUpdate.progress.update.header": "正在更新 oo",
    "selfUpdate.progress.resolve.start": "正在解析最新发布版本...",
    "selfUpdate.progress.resolve.complete": "已解析最新发布版本 {version}。",
    "selfUpdate.progress.prepare.start": "正在准备托管安装目录...",
    "selfUpdate.progress.prepare.complete": "已准备托管安装目录。",
    "selfUpdate.progress.download.start": "正在下载 oo {version}...",
    "selfUpdate.progress.download.complete": "已下载 oo {version}。",
    "selfUpdate.progress.reuse.start": "正在复用已安装的 oo {version}...",
    "selfUpdate.progress.reuse.complete": "已复用已安装的 oo {version}。",
    "selfUpdate.progress.activate.start": "正在激活可执行入口...",
    "selfUpdate.progress.activate.complete": "已激活可执行入口。",
    "selfUpdate.progress.verify.start": "正在校验安装结果...",
    "selfUpdate.progress.verify.complete": "已校验安装结果。",
    "selfUpdate.progress.cleanup.start": "正在清理旧产物...",
    "selfUpdate.progress.cleanup.complete": "已清理旧产物。",
    "selfUpdate.progress.skillsUpdate.start": "正在更新已安装的 skill...",
    "selfUpdate.progress.skillsUpdate.complete": "已完成已安装 skill 更新。",
    "selfUpdate.lockBusy":
        "另一个更新已在进行中，请稍后再试。",
    "selfUpdate.lockBusyWithPid":
        "另一个更新已在进行中（PID {ownerPid}），请稍后再试。",
    "selfUpdate.unsupportedDevelopmentVersion":
        "当前版本 {version} 暂不支持托管 install 或 update。",
    "selfUpdate.update.success":
        "已将 oo 从 {currentVersion} 更新到 {version}。",
    "skills.install.allSelected":
        "将安装全部 {count} 个 skill。",
    "skills.check.success":
        "本地 skill 编辑环境可用。可写存储：{path}。受支持 Agents：{count}。",
    "skills.list.noResults":
        "未找到 skill。",
    "skills.list.host": "Agents",
    "skills.list.host.claude": "Claude Code",
    "skills.list.host.codebuddy": "CodeBuddy",
    "skills.list.host.codex": "Codex",
    "skills.list.host.hermes": "Hermes",
    "skills.list.host.openclaw": "OpenClaw",
    "skills.list.host.qoderwork": "QoderWork",
    "skills.list.host.trae": "Trae",
    "skills.list.host.traeCn": "Trae CN",
    "skills.list.host.workbuddy": "WorkBuddy",
    "skills.list.source": "来源",
    "skills.list.package": "Package",
    "skills.list.path": "路径",
    "skills.list.summary":
        "找到 {count} 个 skill。",
    "labels.blocks": "功能块：",
    "labels.status": "状态",
    "labels.version": "版本",
    "skills.init.success": "已在 canonical 存储 {path} 初始化 skill {name}。",
    "skills.init.copied": "已将 skill {name} 复制到 {path}。",
    "skills.publish.success":
        "已将 skill {name} 以{visibility}发布为 {packageName}@{version}。可在 {hubUrl} 查看。",
    "skills.publish.adopted":
        "已将 skill {name} 接管到本地 canonical 存储 {path}。",
    "skills.publish.adoption.prompt":
        "在 {path} 找到 skill {name}。是否将它移入本地存储 {localPath} 并发布为 {packageName}？[y/N] ",
    "skills.publish.confirm.invalid":
        "输入无效。请输入 y/yes 或 n/no。",
    "skills.publish.visibility.invalid":
        "输入无效。请输入 private 或 public。",
    "skills.publish.visibility.private": "私有包",
    "skills.publish.visibility.prompt":
        "要以哪种可见性发布 skill {name} 为包 {packageName}？[private/public] ",
    "skills.publish.visibility.public": "公开包",
    "skills.publish.registryPackage.prompt":
        "skill {name} 安装自 {packageName}。是否发布为 {targetPackageName}？[y/N] ",
    "skills.publish.remoteBlocks.invalid":
        "输入无效。请输入 y/yes 或 n/no。",
    "skills.publish.remoteBlocks.prompt":
        "远端包 {packageName}@{version} 中存在区块。是否继续将 skill {name} 发布为 {packageName}？[y/N] ",
    "skills.share.confirm.invalid":
        "输入无效。请输入 y/yes 或 n/no。",
    "skills.share.confirm.packagePrompt":
        "是否分享 package {packageName}？[y/N] ",
    "skills.share.confirm.prompt":
        "是否分享来自包 {packageName} 的 skill {name}？[y/N] ",
    "skills.share.reference.prompt":
        "要分享哪个 skill id、package 名称或 skill 目录路径？",
    "skills.share.packageSuccess":
        "{visibility} package {packageName} 的分享提示词：",
    "skills.share.success":
        "skill {skillName} 在 {visibility} package {packageName} 中的分享提示词：",
    "warnings.skills.localCopyDriftOverwritten":
        "Warning: 本地 skill {name} 位于 {path} 的副本与 canonical 存储不一致，已被覆盖。",
    "warnings.skills.publishLocalCopyDriftIgnored":
        "Warning: 本地 skill {name} 的 Agent 副本在 {paths} 存在修改；将发布 canonical 存储 {localPath} 并忽略 Agent 侧修改。",
    "skills.install.success": "已将 skill {name} 安装到 {path}。",
    "skills.install.summary.agentsLabel": "Agents",
    "skills.install.summary.detailLine": "{label}：{values}",
    "skills.install.summary.installed": "已安装",
    "skills.install.summary.multipleSkillsMultipleAgents":
        "{status} {skillCount} 个 skills 到 {agentCount} 个 Agents。",
    "skills.install.summary.multipleSkillsSingleAgent":
        "{status} {skillCount} 个 skills 到 {agentName}。",
    "skills.install.summary.singleSkillMultipleAgents":
        "{status} skill {skillName} 到 {agentCount} 个 Agents：{agentNames}。",
    "skills.install.summary.skillsLabel": "Skills",
    "skills.install.overwrite.invalid":
        "输入无效。请输入 y/yes 或 n/no。",
    "skills.install.overwrite.prompt":
        "Skill {name} 已存在，是否覆盖？[y/N] ",
    "skills.install.selection.prompt":
        "选择要安装或保留的 skill（空格切换）",
    "skills.install.progress.installing.start": "正在安装所选 skill...",
    "skills.install.progress.installing.complete":
        "已安装",
    "skills.install.progress.installing.failed":
        "安装所选 skill 失败",
    "skills.install.progress.removing.start": "正在移除未选择的 skill...",
    "skills.install.progress.removing.complete":
        "已移除",
    "skills.install.progress.removing.failed":
        "移除未选择的 skill 失败",
    "skills.install.skipped": "已跳过 skill {name}。",
    "skills.install.status.conflict": "冲突",
    "skills.install.singleSelected":
        "Skill：{name}",
    "skills.update.noResults":
        "未找到可更新的 oo-managed skill。",
    "skills.update.current":
        "skill {name} 已是最新版本 {version}。",
    "skills.update.failure":
        "更新 skill {name} 失败：{message}",
    "skills.update.progress.header": "正在更新已安装的 skill",
    "skills.update.progress.checking": "检查更新中",
    "skills.update.progress.preparing": "更新 canonical 文件中",
    "skills.update.progress.publishing": "同步到受支持 Agents 中",
    "skills.update.progress.current": "已是最新",
    "skills.update.progress.updated": "已更新",
    "skills.update.progress.failed": "失败",
    "skills.update.success": "已将 skill {name} 更新到 {path}。",
    "skills.sync.apply.noResults":
        "未找到已上传的 registry skill。",
    "skills.sync.apply.success":
        "已应用 {count} 个已上传的 registry skill。",
    "skills.sync.upload.success":
        "已上传 {count} 个 registry skill。",
    "skills.uninstall.success": "已从 {path} 移除 skill {name}。",
    "skills.validate.success": "{path} 中的 skill 有效。",
    "versionInfo.buildTime": "构建时间",
    "versionInfo.commit": "提交",
    "versionInfo.unknown": "未知",
    "arguments.filePath": "文件路径",
    "arguments.index": "日志序号",
    "arguments.key": "配置键",
    "arguments.outDir": "输出目录",
    "arguments.packageName": "包名",
    "arguments.packageSpecifier": "包标识",
    "arguments.serviceName": "服务名",
    "arguments.shell": "目标 shell",
    "arguments.skill": "skill 名称",
    "arguments.taskId": "任务 ID",
    "arguments.text": "搜索文本",
    "arguments.url": "URL",
    "arguments.value": "配置值",
    "cloudTask.text.dryRunPassed": "校验通过。",
    "cloudTask.text.billing": "账单",
    "cloudTask.text.error": "错误",
    "cloudTask.text.inputValues": "输入参数",
    "cloudTask.text.nextToken": "下一页令牌",
    "cloudTask.text.noLogs": "没有返回任何日志。",
    "cloudTask.text.noTasks": "未找到任何任务。",
    "cloudTask.text.packageBlock": "包 / Block",
    "cloudTask.text.progress": "进度",
    "cloudTask.text.resultData": "结果数据：",
    "cloudTask.text.resultUrl": "结果 URL",
    "cloudTask.text.taskId": "任务 ID",
    "cloudTask.text.createdAt": "创建时间",
    "cloudTask.text.updatedAt": "更新时间",
    "cloudTask.text.waitingForCompletion": "已等待 {elapsed}，任务仍在进行中。",
    "cloudTask.text.workload": "工作负载",
    "cloudTask.status.failed": "失败",
    "cloudTask.status.running": "运行中",
    "cloudTask.status.scheduled": "已调度",
    "cloudTask.status.scheduling": "调度中",
    "cloudTask.status.success": "成功",
    "cloudTask.status.queued": "排队中",
    "connector.search.text.authenticated": "已认证",
    "connector.search.text.authenticated.no": "否",
    "connector.search.text.authenticated.yes": "是",
    "connector.search.text.noResults": "未找到匹配的 connector action。",
    "mixedSearch.text.kind": "类型",
    "mixedSearch.text.kind.connector": "connector",
    "mixedSearch.text.kind.package": "包",
    "mixedSearch.text.noResults": "未找到匹配的包或 connector action。",
    "connector.run.text.dryRunPassed": "校验通过。",
    "connector.run.text.executionId": "执行 ID",
    "connector.run.text.resultData": "结果数据",
    "connector.run.progress.completed":
        "{action} 已完成（轮询次数：{pollCount}）",
    "connector.run.progress.polling":
        "正在轮询 {action}（第 {pollCount} 次，状态 {state}）",
    "connector.run.progress.waiting":
        "正在等待 {action} 的异步 connector 结果...",
    "connector.schema.refresh.success":
        "已清除本地缓存的 connector action schema。",
    "file.cleanup.success": "已删除 {deletedCount} 条过期或陈旧的文件传输记录。",
    "file.download.savedTo": "已保存到：{path}",
    "file.list.noResults": "未找到任何上传记录。",
    "file.list.noResultsForStatus": "未找到状态为 {status} 的上传记录。",
    "file.status.active": "有效",
    "file.status.expired": "已过期",
    "file.text.downloadUrl": "下载 URL",
    "file.text.expiresAt": "过期时间",
    "file.text.fileSize": "文件大小",
    "file.text.id": "ID",
    "file.text.uploadedAt": "上传时间",
    "file.upload.success": "已上传 {fileName}。",
    "search.text.noResults": "未找到匹配的包。",
    "search.text.unnamedBlock": "未命名功能块",
    "search.text.unnamedPackage": "未命名包",
    "skills.search.text.noResults": "未找到匹配的 skill。",
    "skills.search.text.package": "包",
    "skills.search.text.unnamedSkill": "未命名 skill",
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
