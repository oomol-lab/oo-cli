import { APP_NAME } from "../application/config/app-config.ts";

export const enMessages = {
    "app.description": `${APP_NAME} is OOMOL's CLI toolkit. Everything can be done in the CLI.`,
    "auth.login.openManually": "Open this login URL in your browser:",
    "auth.account.activeAccountMissing":
        "The active account is missing from the auth store.",
    "auth.account.loggedIn": "Logged in to {endpoint} account {name}",
    "auth.login.waiting": "Waiting for the device login to complete...",
    "auth.logout.success": "Logged out the current account.",
    "auth.status.accountActive": "active",
    "auth.status.accountId": "Account ID",
    "auth.status.accountsLabel": "Accounts",
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
        "Log in with an OOMOL account using device login, a session token, or an API key.",
    "commands.auth.login.summary": "Log in with an OOMOL account",
    "commands.auth.logout.description": "Remove the current account from persisted auth data.",
    "commands.auth.logout.summary": "Log out the current account",
    "commands.auth.status.description": "Show saved auth accounts and validate the active API key.",
    "commands.auth.status.summary": "Show auth status",
    "commands.auth.summary": "Manage CLI authentication",
    "commands.auth.switch.description": "Switch to the next saved auth account, or to a specific account with --user.",
    "commands.auth.switch.summary": "Switch to the next auth account",
    "options.auth.switch.user": "Switch to the account whose id or unique name matches the given value",
    "commands.checkUpdate.description":
        "Check whether a newer CLI release is available.",
    "commands.checkUpdate.summary": "Check for CLI updates",
    "commands.connector.description":
        "Search connector actions and run authenticated connector operations.",
    "commands.connector.summary": "Manage connector actions",
    "commands.connector.search.description":
        "Search connector actions.",
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
    "commands.info.description":
        "Print CLI environment details, persisted store paths, and detected skill agents.",
    "commands.info.summary": "Show CLI environment info",
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
        "Log in with an OOMOL account using device login, a session token, or an API key. Alias for auth login.",
    "commands.login.summary": "Log in with an OOMOL account (alias for auth login)",
    "commands.logout.description":
        "Remove the current account from persisted auth data. Alias for auth logout.",
    "commands.logout.summary":
        "Log out the current account (alias for auth logout)",
    "commands.search.description":
        "Search connector actions with one free-form query.",
    "commands.search.summary": "Search connector actions",
    "commands.skills.description":
        "Manage local AI agent skills.",
    "commands.skills.summary": "Manage AI agent skills",
    "commands.skills.search.description":
        "Search published skills against the skills search API.",
    "commands.skills.search.summary":
        "Search published skills",
    "commands.skills.info.description":
        "Show bundled, registry, and local skills installed in this environment.",
    "commands.skills.info.summary":
        "Show installed skills",
    "commands.skills.locate.description":
        "Print the local path for an installed skill.",
    "commands.skills.locate.summary": "Locate a skill path",
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
        "Check whether this environment can author local skills for an agent.",
    "commands.skills.check.summary": "Preflight local skill editing",
    "commands.skills.init.description":
        "Initialize a local skill in the selected agent's skill directory.",
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
    "commands.skills.repair.description":
        "Force re-deploy one or more oo-managed skills from their trusted source into one or more agent skill directories.",
    "commands.skills.repair.summary": "Repair installed skills from trusted source",
    "options.skills.repair.skill":
        "Skill name to repair (required, may be repeated)",
    "options.skills.repair.agent":
        "Agent to repair into (may be repeated; defaults to all currently available supported agents)",
    "skills.repair.success":
        "Repaired {skillCount} skill(s) for {agentCount} agent(s).",
    "skills.repair.success.line": "  {name}: {agents}",
    "skills.repair.failure":
        "Failed to repair {count} skill-agent pair(s).",
    "skills.repair.failure.line": "  {name} ({agent}): {reason}",
    "errors.skills.repair.skillRequired":
        "At least one --skill <name> is required.",
    "errors.skills.repair.localUnsupported":
        "Skill {name} is a local skill and is not repairable; local skills are agent-native sources.",
    "errors.skills.repair.partialFailure":
        "{count} skill-agent pair(s) failed to repair.",
    "errors.skills.install.partialFailure":
        "{count} skill operation(s) failed.",
    "errors.skills.uninstall.partialFailure":
        "{count} skill operation(s) failed.",
    "errors.skills.update.partialFailure":
        "{count} skill operation(s) failed.",
    "errors.skills.sync.upload.partialFailure":
        "Skill sync upload failed.",
    "errors.skills.sync.apply.partialFailure":
        "{count} skill operation(s) failed.",
    "errors.skills.repair.sourceNotFound":
        "Managed registry canonical source was not found.",
    "errors.skills.repair.sourceInvalid":
        "Managed registry canonical metadata is missing or not a registry skill.",
    "errors.skills.repair.invalidPath":
        "Target path escapes the managed skills directory.",
    "errors.skills.repair.writeFailed":
        "Failed to write the skill source to the target agent directory.",
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
    "errors.auth.apiKeyInvalid":
        "The API key is invalid or has expired.",
    "errors.auth.apiKeyRequired":
        "API key must not be empty.",
    "errors.auth.loginInvalidResponse":
        "The auth login service returned an unsupported response body.",
    "errors.auth.loginMethodConflict":
        "Use only one of --api-key or --session-token.",
    "errors.auth.loginRequestError":
        "The auth login request failed: {message}",
    "errors.auth.loginRequestFailed":
        "The auth login request returned HTTP {status}.",
    "errors.auth.loginTimeout":
        "Timed out after {timeout} waiting for the device login to complete.",
    "errors.auth.noSavedAccounts":
        "There are no auth accounts to switch to.",
    "errors.auth.required":
        "You must log in before using this command.",
    "errors.auth.sessionTokenRequired":
        "Session token must not be empty.",
    "errors.auth.switch.userAmbiguous":
        "Multiple saved accounts have the name {value}. Pass --user <account-id> to disambiguate.",
    "errors.auth.switch.userNotFound":
        "No saved account matches {value}.",
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
        "The async connector action submit response is missing handle field {field}.",
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
        "Connector action {action} returned HTTP {status}.",
    "errors.connectorRun.requestFailedWithCode":
        "Connector action {action} returned HTTP {status} (errorCode: {errorCode}).",
    "errors.connectorRun.requestFailedWithMessage":
        "Connector action {action} returned HTTP {status}: {message}",
    "errors.connectorRun.requestFailedWithMessageAndCode":
        "Connector action {action} returned HTTP {status} (errorCode: {errorCode}): {message}",
    "errors.connectorRun.waitUnsupported":
        "The --wait option is only supported for connector actions with an async result lifecycle.",
    "errors.connectorRun.waitModeConflict":
        "Use either --wait or --wait-result, not both.",
    "errors.connectorRun.waitResultActionUnsupported":
        "The result action {action} configured for --wait-result must declare an async result lifecycle.",
    "errors.connectorRun.waitResultUnsupported":
        "The --wait-result option is only supported for connector actions with an async submit lifecycle.",
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
    "errors.skills.init.agentRequired":
        "Missing required --agent. Choose {agents}.",
    "errors.skills.init.invalidAgent":
        "Unsupported skill agent: {value}. Use {agents}.",
    "errors.skills.init.invalidTitle":
        "Invalid value for --title. Use a non-empty display title.",
    "errors.skills.init.descriptionRequired":
        "Missing required --description. Provide a concise trigger description for the generated skill.",
    "errors.skills.init.invalidName":
        "Invalid skill name: {value}. Use a name that can be normalized to lowercase hyphen-case.",
    "errors.skills.check.agentRequired":
        "Missing required --agent. Choose {agents}.",
    "errors.skills.check.invalidAgent":
        "Unsupported skill agent: {value}. Use {agents}.",
    "errors.skills.publish.invalidPackageMetadata":
        "Invalid skill package metadata: {message}",
    "errors.skills.publish.invalidAgent":
        "Unsupported skill agent: {value}. Use {agents}.",
    "errors.skills.locate.invalidAgent":
        "Unsupported skill agent: {value}. Use {agents}.",
    "errors.skills.locate.ambiguous":
        "Skill {name} matches multiple local paths. Pass --agent or publish one path directly:\n{paths}",
    "errors.skills.locate.invalidSkillId":
        "Invalid skill id {name}. Pass a skill id to locate, or pass a path directly to oo skills publish.",
    "errors.skills.locate.notFound":
        "Cannot find skill {name} in installed skill paths.",
    "errors.skills.publish.invalidSkillFile":
        "Cannot publish the skill at {path}: {message}",
    "errors.skills.publish.invalidOwnershipMetadata":
        "Cannot publish the skill because its oo metadata file at {path} is invalid.",
    "errors.skills.publish.invalidVisibility":
        "Invalid skill publish visibility: {value}. Use private or public.",
    "errors.skills.publish.bundledSkill":
        "Bundled skill {name} cannot be published directly because it is managed by the oo CLI release. Create a local skill before publishing.",
    "errors.skills.publish.localSkillAmbiguous":
        "Local skill {name} exists in multiple local sources ({agents}). Pass --agent to choose which agent-native skill to publish.",
    "errors.skills.share.localSkillAmbiguous":
        "Local skill {name} exists in multiple local sources ({agents}). Pass --agent to choose which agent-native skill to share.",
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
        "Cannot find a skill directory or SKILL.md at {name}. Use oo skills locate <skill-id> to resolve an installed skill path.",
    "errors.skills.publish.visibilityRequired":
        "Package {packageName} does not have an existing visibility to preserve. Run in an interactive terminal or pass --visibility private or --visibility public.",
    "errors.skills.list.invalidAgent":
        "Unsupported skill agent: {value}. Use {agents}.",
    "errors.skills.uninstall.invalidAgent":
        "Unsupported skill agent: {value}. Use {agents}.",
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
    "errors.skills.agentNotInstalled":
        "{agentName} is not installed. Expected the {agentName} home directory at {path}.",
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
    "errors.skills.skillFilterNoMatch":
        "None of the requested skills exist. Available skills: {skills}.",
    "errors.skills.update.bundledUnsupported":
        "Bundled skill {name} is managed by oo and cannot be updated with skills update. Use oo skills add {name} instead.",
    "errors.skills.update.packageNotInstalled":
        "No installed oo-managed skill belongs to package {packageName}.",
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
    "info.section.cli": "CLI",
    "info.section.agents": "Agents",
    "info.section.features": "Features",
    "info.cli.version": "Version",
    "info.cli.platform": "Platform",
    "info.cli.arch": "Architecture",
    "info.cli.storeDir": "Store directory",
    "info.cli.logDir": "Log directory",
    "info.cli.authFile": "Auth file",
    "info.cli.settingsFile": "Settings file",
    "info.agents.empty": "No supported skill agents detected.",
    "info.agents.skillDir": "Skill directory",
    "info.agents.status.available": "available",
    "info.agents.status.no_skills": "no skills",
    "info.agents.status.not_installed": "not installed",
    "info.features.empty": "No optional features enabled.",
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
    "commands.uninstall.description":
        "Uninstall the CLI runtime and its built-in skills. Use --purge to also remove user data and all oo-managed registry skills.",
    "commands.uninstall.summary": "Uninstall the CLI",
    "options.uninstall.yes": "Skip the confirmation prompt (required in non-interactive terminals)",
    "options.uninstall.dryRun": "Print what would be removed without deleting anything",
    "options.uninstall.purge":
        "Also remove user data (auth, settings, cache, logs, telemetry) and all oo-managed registry skills",
    "uninstall.plan.header": "oo uninstall plan",
    "uninstall.plan.removeRuntime": "Runtime to remove:",
    "uninstall.plan.removeSkills": "Skills to remove:",
    "uninstall.plan.removeData": "User data to remove:",
    "uninstall.plan.deferred": "Removed after this process exits:",
    "uninstall.plan.retained": "Retained:",
    "uninstall.plan.retainedSkill.registry": "  registry skill: {path}",
    "uninstall.plan.retainedSkill.local": "  local skill: {path}",
    "uninstall.plan.retainedSkill.unmanaged": "  unmanaged: {path}",
    "uninstall.plan.item": "  {label}: {path}",
    "uninstall.plan.nothing": "Nothing to remove.",
    "uninstall.confirm.prompt":
        "This will uninstall oo and remove the listed items. Continue? [y/N] ",
    "uninstall.confirm.purgePrompt":
        "This will uninstall oo and PERMANENTLY delete your auth, settings, and oo-managed registry skills. Continue? [y/N] ",
    "uninstall.confirm.invalid": "Please answer y or n.",
    "uninstall.confirm.cancelled": "Uninstall cancelled.",
    "uninstall.error.confirmationRequired":
        "Refusing to uninstall without confirmation. Re-run with --yes in a non-interactive terminal.",
    "uninstall.busy":
        "Another oo process (pid {pid}) is still running. Close it and retry.",
    "uninstall.partialFailure":
        "Uninstall could not remove {count} path(s). Check permissions and retry.",
    "uninstall.success": "oo has been uninstalled.",
    "uninstall.success.scheduled":
        "oo runtime cleanup scheduled; the executable is removed once this process exits.",
    "uninstall.packageManager":
        "oo was installed with {method}. Removed oo-managed skills; remove the binary with: {command}",
    "uninstall.unknown":
        "Cannot locate a managed oo install for the current executable. Removed oo-managed skills only; remove the binary manually.",
    "commands.skills.checkUpdate.description":
        "Check for available updates for installed registry skills without downloading or modifying them.",
    "commands.skills.checkUpdate.summary":
        "Check registry skills for updates",
    "skills.checkUpdate.allCurrent":
        "All checked registry skills are up to date.",
    "skills.checkUpdate.summary":
        "{updates} update(s) available, {repairs} repair(s) required, {current} up-to-date, {failed} failed.",
    "skills.checkUpdate.updatesHeader": "Updates:",
    "skills.checkUpdate.updatesLine":
        "  {skillId}  {packageName}  {currentVersion} -> {latestVersion}",
    "skills.checkUpdate.repairsHeader": "Repairs:",
    "skills.checkUpdate.repairsLine":
        "  {skillId}  {packageName}  {currentVersion}",
    "skills.checkUpdate.failuresHeader": "Failures:",
    "skills.checkUpdate.failuresLine":
        "  {skillId}: {message}",
    "commands.version.description":
        "Print the CLI version. Use --json for a stable machine-readable payload.",
    "commands.version.summary": "Print the CLI version",
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
    "options.connectorRunWait":
        "Poll until an async result action reaches a terminal state",
    "options.connectorRunWaitResult":
        "Submit an async action and wait for its result action",
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
    "options.showSchemaVersion":
        "Include schemaVersion in JSON output (no effect without --json)",
    "options.connectorSchemaJson":
        "Accepted for compatibility; output is always JSON",
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
    "options.agent": "Check one supported skill host",
    "options.nextToken": "Specify the pagination token for the next page",
    "options.packageId": "Filter by package id",
    "options.packageName": "Alias for --package-id",
    "options.page": "Specify the log page number",
    "options.showUrl": "Include download URLs in text output",
    "options.size": "Specify the number of items per page",
    "options.status": "Filter by task status",
    "options.apiKey": "Log in with an existing API key",
    "options.sessionToken": "Log in with a session token",
    "options.schema": "Provide response JSON Schema or @path to a JSON file",
    "options.system": "System prompt text or @path to a text file",
    "options.timeout":
        "Set how long to wait before timing out (default 6h, range 10s to 24h)",
    "options.yes": "Skip confirmation prompts",
    "options.skills.install.force":
        "Force install even when a same-name skill directory exists and is not managed by oo",
    "options.skills.skill":
        "Skill name(s) to limit the operation to (case-insensitive; non-matching names are ignored)",
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
    "skills.install.filteredSelected":
        "Installing {count} of {total} skills.",
    "skills.check.success":
        "Local skill editing is ready. Writable storage: {path}. Supported hosts: {count}.",
    "skills.list.noResults":
        "No skills were found.",
    "skills.list.host": "Host",
    "skills.list.host.claude": "Claude Code",
    "skills.list.host.codebuddy": "CodeBuddy",
    "skills.list.host.deepseek-tui": "DeepSeek TUI",
    "skills.list.host.hermes": "Hermes",
    "skills.list.host.openclaw": "OpenClaw",
    "skills.list.host.qoderwork": "QoderWork",
    "skills.list.host.trae": "Trae",
    "skills.list.host.trae-cn": "Trae CN",
    "skills.list.host.universal": "Universal",
    "skills.list.host.workbuddy": "WorkBuddy",
    "skills.list.source": "Source",
    "skills.list.package": "Package",
    "skills.list.path": "Path",
    "skills.list.summary":
        "Found {count} skills.",
    "skills.info.summary":
        "Found {count} skills (bundled: {bundled}, registry: {registry}, local: {local}).",
    "skills.info.kind": "Kind",
    "skills.info.kind.bundled": "bundled",
    "skills.info.kind.registry": "registry",
    "skills.info.kind.local": "local",
    "skills.info.description": "Description",
    "skills.info.hosts": "Hosts",
    "skills.info.host.status.installed": "installed",
    "skills.info.host.controlState.controlled": "controlled",
    "skills.info.host.controlState.modified": "modified",
    "skills.info.host.controlState.non-managed": "non-managed",
    "skills.info.host.controlState.unknown": "unknown",
    "skills.info.package.internal": "<internal>",
    "skills.info.package.local": "<local>",
    "labels.status": "Status",
    "labels.version": "Version",
    "skills.init.success": "Initialized skill {name} at {path}.",
    "skills.publish.success":
        "Published skill {name} as {visibility} package {packageName}@{version}. View it at {hubUrl}.",
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
    "skills.share.subject.package": "package",
    "skills.share.subject.skill": "skill",
    "skills.share.visibility.private": "private",
    "skills.share.visibility.public": "public",
    "skills.share.prompt.hubLine": "Hub: {hubUrl}",
    "skills.share.prompt.installPackageSpecifierLine":
        "Install package specifier: {installPackageSpecifier}",
    "skills.share.prompt.installPreparationLabel":
        "General install preparation:",
    "skills.share.prompt.intro":
        "Please help me install this OO {subject}.",
    "skills.share.prompt.packageLine": "Package: {packageName}",
    "skills.share.prompt.privatePackageIntro":
        "This private OO package must be installed with this exact temporary share specifier:",
    "skills.share.prompt.privateSkillIntro":
        "This private OO skill must be installed with this exact temporary share specifier:",
    "skills.share.prompt.publicPackageIntro":
        "The package is already published and public:",
    "skills.share.prompt.publicSkillIntro":
        "The skill is already published and public:",
    "skills.share.prompt.runInstruction":
        "First follow the guide to check OO CLI and login state, then run:",
    "skills.share.prompt.skillLine": "Skill: {skillId}",
    "warnings.skills.localUninstallAmbiguous":
        "Warning: Local skill {name} exists in multiple local sources ({agents}). Nothing was removed; pass --agent to choose one.",
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
    "skills.install.skipped": "Skipped skill {name}.",
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
    "arguments.packageName": "Package name(s) to install",
    "arguments.skills.update.packageName": "Package name(s) to update; updates every installed skill of each package",
    "arguments.skills.checkUpdate.packageName": "Package name(s) to check; checks every installed skill of each package",
    "arguments.serviceName": "Service name",
    "arguments.shell": "Target shell",
    "arguments.skill": "Skill name",
    "arguments.taskId": "Task id",
    "arguments.text": "Search text",
    "arguments.url": "URL",
    "arguments.value": "Configuration value",
    "connector.search.text.authenticated": "Authenticated",
    "connector.search.text.authenticated.no": "no",
    "connector.search.text.authenticated.yes": "yes",
    "connector.search.text.noResults":
        "No matching connector actions were found.",
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
    "skills.search.text.noResults": "No matching skills were found.",
    "skills.search.text.package": "Package",
    "skills.search.text.unnamedSkill": "unnamed-skill",
    "arguments.variableName": "Variable name",
    "arguments.variableValue": "Variable value (string)",
    "commands.variables.summary": "Manage cloud-stored variables",
    "commands.variables.description": "List, read, create, update, and delete cloud-stored string variables for the current account.",
    "commands.variables.list.summary": "List variables",
    "commands.variables.list.description": "List all variables for the current account, most recently updated first.",
    "commands.variables.get.summary": "Read a variable",
    "commands.variables.get.description": "Read the value of a variable for the current account.",
    "commands.variables.create.summary": "Create or update a variable",
    "commands.variables.create.description": "Create or update the value of a variable for the current account (last-write-wins).",
    "commands.variables.delete.summary": "Delete a variable",
    "commands.variables.delete.description": "Delete a variable for the current account. Idempotent: succeeds even if the name does not exist.",
    "options.variablesFromFile": "Read the variable value from a file (UTF-8)",
    "options.variablesStdin": "Read the variable value from standard input (UTF-8)",
    "errors.variables.invalidName": "Invalid variable name: {value}. Names must be 1-256 characters and must not contain '/' or control characters.",
    "errors.variables.valueSource": "Provide exactly one variable value source: a value argument, --from-file, or --stdin.",
    "errors.variables.stdinTty": "--stdin requires piped input; refusing to read from an interactive terminal.",
    "errors.variables.fromFileReadFailed": "Failed to read value file: {message}",
    "errors.variables.valueTooLarge": "Variable value exceeds the maximum size of {max} bytes (UTF-8).",
    "errors.variables.notFound": "Variable not found: {name}",
    "errors.variables.quotaExceeded": "Variable quota exceeded. Each account can store at most 200 variables.",
    "errors.variables.requestFailed": "Variables request failed with status {status}.",
    "errors.variables.requestError": "Variables request failed: {message}",
    "errors.variables.invalidResponse": "The variables service returned an unexpected response.",
    "variables.list.empty": "No variables.",
    "variables.create.success": "Saved variable {name} (updated {updatedAt}).",
    "variables.delete.success": "Deleted variable {name}.",
} as const;

