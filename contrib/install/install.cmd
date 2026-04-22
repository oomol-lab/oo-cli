@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "DEFAULT_DOWNLOAD_BASE_URL=https://static.oomol.com/release/apps/oo-cli"
set "DOWNLOAD_BASE_URL=%OO_INSTALL_DOWNLOAD_BASE_URL%"
if not defined DOWNLOAD_BASE_URL set "DOWNLOAD_BASE_URL=%DEFAULT_DOWNLOAD_BASE_URL%"

set "DOWNLOAD_DIR=%OO_INSTALL_DOWNLOAD_DIR%"
set "DOWNLOADED_BINARY_PATH="

if not defined DOWNLOAD_DIR (
    call :resolve_default_download_dir
    if errorlevel 1 exit /b 1
)

curl --version >nul 2>&1
if errorlevel 1 (
    call :fail "curl is required but not available."
    exit /b 1
)

if not exist "%DOWNLOAD_DIR%" mkdir "%DOWNLOAD_DIR%"
if errorlevel 1 (
    call :fail "Failed to create download directory: %DOWNLOAD_DIR%"
    exit /b 1
)

call :get_latest_version VERSION
if errorlevel 1 exit /b 1

call :resolve_platform PLATFORM
if errorlevel 1 exit /b 1

set "BINARY_URL=%DOWNLOAD_BASE_URL%/%VERSION%/%PLATFORM%/oo.exe"
set "DOWNLOADED_BINARY_PATH=%DOWNLOAD_DIR%\oo-%VERSION%-%PLATFORM%.exe"

call :download_file "%BINARY_URL%" "%DOWNLOADED_BINARY_PATH%"
if errorlevel 1 (
    call :cleanup
    call :fail "Failed to download binary from %BINARY_URL%"
    exit /b 1
)

set "INSTALL_EXIT_CODE=0"
if not "%OO_INSTALL_SKIP_RUN_INSTALL%"=="1" (
    "%DOWNLOADED_BINARY_PATH%" install %*
    set "INSTALL_EXIT_CODE=!ERRORLEVEL!"
)

call :cleanup

if not "%INSTALL_EXIT_CODE%"=="0" exit /b %INSTALL_EXIT_CODE%
exit /b 0

:resolve_default_download_dir
if defined APPDATA (
    set "DOWNLOAD_DIR=%APPDATA%\oo\downloads"
    exit /b 0
)

if not defined USERPROFILE (
    call :fail "Could not resolve the Windows ApplicationData directory."
    exit /b 1
)

set "DOWNLOAD_DIR=%USERPROFILE%\AppData\Roaming\oo\downloads"
exit /b 0

:resolve_platform
if defined OO_INSTALL_PLATFORM (
    set "%~1=%OO_INSTALL_PLATFORM%"
    exit /b 0
)

set "ARCHITECTURE=%PROCESSOR_ARCHITEW6432%"
if not defined ARCHITECTURE set "ARCHITECTURE=%PROCESSOR_ARCHITECTURE%"

if /I "%ARCHITECTURE%"=="ARM64" (
    set "%~1=win32-arm64"
    exit /b 0
)

if /I "%ARCHITECTURE%"=="AMD64" (
    set "%~1=win32-x64"
    exit /b 0
)

if /I "%ARCHITECTURE%"=="X64" (
    set "%~1=win32-x64"
    exit /b 0
)

call :fail "Unsupported Windows architecture: %ARCHITECTURE%"
exit /b 1

:get_latest_version
set "LATEST_JSON_PATH=%DOWNLOAD_DIR%\latest.json"
call :download_file "%DOWNLOAD_BASE_URL%/latest.json" "%LATEST_JSON_PATH%"
if errorlevel 1 (
    call :fail "Failed to read version from %DOWNLOAD_BASE_URL%/latest.json"
    exit /b 1
)

call :parse_latest_metadata "%LATEST_JSON_PATH%" VERSION
set "PARSE_EXIT_CODE=%ERRORLEVEL%"
del /f /q "%LATEST_JSON_PATH%" >nul 2>&1
if not "%PARSE_EXIT_CODE%"=="0" (
    call :fail "Failed to read version from %DOWNLOAD_BASE_URL%/latest.json"
    exit /b 1
)

set "%~1=%VERSION%"
exit /b 0

:parse_latest_metadata
setlocal EnableDelayedExpansion
set "CONTENT="

for /f "usebackq delims=" %%i in ("%~1") do (
    set "CONTENT=!CONTENT!%%i"
)

set "CONTENT=!CONTENT: =!"
set "AFTER=!CONTENT:*"version":"=!"
if "!AFTER!"=="!CONTENT!" (
    endlocal & exit /b 1
)

for /f "tokens=1 delims=,}" %%v in ("!AFTER!") do (
    set "VERSION_VALUE=%%v"
)
set "VERSION_VALUE=!VERSION_VALUE:"=!"

if not defined VERSION_VALUE (
    endlocal & exit /b 1
)

endlocal & set "%~2=%VERSION_VALUE%" & exit /b 0

:download_file
curl -fsSL "%~1" -o "%~2"
exit /b %ERRORLEVEL%

:cleanup
if not defined DOWNLOADED_BINARY_PATH exit /b 0

del /f /q "%DOWNLOADED_BINARY_PATH%" >nul 2>&1
exit /b 0

:fail
>&2 echo %~1
exit /b 1
