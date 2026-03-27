import { Buffer } from "node:buffer";

// Keep longer and more specific suffixes before shorter overlapping ones so the
// first match always preserves the intended composite extension.
export const compositeExtensions = [
    "pkg.tar.zst",
    "pkg.tar.xz",
    "tar.lzma",
    "cpio.lzma",
    "tar.bz2",
    "cpio.bz2",
    "tar.zst",
    "cpio.zst",
    "tar.lzo",
    "cpio.lzo",
    "tar.gz",
    "cpio.gz",
    "tar.xz",
    "cpio.xz",
    "tar.lz",
    "cpio.lz",
    "tar.br",
    "cpio.br",
    "tar.Z",
    "cpio.Z",
] as const;

// Each MIME type maps to one stable preferred extension. Avoid aliases when the
// media type is commonly served with multiple interchangeable suffixes.
export const mimeTypeExtensionMap = new Map<string, string>([
    ["application/atom+xml", "atom"],
    ["application/epub+zip", "epub"],
    ["application/gzip", "gz"],
    ["application/java-archive", "jar"],
    ["application/javascript", "js"],
    ["application/json", "json"],
    ["application/ld+json", "jsonld"],
    ["application/msword", "doc"],
    ["application/ogg", "ogg"],
    ["application/pdf", "pdf"],
    ["application/postscript", "ps"],
    ["application/rtf", "rtf"],
    ["application/rss+xml", "rss"],
    ["application/sql", "sql"],
    ["application/vnd.android.package-archive", "apk"],
    ["application/vnd.apple.installer+xml", "pkg"],
    ["application/vnd.debian.binary-package", "deb"],
    ["application/vnd.ms-excel", "xls"],
    ["application/vnd.ms-fontobject", "eot"],
    ["application/vnd.ms-powerpoint", "ppt"],
    ["application/vnd.oasis.opendocument.presentation", "odp"],
    ["application/vnd.oasis.opendocument.spreadsheet", "ods"],
    ["application/vnd.oasis.opendocument.text", "odt"],
    ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
    ["application/vnd.rar", "rar"],
    ["application/vnd.sqlite3", "sqlite"],
    ["application/wasm", "wasm"],
    ["application/xhtml+xml", "xhtml"],
    ["application/x-tar", "tar"],
    ["application/x-7z-compressed", "7z"],
    ["application/x-brotli", "br"],
    ["application/x-bzip2", "bz2"],
    ["application/x-compress", "Z"],
    ["application/x-cpio", "cpio"],
    ["application/x-debian-package", "deb"],
    ["application/x-httpd-php", "php"],
    ["application/x-iso9660-image", "iso"],
    ["application/x-lzip", "lz"],
    ["application/x-lzma", "lzma"],
    ["application/x-lzop", "lzo"],
    ["application/x-rar-compressed", "rar"],
    ["application/x-rpm", "rpm"],
    ["application/x-shellscript", "sh"],
    ["application/x-xz", "xz"],
    ["application/xml", "xml"],
    ["application/zip", "zip"],
    ["application/zstd", "zst"],
    ["audio/aac", "aac"],
    ["audio/flac", "flac"],
    ["audio/midi", "mid"],
    ["audio/mpeg", "mp3"],
    ["audio/ogg", "oga"],
    ["audio/wav", "wav"],
    ["audio/x-wav", "wav"],
    ["font/otf", "otf"],
    ["font/ttf", "ttf"],
    ["font/woff", "woff"],
    ["font/woff2", "woff2"],
    ["image/apng", "apng"],
    ["image/avif", "avif"],
    ["image/bmp", "bmp"],
    ["image/gif", "gif"],
    ["image/heic", "heic"],
    ["image/heif", "heif"],
    ["image/jpeg", "jpg"],
    ["image/jxl", "jxl"],
    ["image/png", "png"],
    ["image/svg+xml", "svg"],
    ["image/tiff", "tiff"],
    ["image/vnd.microsoft.icon", "ico"],
    ["image/webp", "webp"],
    ["image/x-icon", "ico"],
    ["text/calendar", "ics"],
    ["text/css", "css"],
    ["text/csv", "csv"],
    ["text/html", "html"],
    ["text/javascript", "js"],
    ["text/markdown", "md"],
    ["text/plain", "txt"],
    ["text/tab-separated-values", "tsv"],
    ["text/vcard", "vcf"],
    ["text/xml", "xml"],
    ["text/yaml", "yaml"],
    ["video/mpeg", "mpeg"],
    ["video/mp4", "mp4"],
    ["video/ogg", "ogv"],
    ["video/quicktime", "mov"],
    ["video/webm", "webm"],
    ["video/x-matroska", "mkv"],
    ["video/x-msvideo", "avi"],
]);

