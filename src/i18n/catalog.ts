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
    "commands.auth.login.description": "Log in with an OOMOL account using device login.",
    "commands.auth.login.summary": "Log in with device login",
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
    "commands.connector.run.description":
        "Validate input data and run one connector action synchronously.",
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
    "commands.file.cleanup.description":
        "Delete expired upload records from the local sqlite store.",
    "commands.file.cleanup.summary": "Clean expired upload records",
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
    "commands.help.summary": "Show help for a command",
    "commands.log.description": "Inspect persisted CLI debug logs.",
    "commands.log.summary": "Manage persisted debug logs",
    "commands.log.path.description": "Print the current persisted log directory path.",
    "commands.log.path.summary": "Show log directory path",
    "commands.log.print.description":
        "Print one previous persisted debug log file by index.",
    "commands.log.print.summary": "Print a previous debug log",
    "commands.login.description":
        "Log in with an OOMOL account using device login. Alias for auth login.",
    "commands.login.summary": "Log in with device login (alias for auth login)",
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
        "Manage Codex skills.",
    "commands.skills.summary": "Manage Codex skills",
    "commands.skills.search.description":
        "Search published skills against the skills search API.",
    "commands.skills.search.summary":
        "Search published skills",
    "commands.skills.list.description":
        "List oo-managed Codex skills from the local Codex skills directory.",
    "commands.skills.list.summary":
        "List oo-managed Codex skills",
    "commands.skills.install.description":
        "Install bundled skills into supported local skill directories, or install published skills into the local Codex skills directory.",
    "commands.skills.install.summary": "Install skills",
    "commands.skills.update.description":
        "Update installed oo-managed Codex skills to the latest available version.",
    "commands.skills.update.summary": "Update oo-managed Codex skills",
    "commands.skills.uninstall.description":
        "Remove bundled skills from supported local skill directories, or remove one oo-managed published skill from the local Codex skills directory.",
    "commands.skills.uninstall.summary": "Remove a managed skill",
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
    "errors.auth.loginInvalidResponse":
        "The device login service returned an unsupported response body.",
    "errors.auth.loginRequestError":
        "The device login request failed: {message}",
    "errors.auth.loginRequestFailed":
        "The device login request returned HTTP {status}.",
    "errors.auth.loginTimeout":
        "Timed out waiting for the device login to complete.",
    "errors.auth.noSavedAccounts":
        "There are no auth accounts to switch to.",
    "errors.auth.required":
        "You must log in before using this command.",
    "errors.authStore.invalidToml":
        "The auth file at {path} is not valid TOML.",
    "errors.authStore.invalidSchema":
        "The auth file at {path} has an unsupported shape.",
    "errors.authStore.readFailed":
        "Failed to read the auth file at {path}.",
    "errors.authStore.writeFailed":
        "Failed to write the auth file at {path}.",
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
    "errors.completion.invalidShell":
        "Unsupported shell: {value}. Use bash, zsh, or fish.",
    "errors.checkUpdate.failed": "Failed to check for CLI updates.",
    "errors.config.invalidKey": "Invalid config key: {value}.",
    "errors.config.invalidLangValue":
        "Invalid lang value: {value}. Use en or zh.",
    "errors.config.invalidFileDownloadOutDirValue":
        "Invalid file.download.out_dir value: {value}. Use a non-empty path.",
    "errors.skills.invalidName":
        "Unsupported skill: {value}. Use {choices}.",
    "errors.skills.invalidPath":
        "Skill name {name} resolves outside the local Codex skills directory.",
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
        "The file at {path} is {size} bytes, which exceeds the 512 MiB limit of {max} bytes.",
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
    "errors.skills.noSupportedBundledSkillHosts":
        "No supported bundled skill host is installed. Expected one of: {paths}.",
    "errors.skills.install.confirmationRequired":
        "Skill {name} already exists and requires interactive confirmation.",
    "errors.skills.install.invalidArchive":
        "Downloaded package archive does not contain a valid skill directory for {name}.",
    "errors.skills.install.invalidPackageInfo":
        "The skills install package info service returned an unsupported response body.",
    "errors.skills.install.noPublishedSkills":
        "Package {packageName} does not publish any skills.",
    "errors.skills.install.nonInteractiveSelection":
        "Package {packageName} has multiple skills. Use --skill <name>, --all -y, or run in an interactive terminal.",
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
        "Bundled skill {name} is synchronized automatically and cannot be updated with skills update.",
    "errors.skills.update.packageNameMissing":
        "Managed skill {name} cannot be updated because its package metadata is missing.",
    "errors.skills.nameConflict":
        "Skill name {name} is already used by a non-OOMOL skill at {path}.",
    "errors.skills.storageConflict":
        "Bundled skill storage for {name} is already occupied by non-OOMOL content at {path}.",
    "errors.skills.notInstalled":
        "Skill {name} is not installed at {path}.",
    "errors.skills.notManaged":
        "{name} is not managed by oo and cannot be removed.",
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
    "options.fileDownloadExt": "Specify the saved file extension",
    "options.fileDownloadName": "Specify the saved file name without the extension",
    "options.fileStatus": "Filter by upload status",
    "options.force":
        "Force reinstallation even when the target version already exists",
    "options.help": "Show help for command",
    "options.limit": "Specify the maximum number of items to return",
    "options.format": "Specify output format (use json for structured output)",
    "options.json": "Alias for --format=json",
    "options.keywords":
        "Specify comma-separated keywords to refine the skill search",
    "options.skill":
        "Specify skill names to install (use * for all skills)",
    "options.onlyPackageId": "Return only package ids",
    "options.all":
        "Install all published skills without prompting for skill selection",
    "options.nextToken": "Specify the pagination token for the next page",
    "options.packageId": "Filter by package id",
    "options.packageName": "Alias for --package-id",
    "options.page": "Specify the log page number",
    "options.showUrl": "Include download URLs in text output",
    "options.size": "Specify the number of items per page",
    "options.status": "Filter by task status",
    "options.timeout":
        "Set how long to wait before timing out (default 6h, range 10s to 24h)",
    "options.yes": "Skip confirmation prompts",
    "options.lang": "Specify the display language",
    "options.version": "Show the current version",
    "selfUpdate.install.success": "Installed oo {version}.",
    "selfUpdate.install.executable": "Executable: {path}",
    "selfUpdate.install.pathNote":
        "Add {path} to PATH to run oo in new shells.",
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
    "skills.list.noResults":
        "No oo-managed skills were found.",
    "skills.list.source": "Source",
    "skills.list.source.bundled": "bundled",
    "skills.list.summary":
        "Found {count} oo-managed skills.",
    "labels.blocks": "Blocks:",
    "labels.status": "Status",
    "labels.version": "Version",
    "skills.install.success": "Installed skill {name} to {path}.",
    "skills.install.overwrite.invalid":
        "Invalid choice. Enter y/yes or n/no.",
    "skills.install.overwrite.prompt":
        "Skill {name} already exists. Overwrite? [y/N] ",
    "skills.install.selection.invalid":
        "Invalid selection. Use one or more comma-separated numbers, or press Enter to cancel.",
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
        "Codex skill {name} is already up to date at {version}.",
    "skills.update.failure":
        "Failed to update Codex skill {name}: {message}",
    "skills.update.progress.header": "Updating installed skills",
    "skills.update.progress.checking": "checking for updates",
    "skills.update.progress.preparing": "updating canonical files",
    "skills.update.progress.publishing": "publishing to Codex",
    "skills.update.progress.current": "up to date",
    "skills.update.progress.updated": "updated",
    "skills.update.progress.failed": "failed",
    "skills.update.success": "Updated Codex skill {name} to {path}.",
    "skills.uninstall.success": "Removed skill {name} from {path}.",
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
    "connector.search.text.schemaPath": "Schema path",
    "mixedSearch.text.kind": "Kind",
    "mixedSearch.text.kind.connector": "connector",
    "mixedSearch.text.kind.package": "package",
    "mixedSearch.text.noResults":
        "No matching packages or connector actions were found.",
    "connector.run.text.dryRunPassed": "Validation passed.",
    "connector.run.text.executionId": "Execution ID",
    "connector.run.text.resultData": "Result data",
    "file.cleanup.success":
        "Deleted {deletedCount} expired upload records.",
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
    "commands.auth.login.description": "通过 device login 登录 OOMOL 账号。",
    "commands.auth.login.summary": "通过 device login 登录",
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
    "commands.connector.run.description":
        "校验输入数据，并同步运行一个 connector action。",
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
    "commands.file.cleanup.description": "删除本地 sqlite 中已过期的上传记录。",
    "commands.file.cleanup.summary": "清理已过期上传记录",
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
    "commands.help.summary": "显示命令帮助",
    "commands.log.description": "查看持久化的 CLI debug 日志。",
    "commands.log.summary": "管理持久化 debug 日志",
    "commands.log.path.description": "打印当前持久化日志目录路径。",
    "commands.log.path.summary": "显示日志目录路径",
    "commands.log.print.description": "按序号打印某一份更早的持久化 debug 日志文件内容。",
    "commands.log.print.summary": "输出某一份更早的 debug 日志",
    "commands.login.description": "通过 device login 登录 OOMOL 账号。是 auth login 的别名。",
    "commands.login.summary": "通过 device login 登录（auth login 的别名）",
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
    "commands.skills.description": "管理 Codex skill。",
    "commands.skills.summary": "管理 Codex skill",
    "commands.skills.search.description":
        "使用自由文本通过 skills search API 搜索已发布的 skill。",
    "commands.skills.search.summary":
        "搜索已发布的 skill",
    "commands.skills.list.description":
        "列出本地 Codex skills 目录中由 oo 管理的 Codex skill。",
    "commands.skills.list.summary":
        "列出由 oo 管理的 Codex skill",
    "commands.skills.install.description":
        "将内置 skill 安装到受支持的本地 skill 目录，或将已发布 skill 安装到本地 Codex skills 目录。",
    "commands.skills.install.summary": "安装 skill",
    "commands.skills.update.description":
        "将已安装且由 oo 管理的 Codex skill 更新到最新可用版本。",
    "commands.skills.update.summary": "更新由 oo 管理的 Codex skill",
    "commands.skills.uninstall.description": "从受支持的本地 skill 目录移除内置 skill，或从本地 Codex skills 目录移除一个由 oo 管理的已发布 skill。",
    "commands.skills.uninstall.summary": "移除一个受管理的 skill",
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
    "errors.auth.loginInvalidResponse": "device login 服务返回了不受支持的响应内容。",
    "errors.auth.loginRequestError": "device login 请求失败：{message}",
    "errors.auth.loginRequestFailed": "device login 请求返回了 HTTP {status}。",
    "errors.auth.loginTimeout": "等待 device login 完成超时。",
    "errors.auth.noSavedAccounts": "没有可切换的认证账号。",
    "errors.auth.required":
        "使用此命令前请先登录。",
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
    "errors.completion.invalidShell":
        "不支持的 shell：{value}。请使用 bash、zsh 或 fish。",
    "errors.checkUpdate.failed": "检查 CLI 更新失败。",
    "errors.config.invalidKey": "无效的配置键：{value}。",
    "errors.config.invalidLangValue":
        "无效的 lang 值：{value}。请使用 en 或 zh。",
    "errors.config.invalidFileDownloadOutDirValue":
        "无效的 file.download.out_dir 值：{value}。请使用非空路径。",
    "errors.skills.invalidName":
        "不支持的 skill：{value}。请使用 {choices}。",
    "errors.skills.invalidPath":
        "skill 名称 {name} 解析到了本地 Codex skills 目录之外。",
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
        "文件 {path} 的大小为 {size} 字节，超出了 512 MiB 上限 {max} 字节。",
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
    "errors.skills.noSupportedBundledSkillHosts":
        "未检测到已安装的受支持内置 skill 宿主。期望其中之一位于：{paths}。",
    "errors.skills.install.confirmationRequired":
        "Skill {name} 已存在，且需要在交互终端中确认覆盖。",
    "errors.skills.install.invalidArchive":
        "下载的包归档中不包含 {name} 对应的有效 skill 目录。",
    "errors.skills.install.invalidPackageInfo":
        "skills install 使用的包信息服务返回了不受支持的响应内容。",
    "errors.skills.install.noPublishedSkills":
        "包 {packageName} 没有发布任何 skill。",
    "errors.skills.install.nonInteractiveSelection":
        "包 {packageName} 包含多个 skill。请使用 --skill <name>、--all -y，或在交互终端中运行。",
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
        "内置 skill {name} 会自动同步，不能通过 skills update 更新。",
    "errors.skills.update.packageNameMissing":
        "由 oo 管理的 skill {name} 缺少 package 元数据，无法更新。",
    "errors.skills.nameConflict":
        "Skill 名称 {name} 已被 {path} 中的非 OOMOL skill 占用。",
    "errors.skills.storageConflict":
        "{path} 中用于 {name} 的内置 skill 存储目录已被非 OOMOL 内容占用。",
    "errors.skills.notInstalled":
        "Skill {name} 未安装在 {path}。",
    "errors.skills.notManaged":
        "{name} 不是由 oo 管理的 skill，无法移除。",
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
    "options.fileDownloadExt": "指定保存文件的扩展名",
    "options.fileDownloadName": "指定不带扩展名的保存文件名",
    "options.fileStatus": "按上传状态过滤",
    "options.force":
        "即使目标版本已存在也强制重新安装",
    "options.help": "显示命令帮助",
    "options.limit": "指定最多返回多少条记录",
    "options.format": "指定输出格式（使用 json 返回结构化内容）",
    "options.json": "--format=json 的别名",
    "options.keywords":
        "指定用于细化 skill 搜索的逗号分隔关键词",
    "options.skill":
        "指定要安装的 skill 名称（使用 * 表示全部）",
    "options.onlyPackageId": "仅返回 package id",
    "options.all":
        "安装全部已发布 skill，并跳过 skill 选择提示",
    "options.nextToken": "指定下一页分页令牌",
    "options.packageId": "按 package id 过滤",
    "options.packageName": "--package-id 的别名",
    "options.page": "指定日志页码",
    "options.showUrl": "在文本输出中包含下载 URL",
    "options.size": "指定每页数量",
    "options.status": "按任务状态过滤",
    "options.timeout": "设置等待超时时间（默认 6h，范围 10s 到 24h）",
    "options.yes": "跳过确认提示",
    "options.lang": "指定显示语言",
    "options.version": "显示当前版本",
    "selfUpdate.install.success": "已安装 oo {version}。",
    "selfUpdate.install.executable": "可执行入口：{path}",
    "selfUpdate.install.pathNote":
        "请把 {path} 加入 PATH，新的 shell 才能直接运行 oo。",
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
    "skills.list.noResults":
        "未找到由 oo 管理的 skill。",
    "skills.list.source": "来源",
    "skills.list.source.bundled": "内置",
    "skills.list.summary":
        "找到 {count} 个由 oo 管理的 skill。",
    "labels.blocks": "功能块：",
    "labels.status": "状态",
    "labels.version": "版本",
    "skills.install.success": "已将 skill {name} 安装到 {path}。",
    "skills.install.overwrite.invalid":
        "输入无效。请输入 y/yes 或 n/no。",
    "skills.install.overwrite.prompt":
        "Skill {name} 已存在，是否覆盖？[y/N] ",
    "skills.install.selection.invalid":
        "选择无效。请输入一个或多个逗号分隔的序号，或直接回车取消。",
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
        "Codex skill {name} 已是最新版本 {version}。",
    "skills.update.failure":
        "更新 Codex skill {name} 失败：{message}",
    "skills.update.progress.header": "正在更新已安装的 skill",
    "skills.update.progress.checking": "检查更新中",
    "skills.update.progress.preparing": "更新 canonical 文件中",
    "skills.update.progress.publishing": "同步到 Codex 中",
    "skills.update.progress.current": "已是最新",
    "skills.update.progress.updated": "已更新",
    "skills.update.progress.failed": "失败",
    "skills.update.success": "已将 Codex skill {name} 更新到 {path}。",
    "skills.uninstall.success": "已从 {path} 移除 skill {name}。",
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
    "connector.search.text.schemaPath": "Schema 路径",
    "mixedSearch.text.kind": "类型",
    "mixedSearch.text.kind.connector": "connector",
    "mixedSearch.text.kind.package": "包",
    "mixedSearch.text.noResults": "未找到匹配的包或 connector action。",
    "connector.run.text.dryRunPassed": "校验通过。",
    "connector.run.text.executionId": "执行 ID",
    "connector.run.text.resultData": "结果数据",
    "file.cleanup.success": "已删除 {deletedCount} 条过期上传记录。",
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
