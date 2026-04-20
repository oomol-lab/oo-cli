param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$InstallArguments = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$script:DefaultDownloadBaseUrl = "https://static.oomol.com/release/apps/oo-cli"
$script:DownloadBaseUrl = if ([string]::IsNullOrWhiteSpace($env:OO_INSTALL_DOWNLOAD_BASE_URL)) {
    $script:DefaultDownloadBaseUrl
}
else {
    $env:OO_INSTALL_DOWNLOAD_BASE_URL
}
$script:DownloadDirectory = if ([string]::IsNullOrWhiteSpace($env:OO_INSTALL_DOWNLOAD_DIR)) {
    $null
}
else {
    $env:OO_INSTALL_DOWNLOAD_DIR
}
$script:DownloadedBinaryPath = $null

function Fail {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    throw [System.InvalidOperationException]::new($Message)
}

function Assert-Windows {
    if (
        -not [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
            [System.Runtime.InteropServices.OSPlatform]::Windows
        )
    ) {
        Fail "install.ps1 only supports Windows."
    }
}

function Resolve-DefaultDownloadDirectory {
    Assert-Windows

    $appDataDirectory = [Environment]::GetFolderPath(
        [Environment+SpecialFolder]::ApplicationData
    )

    if ([string]::IsNullOrWhiteSpace($appDataDirectory)) {
        if ([string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
            Fail "Could not resolve the Windows ApplicationData directory."
        }

        $appDataDirectory = Join-Path -Path $env:USERPROFILE -ChildPath "AppData\Roaming"
    }

    $rootDirectory = Join-Path -Path $appDataDirectory -ChildPath "oo"
    return Join-Path -Path $rootDirectory -ChildPath "downloads"
}

function Resolve-Platform {
    if (-not [string]::IsNullOrWhiteSpace($env:OO_INSTALL_PLATFORM)) {
        return $env:OO_INSTALL_PLATFORM
    }

    Assert-Windows

    $architecture = (
        [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
    ).ToString().ToLowerInvariant()

    switch ($architecture) {
        "arm64" {
            return "win32-arm64"
        }
        "x64" {
            return "win32-x64"
        }
        default {
            Fail "Unsupported Windows architecture: $architecture"
        }
    }
}

function Get-LatestVersion {
    $latestMetadata = Invoke-RestMethod -Uri "$script:DownloadBaseUrl/latest.json"
    $version = $latestMetadata.version

    if ([string]::IsNullOrWhiteSpace($version)) {
        Fail "Failed to read version from $script:DownloadBaseUrl/latest.json"
    }

    return $version
}

function Build-BinaryUrl {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Version,

        [Parameter(Mandatory = $true)]
        [string]$Platform
    )

    return "$script:DownloadBaseUrl/$Version/$Platform/oo.exe"
}

function Invoke-InstallCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BinaryPath,

        [string[]]$Arguments = @()
    )

    & $BinaryPath install @Arguments
}

function Remove-DownloadedBinary {
    if ([string]::IsNullOrWhiteSpace($script:DownloadedBinaryPath)) {
        return
    }

    try {
        Start-Sleep -Seconds 1
        Remove-Item -LiteralPath $script:DownloadedBinaryPath -Force -ErrorAction SilentlyContinue
    }
    catch {
        Write-Warning "Could not remove temporary file: $script:DownloadedBinaryPath"
    }
}

function Main {
    param(
        [string[]]$Arguments = @()
    )

    [int]$installExitCode = 0

    if ([string]::IsNullOrWhiteSpace($script:DownloadDirectory)) {
        $script:DownloadDirectory = Resolve-DefaultDownloadDirectory
    }

    $version = Get-LatestVersion
    $platform = Resolve-Platform
    $binaryUrl = Build-BinaryUrl -Version $version -Platform $platform

    New-Item -ItemType Directory -Force -Path $script:DownloadDirectory | Out-Null
    $script:DownloadedBinaryPath = Join-Path `
        -Path $script:DownloadDirectory `
        -ChildPath "oo-$version-$platform.exe"

    try {
        Invoke-WebRequest -Uri $binaryUrl -OutFile $script:DownloadedBinaryPath

        if ($env:OO_INSTALL_SKIP_RUN_INSTALL -ne "1") {
            Invoke-InstallCommand -BinaryPath $script:DownloadedBinaryPath -Arguments $Arguments
            $installExitCode = $LASTEXITCODE
        }
    }
    finally {
        Remove-DownloadedBinary
    }

    if ($installExitCode -ne 0) {
        exit $installExitCode
    }
}

$isDotSourced = $MyInvocation.InvocationName -eq "."

if (-not $isDotSourced) {
    $invocationLine = $MyInvocation.Line
    $isDotSourced = -not [string]::IsNullOrWhiteSpace($invocationLine) -and `
        $invocationLine.TrimStart().StartsWith(". ")
}

if (-not $isDotSourced) {
    Main -Arguments $InstallArguments
}