export interface ResolvedDownloadFileName {
    baseName: string;
    extension?: string;
}

export function resolveDownloadFileName(options: {
    contentDisposition?: string | null;
    contentType?: string | null;
    requestedExtension?: string;
    requestedName?: string;
    responseUrl: string;
}): ResolvedDownloadFileName {
    const contentDispositionFileName = parseContentDispositionFileName(
        options.contentDisposition,
    );
    const responseUrlFileName = parseFileNameFromUrl(options.responseUrl);
    const baseName
        = options.requestedName
            ?? contentDispositionFileName?.baseName
            ?? responseUrlFileName?.baseName
            ?? "download";
    const extension
        = options.requestedExtension
            ?? contentDispositionFileName?.extension
            ?? responseUrlFileName?.extension
            ?? parseContentTypeExtension(options.contentType);

    return {
        baseName,
        extension,
    };
}

export function splitFileNameParts(fileName: string): ResolvedDownloadFileName {
    const normalizedFileName = fileName.toLowerCase();

    for (const extension of compositeExtensions) {
        const suffix = `.${extension.toLowerCase()}`;

        if (
            normalizedFileName.endsWith(suffix)
            && fileName.length > suffix.length
        ) {
            return {
                baseName: fileName.slice(0, -suffix.length),
                extension: fileName.slice(-suffix.length + 1),
            };
        }
    }

    const lastDotIndex = fileName.lastIndexOf(".");

    if (lastDotIndex <= 0 || lastDotIndex === fileName.length - 1) {
        return {
            baseName: fileName,
        };
    }

    return {
        baseName: fileName.slice(0, lastDotIndex),
        extension: fileName.slice(lastDotIndex + 1),
    };
}

function parseContentDispositionFileName(
    contentDisposition: string | null | undefined,
): ResolvedDownloadFileName | undefined {
    if (contentDisposition === null || contentDisposition === undefined) {
        return undefined;
    }

    const parameters = parseContentDispositionParameters(contentDisposition);
    let rawFileName: string | undefined;

    if (parameters.has("filename*")) {
        rawFileName = decodeExtendedDispositionValue(parameters.get("filename*"));
    }
    else if (parameters.has("filename")) {
        rawFileName = parseDispositionParameterValue(parameters.get("filename"));
    }

    if (rawFileName === undefined) {
        return undefined;
    }

    return parseResolvedFileName(rawFileName);
}

function parseContentDispositionParameters(
    contentDisposition: string,
): Map<string, string> {
    const parameters = new Map<string, string>();

    for (const segment of splitHeaderParameters(contentDisposition)) {
        const equalsIndex = segment.indexOf("=");

        if (equalsIndex <= 0) {
            continue;
        }

        const key = segment.slice(0, equalsIndex).trim().toLowerCase();
        const value = segment.slice(equalsIndex + 1).trim();

        if (!parameters.has(key)) {
            parameters.set(key, value);
        }
    }

    return parameters;
}

function splitHeaderParameters(value: string): string[] {
    const segments: string[] = [];
    let currentSegment = "";
    let inQuotes = false;
    let isEscaped = false;

    for (const character of value) {
        if (isEscaped) {
            currentSegment += character;
            isEscaped = false;
            continue;
        }

        if (character === "\\" && inQuotes) {
            currentSegment += character;
            isEscaped = true;
            continue;
        }

        if (character === "\"") {
            inQuotes = !inQuotes;
            currentSegment += character;
            continue;
        }

        if (character === ";" && !inQuotes) {
            segments.push(currentSegment.trim());
            currentSegment = "";
            continue;
        }

        currentSegment += character;
    }

    if (currentSegment !== "") {
        segments.push(currentSegment.trim());
    }

    return segments.filter(segment => segment !== "");
}