export const zhMessages = {
    "app.description": `${APP_NAME} 是 OOMOL 的 CLI 工具集，一切均可在 CLI 中完成`,
    "auth.login.openManually": "请在你的浏览器中打开此登录 URL：",
    "auth.account.activeAccountMissing": "当前激活账号不存在于认证数据中。",
    "auth.account.loggedIn": "已登录 {endpoint} 账号 {name}",
    "auth.login.waiting": "正在等待 device login 完成...",
    "auth.logout.success": "已登出当前账号。",
    "auth.status.accountActive": "激活",
    "auth.status.accountId": "账号 ID",
    "auth.status.accountsLabel": "账号列表",
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
    "commands.auth.login.description": "通过 device login、session token 或 API key 登录 OOMOL 账号。",
    "commands.auth.login.summary": "登录 OOMOL 账号",
    "commands.auth.logout.description": "从持久化认证数据中移除当前账号。",
    "commands.auth.logout.summary": "登出当前账号",
    "commands.auth.status.description": "显示已保存的认证账号，并校验当前激活账号的 API key。",
    "commands.auth.status.summary": "显示认证状态",
    "commands.auth.summary": "管理 CLI 认证",
    "commands.auth.switch.description": "切换到下一个已保存的认证账号，或通过 --user 切换到指定账号。",
    "commands.auth.switch.summary": "切换到下一个认证账号",
    "options.auth.switch.user": "切换到 id 或唯一 name 与该值匹配的账号",
    "commands.checkUpdate.description": "检查是否有新的 CLI 版本可用。",
    "commands.checkUpdate.summary": "检查 CLI 更新",
    "commands.connector.description":
        "搜索 connector action，并运行已认证的 connector 操作。",
    "commands.connector.summary": "管理 connector action",
    "commands.connector.search.description":
        "搜索 connector action。",
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
    "commands.info.description":
        "打印 CLI 运行环境信息、本地存储路径以及检测到的 skill 代理。",
    "commands.info.summary": "显示 CLI 环境信息",
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
    "commands.login.description": "通过 device login、session token 或 API key 登录 OOMOL 账号。是 auth login 的别名。",
    "commands.login.summary": "登录 OOMOL 账号（auth login 的别名）",
    "commands.logout.description": "从持久化认证数据中移除当前账号。是 auth logout 的别名。",
    "commands.logout.summary": "登出当前账号（auth logout 的别名）",
    "commands.search.description":
        "使用一个自由文本查询搜索 connector action。",
    "commands.search.summary": "搜索 connector action",
    "commands.skills.description": "管理本地 AI Agent skill。",
    "commands.skills.summary": "管理 AI Agent skill",
    "commands.skills.search.description":
        "使用自由文本通过 skills search API 搜索已发布的 skill。",
    "commands.skills.search.summary":
        "搜索已发布的 skill",
    "commands.skills.info.description":
        "查看当前环境中已安装的 bundled、registry 和 local skill。",
    "commands.skills.info.summary":
        "查看已安装的 skill",
    "commands.skills.locate.description":
        "输出已安装 skill 的本地路径。",
    "commands.skills.locate.summary": "定位 skill 路径",
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
        "检查当前环境是否有权限为指定 Agent 创建本地 skills。",
    "commands.skills.check.summary": "预检本地 skill 编辑环境",
    "commands.skills.init.description":
        "在指定 Agent 的 skill 目录中初始化本地 skill。",
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
    "commands.skills.repair.description":
        "从可信 source 强制将一个或多个由 oo 管理的 skill 重新部署到一个或多个 Agent 的 skill 目录。",
    "commands.skills.repair.summary": "从可信 source 修复已安装的 skill",
    "options.skills.repair.skill":
        "要修复的 skill 名称（必填，可重复传入）",
    "options.skills.repair.agent":
        "目标 Agent 名称（可重复；缺省时为当前所有可用的受支持 Agent）",
    "skills.repair.success":
        "已为 {agentCount} 个 Agent 修复 {skillCount} 个 skill。",
    "skills.repair.success.line": "  {name}：{agents}",
    "skills.repair.failure":
        "有 {count} 个 skill-Agent 组合修复失败。",
    "skills.repair.failure.line": "  {name}（{agent}）：{reason}",
    "errors.skills.repair.skillRequired":
        "至少需要传入一个 --skill <name>。",
    "errors.skills.repair.localUnsupported":
        "skill {name} 是 local skill，不支持 repair；local skill 是 Agent 原生 source。",
    "errors.skills.repair.partialFailure":
        "有 {count} 个 skill-Agent 组合修复失败。",
    "errors.skills.install.partialFailure":
        "有 {count} 个 skill 操作失败。",
    "errors.skills.uninstall.partialFailure":
        "有 {count} 个 skill 操作失败。",
    "errors.skills.update.partialFailure":
        "有 {count} 个 skill 操作失败。",
    "errors.skills.sync.upload.partialFailure":
        "Skill sync upload 失败。",
    "errors.skills.sync.apply.partialFailure":
        "有 {count} 个 skill 操作失败。",
    "errors.skills.repair.sourceNotFound":
        "未找到由 oo 管理的 registry canonical source。",
    "errors.skills.repair.sourceInvalid":
        "registry canonical metadata 缺失或不是 registry skill。",
    "errors.skills.repair.invalidPath":
        "目标路径超出受管 skills 目录范围。",
    "errors.skills.repair.writeFailed":
        "写入 skill source 到目标 Agent 目录失败。",
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
    "errors.auth.apiKeyInvalid": "API key 无效或已过期。",
    "errors.auth.apiKeyRequired": "API key 不能为空。",
    "errors.auth.loginInvalidResponse": "auth login 服务返回了不受支持的响应内容。",
    "errors.auth.loginMethodConflict": "--api-key 与 --session-token 只能使用其中一个。",
    "errors.auth.loginRequestError": "auth login 请求失败：{message}",
    "errors.auth.loginRequestFailed": "auth login 请求返回了 HTTP {status}。",
    "errors.auth.loginTimeout": "等待 device login 完成超过 {timeout}，已超时。",
    "errors.auth.noSavedAccounts": "没有可切换的认证账号。",
    "errors.auth.required":
        "使用此命令前请先登录。",
    "errors.auth.sessionTokenRequired": "session token 不能为空。",
    "errors.auth.switch.userAmbiguous":
        "存在多个 name 为 {value} 的账号。请通过 --user <account-id> 进行消歧。",
    "errors.auth.switch.userNotFound":
        "没有匹配 {value} 的已保存账号。",
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
        "异步 connector action 的 submit 响应缺少 handle 字段 {field}。",
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
        "Connector action {action} 返回了 HTTP {status}。",
    "errors.connectorRun.requestFailedWithCode":
        "Connector action {action} 返回了 HTTP {status}（errorCode: {errorCode}）。",
    "errors.connectorRun.requestFailedWithMessage":
        "Connector action {action} 返回了 HTTP {status}：{message}",
    "errors.connectorRun.requestFailedWithMessageAndCode":
        "Connector action {action} 返回了 HTTP {status}（errorCode: {errorCode}）：{message}",
    "errors.connectorRun.waitUnsupported":
        "--wait 选项仅支持带有异步结果 lifecycle 的 connector action。",
    "errors.connectorRun.waitModeConflict":
        "--wait 和 --wait-result 只能使用其中一个。",
    "errors.connectorRun.waitResultActionUnsupported":
        "--wait-result 配置的结果 action {action} 必须声明异步结果 lifecycle。",
    "errors.connectorRun.waitResultUnsupported":
        "--wait-result 选项仅支持带有异步 submit lifecycle 的 connector action。",
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
    "errors.skills.init.agentRequired":
        "缺少必填的 --agent。请使用 {agents}。",
    "errors.skills.init.invalidAgent":
        "不支持的 skill Agent：{value}。请使用 {agents}。",
    "errors.skills.init.invalidTitle":
        "--title 的值无效。请使用非空显示标题。",
    "errors.skills.init.descriptionRequired":
        "缺少必填的 --description。请为生成的 skill 提供简洁的触发描述。",
    "errors.skills.init.invalidName":
        "无效的 skill 名称：{value}。请使用可规范化为小写短横线格式的名称。",
    "errors.skills.check.agentRequired":
        "缺少必填的 --agent。请使用 {agents}。",
    "errors.skills.check.invalidAgent":
        "不支持的 skill Agent：{value}。请使用 {agents}。",
    "errors.skills.publish.invalidPackageMetadata":
        "skill 包元数据无效：{message}",
    "errors.skills.publish.invalidAgent":
        "不支持的 skill Agent：{value}。请使用 {agents}。",
    "errors.skills.locate.invalidAgent":
        "不支持的 skill Agent：{value}。请使用 {agents}。",
    "errors.skills.locate.ambiguous":
        "skill {name} 匹配到多个本地路径。请传入 --agent，或直接发布其中一个路径：\n{paths}",
    "errors.skills.locate.invalidSkillId":
        "无效的 skill id：{name}。请给 locate 传入 skill id；如需发布路径，请直接传给 oo skills publish。",
    "errors.skills.locate.notFound":
        "无法在已安装 skill 路径中找到 skill {name}。",
    "errors.skills.publish.invalidSkillFile":
        "无法发布 {path} 中的 skill：{message}",
    "errors.skills.publish.invalidOwnershipMetadata":
        "无法发布该 skill，因为位于 {path} 的 oo 元数据文件无效。",
    "errors.skills.publish.invalidVisibility":
        "无效的 skill 发布可见性：{value}。请使用 private 或 public。",
    "errors.skills.publish.bundledSkill":
        "不能直接发布内置 skill {name}，因为它由 oo CLI 版本管理。请先创建本地 skill 再发布。",
    "errors.skills.publish.localSkillAmbiguous":
        "本地 skill {name} 存在于多个本地来源（{agents}）。请传入 --agent 选择要发布的 Agent 本地 skill。",
    "errors.skills.share.localSkillAmbiguous":
        "本地 skill {name} 存在于多个本地来源（{agents}）。请传入 --agent 选择要分享的 Agent 本地 skill。",
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
    "errors.skills.list.invalidAgent":
        "不支持的 skill Agent：{value}。请使用 {agents}。",
    "errors.skills.uninstall.invalidAgent":
        "不支持的 skill Agent：{value}。请使用 {agents}。",
    "errors.skills.publish.skillNotFound":
        "无法在 {name} 找到 skill 目录或 SKILL.md。可使用 oo skills locate <skill-id> 解析已安装 skill 路径。",
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
    "errors.skills.agentNotInstalled":
        "未检测到 {agentName} 安装。期望的 {agentName} 根目录为 {path}。",
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
    "errors.skills.skillFilterNoMatch":
        "指定的 skill 都不存在。可用的 skill：{skills}。",
    "errors.skills.update.bundledUnsupported":
        "内置 skill {name} 由 oo 管理，不能通过 skills update 更新。请改用 oo skills add {name}。",
    "errors.skills.update.packageNotInstalled":
        "没有任何已安装的 oo 管理 skill 属于包 {packageName}。",
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
    "info.section.cli": "CLI",
    "info.section.agents": "代理",
    "info.section.features": "特性",
    "info.cli.version": "版本",
    "info.cli.platform": "操作系统",
    "info.cli.arch": "架构",
    "info.cli.storeDir": "存储目录",
    "info.cli.logDir": "日志目录",
    "info.cli.authFile": "认证文件",
    "info.cli.settingsFile": "配置文件",
    "info.agents.empty": "未检测到任何支持的 skill 代理。",
    "info.agents.skillDir": "Skill 目录",
    "info.agents.status.available": "已安装",
    "info.agents.status.no_skills": "尚未注入 skill",
    "info.agents.status.not_installed": "未安装",
    "info.features.empty": "暂未启用任何可选特性。",
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
    "commands.uninstall.description":
        "卸载 CLI 运行时及其内置 skills。使用 --purge 可同时删除用户数据和全部由 oo 管理的 registry skills。",
    "commands.uninstall.summary": "卸载 CLI",
    "options.uninstall.yes": "跳过确认提示（非交互式终端下必须传入）",
    "options.uninstall.dryRun": "只打印将删除的内容，不实际删除",
    "options.uninstall.purge":
        "同时删除用户数据（auth、settings、cache、logs、telemetry）和全部由 oo 管理的 registry skills",
    "uninstall.plan.header": "oo 卸载计划",
    "uninstall.plan.removeRuntime": "将删除的运行时：",
    "uninstall.plan.removeSkills": "将删除的 skills：",
    "uninstall.plan.removeData": "将删除的用户数据：",
    "uninstall.plan.deferred": "在当前进程退出后删除：",
    "uninstall.plan.retained": "将保留：",
    "uninstall.plan.retainedSkill.registry": "  registry skill：{path}",
    "uninstall.plan.retainedSkill.local": "  local skill：{path}",
    "uninstall.plan.retainedSkill.unmanaged": "  未受管：{path}",
    "uninstall.plan.item": "  {label}：{path}",
    "uninstall.plan.nothing": "没有可删除的内容。",
    "uninstall.confirm.prompt":
        "这将卸载 oo 并删除上面列出的内容。是否继续？[y/N] ",
    "uninstall.confirm.purgePrompt":
        "这将卸载 oo，并**永久删除**你的 auth、settings 以及全部由 oo 管理的 registry skills。是否继续？[y/N] ",
    "uninstall.confirm.invalid": "请输入 y 或 n。",
    "uninstall.confirm.cancelled": "已取消卸载。",
    "uninstall.error.confirmationRequired":
        "未确认，拒绝卸载。在非交互式终端中请加 --yes 重试。",
    "uninstall.busy":
        "还有另一个 oo 进程（pid {pid}）在运行。请先关闭它再重试。",
    "uninstall.partialFailure":
        "卸载未能删除 {count} 个路径。请检查权限后重试。",
    "uninstall.success": "oo 已卸载。",
    "uninstall.success.scheduled":
        "oo 运行时清理已计划；可执行文件会在当前进程退出后删除。",
    "uninstall.packageManager":
        "oo 是通过 {method} 安装的。已删除 oo 管理的 skills；请用以下命令删除二进制：{command}",
    "uninstall.unknown":
        "无法定位当前可执行文件对应的受管 oo 安装。仅删除了 oo 管理的 skills；请手动删除二进制。",
    "commands.skills.checkUpdate.description":
        "检查已安装的 registry skill 是否有可用更新，仅查询不下载也不写入。",
    "commands.skills.checkUpdate.summary":
        "检查 registry skill 是否有更新",
    "skills.checkUpdate.allCurrent":
        "已检查的 registry skill 均为最新。",
    "skills.checkUpdate.summary":
        "{updates} 个可升级，{repairs} 个需修复，{current} 个已最新，{failed} 个失败。",
    "skills.checkUpdate.updatesHeader": "可升级：",
    "skills.checkUpdate.updatesLine":
        "  {skillId}  {packageName}  {currentVersion} -> {latestVersion}",
    "skills.checkUpdate.repairsHeader": "需修复：",
    "skills.checkUpdate.repairsLine":
        "  {skillId}  {packageName}  {currentVersion}",
    "skills.checkUpdate.failuresHeader": "失败：",
    "skills.checkUpdate.failuresLine":
        "  {skillId}：{message}",
    "commands.version.description":
        "输出 CLI 版本。使用 --json 输出稳定的机器可读 payload。",
    "commands.version.summary": "输出 CLI 版本",
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
    "options.connectorRunWait":
        "轮询异步结果 action，直到进入终态",
    "options.connectorRunWaitResult":
        "提交异步 action，并等待它的结果 action",
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
    "options.showSchemaVersion":
        "在 JSON 输出中加入 schemaVersion 字段（未指定 --json 时无效）",
    "options.connectorSchemaJson":
        "兼容性选项；输出始终是 JSON",
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
    "options.agent": "检查一个受支持的 Agent",
    "options.nextToken": "指定下一页分页令牌",
    "options.packageId": "按 package id 过滤",
    "options.packageName": "--package-id 的别名",
    "options.page": "指定日志页码",
    "options.showUrl": "在文本输出中包含下载 URL",
    "options.size": "指定每页数量",
    "options.status": "按任务状态过滤",
    "options.apiKey": "使用已有 API key 登录",
    "options.sessionToken": "使用 session token 登录",
    "options.schema": "提供响应 JSON Schema，或使用 @路径 读取 JSON 文件",
    "options.system": "System prompt 文本，或使用 @路径 读取文本文件",
    "options.timeout": "设置等待超时时间（默认 6h，范围 10s 到 24h）",
    "options.yes": "跳过确认提示",
    "options.skills.install.force":
        "强制安装，即使同名 skill 目录已存在且不受 oo 管理",
    "options.skills.skill":
        "限定操作的 skill 名称（可指定多个；大小写不敏感；不匹配的名称会被忽略）",
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
    "skills.install.filteredSelected":
        "将安装 {total} 个 skill 中的 {count} 个。",
    "skills.check.success":
        "本地 skill 编辑环境可用。可写存储：{path}。受支持 Agents：{count}。",
    "skills.list.noResults":
        "未找到 skill。",
    "skills.list.host": "Agents",
    "skills.list.host.claude": "Claude Code",
    "skills.list.host.codebuddy": "CodeBuddy",
    "skills.list.host.deepseek-tui": "DeepSeek TUI",
    "skills.list.host.hermes": "Hermes",
    "skills.list.host.openclaw": "OpenClaw",
    "skills.list.host.qoderwork": "QoderWork",
    "skills.list.host.trae": "Trae",
    "skills.list.host.trae-cn": "Trae CN",
    "skills.list.host.universal": "Universal",
    "skills.list.host.workbuddy": "WorkBuddy",
    "skills.list.source": "来源",
    "skills.list.package": "Package",
    "skills.list.path": "路径",
    "skills.list.summary":
        "找到 {count} 个 skill。",
    "skills.info.summary":
        "找到 {count} 个 skill（bundled: {bundled}, registry: {registry}, local: {local}）。",
    "skills.info.kind": "类型",
    "skills.info.kind.bundled": "bundled",
    "skills.info.kind.registry": "registry",
    "skills.info.kind.local": "local",
    "skills.info.description": "描述",
    "skills.info.hosts": "Agents",
    "skills.info.host.status.installed": "installed",
    "skills.info.host.controlState.controlled": "controlled",
    "skills.info.host.controlState.modified": "modified",
    "skills.info.host.controlState.non-managed": "non-managed",
    "skills.info.host.controlState.unknown": "unknown",
    "skills.info.package.internal": "<internal>",
    "skills.info.package.local": "<local>",
    "labels.status": "状态",
    "labels.version": "版本",
    "skills.init.success": "已在 {path} 初始化 skill {name}。",
    "skills.publish.success":
        "已将 skill {name} 以{visibility}发布为 {packageName}@{version}。可在 {hubUrl} 查看。",
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
    "skills.share.subject.package": "package",
    "skills.share.subject.skill": "skill",
    "skills.share.visibility.private": "私有",
    "skills.share.visibility.public": "公开",
    "skills.share.prompt.hubLine": "Hub: {hubUrl}",
    "skills.share.prompt.installPackageSpecifierLine":
        "Install package specifier: {installPackageSpecifier}",
    "skills.share.prompt.installPreparationLabel":
        "通用安装准备说明：",
    "skills.share.prompt.intro":
        "请帮我安装这个 OO {subject}。",
    "skills.share.prompt.packageLine": "Package: {packageName}",
    "skills.share.prompt.privatePackageIntro":
        "这个私有 OO package 必须使用下面这个临时分享标识精确安装：",
    "skills.share.prompt.privateSkillIntro":
        "这个私有 OO skill 必须使用下面这个临时分享标识精确安装：",
    "skills.share.prompt.publicPackageIntro":
        "这个 package 已经发布并且是公开的：",
    "skills.share.prompt.publicSkillIntro":
        "这个 skill 已经发布并且是公开的：",
    "skills.share.prompt.runInstruction":
        "请先按通用说明检查 OO CLI 和登录状态，然后执行：",
    "skills.share.prompt.skillLine": "Skill: {skillId}",
    "warnings.skills.localUninstallAmbiguous":
        "警告：本地 skill {name} 存在于多个本地来源（{agents}）。未删除任何内容；请传入 --agent 选择一个。",
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
    "skills.install.skipped": "已跳过 skill {name}。",
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
    "arguments.packageName": "要安装的包名（可指定多个）",
    "arguments.skills.update.packageName": "要更新的包名（可指定多个）；会更新每个包已安装的全部 skill",
    "arguments.skills.checkUpdate.packageName": "要检查的包名（可指定多个）；会检查每个包已安装的全部 skill",
    "arguments.serviceName": "服务名",
    "arguments.shell": "目标 shell",
    "arguments.skill": "skill 名称",
    "arguments.taskId": "任务 ID",
    "arguments.text": "搜索文本",
    "arguments.url": "URL",
    "arguments.value": "配置值",
    "connector.search.text.authenticated": "已认证",
    "connector.search.text.authenticated.no": "否",
    "connector.search.text.authenticated.yes": "是",
    "connector.search.text.noResults": "未找到匹配的 connector action。",
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
    "skills.search.text.noResults": "未找到匹配的 skill。",
    "skills.search.text.package": "包",
    "skills.search.text.unnamedSkill": "未命名 skill",
    "arguments.variableName": "变量 name",
    "arguments.variableValue": "变量值（字符串）",
    "commands.variables.summary": "管理云端变量",
    "commands.variables.description": "列出、读取、创建、更新和删除当前账号的云端字符串变量。",
    "commands.variables.list.summary": "列出变量",
    "commands.variables.list.description": "列出当前账号的全部变量，按最近更新时间倒序。",
    "commands.variables.get.summary": "读取变量",
    "commands.variables.get.description": "读取当前账号指定 name 的变量值。",
    "commands.variables.create.summary": "创建或更新变量",
    "commands.variables.create.description": "为当前账号创建或替换指定 name 的变量（last-write-wins）。",
    "commands.variables.delete.summary": "删除变量",
    "commands.variables.delete.description": "删除当前账号指定 name 的变量。幂等：即使 name 不存在也成功。",
    "options.variablesFromFile": "从文件读取变量值（UTF-8）",
    "options.variablesStdin": "从标准输入读取变量值（UTF-8）",
    "errors.variables.invalidName": "无效的变量 name：{value}。name 必须为 1-256 个字符，且不能包含 '/' 或控制字符。",
    "errors.variables.valueSource": "请只提供一个变量值来源：value 参数、--from-file 或 --stdin。",
    "errors.variables.stdinTty": "--stdin 需要管道输入；拒绝从交互式终端读取。",
    "errors.variables.fromFileReadFailed": "读取变量值文件失败：{message}",
    "errors.variables.valueTooLarge": "变量值超过最大限制 {max} 字节（UTF-8）。",
    "errors.variables.notFound": "变量不存在：{name}",
    "errors.variables.quotaExceeded": "变量数量超出上限。每个账号最多存储 200 个变量。",
    "errors.variables.requestFailed": "variables 请求失败，状态码 {status}。",
    "errors.variables.requestError": "variables 请求失败：{message}",
    "errors.variables.invalidResponse": "variables 服务返回了非预期的响应。",
    "variables.list.empty": "暂无变量。",
    "variables.create.success": "已保存变量 {name}（更新于 {updatedAt}）。",
    "variables.delete.success": "已删除变量 {name}。",
} satisfies Record<keyof typeof enMessages, string>;

export const messageCatalog = {
    en: enMessages,
    zh: zhMessages,
} as const;

export type MessageKey = keyof typeof enMessages;
