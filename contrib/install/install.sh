#!/usr/bin/env bash

set -euo pipefail

readonly DEFAULT_DOWNLOAD_BASE_URL="https://static.oomol.com/release/apps/oo-cli"

DOWNLOAD_BASE_URL="${OO_INSTALL_DOWNLOAD_BASE_URL:-$DEFAULT_DOWNLOAD_BASE_URL}"
DOWNLOAD_DIR="${OO_INSTALL_DOWNLOAD_DIR:-}"
DOWNLOADER=""
DOWNLOADED_BINARY_PATH=""

fail() {
    printf '%s\n' "$1" >&2
    exit 1
}

cleanup() {
    if [ -n "${DOWNLOADED_BINARY_PATH:-}" ]; then
        rm -f "$DOWNLOADED_BINARY_PATH"
    fi
}

select_downloader() {
    if command -v curl >/dev/null 2>&1; then
        DOWNLOADER="curl"
        return 0
    fi

    if command -v wget >/dev/null 2>&1; then
        DOWNLOADER="wget"
        return 0
    fi

    fail "Either curl or wget is required but neither is installed."
}

download_text() {
    local url="$1"

    if [ "$DOWNLOADER" = "curl" ]; then
        curl -fsSL "$url"
        return 0
    fi

    wget -q -O - "$url"
}

download_file() {
    local url="$1"
    local output_path="$2"

    if [ "$DOWNLOADER" = "curl" ]; then
        curl -fsSL -o "$output_path" "$url"
        return 0
    fi

    wget -q -O "$output_path" "$url"
}

extract_version_from_latest_json() {
    local latest_json="$1"
    local compact_json version_field

    compact_json="$(printf '%s' "$latest_json" | tr -d '[:space:]')"
    version_field="${compact_json#*\"version\":\"}"

    if [ "$version_field" = "$compact_json" ]; then
        return 1
    fi

    printf '%s\n' "${version_field%%\"*}"
}

detect_os() {
    case "$(uname -s)" in
        Darwin)
            printf 'darwin\n'
            ;;
        Linux)
            printf 'linux\n'
            ;;
        MINGW*|MSYS*|CYGWIN*)
            fail "Windows is not supported by install.sh."
            ;;
        *)
            fail "Unsupported operating system: $(uname -s)"
            ;;
    esac
}

resolve_default_download_dir() {
    case "$(detect_os)" in
        darwin)
            printf '%s\n' "${HOME}/Library/Application Support/oo/downloads"
            ;;
        linux)
            printf '%s\n' "${HOME}/.config/oo/downloads"
            ;;
    esac
}

detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64)
            printf 'x64\n'
            ;;
        arm64|aarch64)
            printf 'arm64\n'
            ;;
        *)
            fail "Unsupported architecture: $(uname -m)"
            ;;
    esac
}

is_rosetta_translated() {
    [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" = "1" ]
}

is_linux_musl() {
    if [ -f /lib/libc.musl-x86_64.so.1 ] || [ -f /lib/libc.musl-aarch64.so.1 ]; then
        return 0
    fi

    if command -v ldd >/dev/null 2>&1 && ldd /bin/ls 2>&1 | grep -q "musl"; then
        return 0
    fi

    return 1
}

resolve_platform() {
    local os arch

    if [ -n "${OO_INSTALL_PLATFORM:-}" ]; then
        printf '%s\n' "$OO_INSTALL_PLATFORM"
        return 0
    fi

    os="$(detect_os)"
    arch="$(detect_arch)"

    if [ "$os" = "darwin" ] && [ "$arch" = "x64" ] && is_rosetta_translated; then
        arch="arm64"
    fi

    if [ "$os" = "linux" ]; then
        if is_linux_musl; then
            printf 'linux-%s-musl\n' "$arch"
            return 0
        fi

        printf 'linux-%s\n' "$arch"
        return 0
    fi

    printf '%s-%s\n' "$os" "$arch"
}

fetch_latest_version() {
    local latest_json latest_version

    latest_json="$(download_text "$DOWNLOAD_BASE_URL/latest.json")"

    if ! latest_version="$(extract_version_from_latest_json "$latest_json")" || [ -z "$latest_version" ]; then
        fail "Failed to read version from $DOWNLOAD_BASE_URL/latest.json"
    fi

    printf '%s\n' "$latest_version"
}

build_binary_url() {
    local version="$1"
    local platform="$2"

    printf '%s/%s/%s/oo\n' "$DOWNLOAD_BASE_URL" "$version" "$platform"
}

run_install_command() {
    local binary_path="$1"
    shift

    if [ "${OO_INSTALL_SKIP_RUN_INSTALL:-0}" = "1" ]; then
        return 0
    fi

    "$binary_path" install "$@"
}

main() {
    local version platform binary_url

    trap cleanup EXIT

    if [ -z "$DOWNLOAD_DIR" ]; then
        DOWNLOAD_DIR="$(resolve_default_download_dir)"
    fi

    select_downloader
    version="$(fetch_latest_version)"
    platform="$(resolve_platform)"
    binary_url="$(build_binary_url "$version" "$platform")"

    mkdir -p "$DOWNLOAD_DIR"
    DOWNLOADED_BINARY_PATH="$DOWNLOAD_DIR/oo-$version-$platform"

    download_file "$binary_url" "$DOWNLOADED_BINARY_PATH"
    chmod +x "$DOWNLOADED_BINARY_PATH"
    run_install_command "$DOWNLOADED_BINARY_PATH" "$@"
}

if [[ "${BASH_SOURCE[0]-$0}" == "$0" ]]; then
    main "$@"
fi