function parseDispositionParameterValue(value: string | undefined): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    const trimmedValue = value.trim();

    if (trimmedValue === "") {
        return undefined;
    }

    if (!trimmedValue.startsWith("\"")) {
        return trimmedValue;
    }

    if (!trimmedValue.endsWith("\"") || trimmedValue.length < 2) {
        return undefined;
    }

    let result = "";
    let isEscaped = false;

    for (const character of trimmedValue.slice(1, -1)) {
        if (isEscaped) {
            result += character;
            isEscaped = false;
            continue;
        }

        if (character === "\\") {
            isEscaped = true;
            continue;
        }

        result += character;
    }

    if (isEscaped) {
        return undefined;
    }

    return result;
}

function decodeExtendedDispositionValue(
    rawValue: string | undefined,
): string | undefined {
    const parsedValue = parseDispositionParameterValue(rawValue);

    if (parsedValue === undefined) {
        return undefined;
    }

    const firstQuoteIndex = parsedValue.indexOf("'");

    if (firstQuoteIndex < 0) {
        return undefined;
    }

    const secondQuoteIndex = parsedValue.indexOf("'", firstQuoteIndex + 1);

    if (secondQuoteIndex < 0) {
        return undefined;
    }

    const charset = parsedValue.slice(0, firstQuoteIndex).trim().toLowerCase();
    const encodedValue = parsedValue.slice(secondQuoteIndex + 1);
    const decoderLabel
        = charset === "" || charset === "utf-8" || charset === "us-ascii"
            ? "utf-8"
            : charset === "iso-8859-1"
                ? "latin1"
                : undefined;

    if (decoderLabel === undefined || encodedValue === "") {
        return undefined;
    }

    const bytes: number[] = [];

    for (let index = 0; index < encodedValue.length; index += 1) {
        const character = encodedValue[index];

        if (character === undefined) {
            return undefined;
        }

        if (character === "%") {
            const firstHex = encodedValue[index + 1];
            const secondHex = encodedValue[index + 2];

            if (firstHex === undefined || secondHex === undefined) {
                return undefined;
            }

            const byteValue = Number.parseInt(`${firstHex}${secondHex}`, 16);

            if (Number.isNaN(byteValue)) {
                return undefined;
            }

            bytes.push(byteValue);
            index += 2;
            continue;
        }

        bytes.push(character.charCodeAt(0));
    }

    try {
        return Buffer.from(bytes).toString(
            decoderLabel === "latin1" ? "latin1" : "utf8",
        );
    }
    catch {
        return undefined;
    }
}

function parseFileNameFromUrl(urlValue: string): ResolvedDownloadFileName | undefined {
    let url: URL;

    try {
        url = new URL(urlValue);
    }
    catch {
        return undefined;
    }

    const segment = url.pathname.split("/").at(-1);

    if (segment === undefined || segment === "") {
        return undefined;
    }

    let decodedSegment = segment;

    try {
        decodedSegment = decodeURIComponent(segment);
    }
    catch {
        decodedSegment = segment;
    }

    return parseResolvedFileName(decodedSegment);
}

function parseResolvedFileName(value: string): ResolvedDownloadFileName | undefined {
    const sanitizedValue = sanitizeResolvedFileName(value);

    if (sanitizedValue === undefined) {
        return undefined;
    }

    return splitFileNameParts(sanitizedValue);
}

function sanitizeResolvedFileName(value: string): string | undefined {
    const normalizedValue = takeLastPathSegment(value.trim()).trim();

    if (
        normalizedValue === ""
        || normalizedValue === "."
        || normalizedValue === ".."
        || normalizedValue.includes("\0")
    ) {
        return undefined;
    }

    return normalizedValue;
}

function takeLastPathSegment(value: string): string {
    const lastForwardSlashIndex = value.lastIndexOf("/");
    const lastBackwardSlashIndex = value.lastIndexOf("\\");
    const lastSeparatorIndex = Math.max(
        lastForwardSlashIndex,
        lastBackwardSlashIndex,
    );

    return lastSeparatorIndex >= 0
        ? value.slice(lastSeparatorIndex + 1)
        : value;
}

function parseContentTypeExtension(value: string | null | undefined): string | undefined {
    if (value === null || value === undefined) {
        return undefined;
    }

    const separatorIndex = value.indexOf(";");
    const mimeType = (
        separatorIndex >= 0
            ? value.slice(0, separatorIndex)
            : value
    ).trim().toLowerCase();

    return mimeTypeExtensionMap.get(mimeType);
}
