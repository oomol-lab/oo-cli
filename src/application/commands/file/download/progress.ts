import type { CliExecutionContext } from "../../../contracts/cli.ts";

export function createDownloadProgressReporter(
    writer: CliExecutionContext["stderr"],
    totalBytes: number | undefined,
): DownloadProgressReporter | undefined {
    if (writer.isTTY !== true) {
        return undefined;
    }

    return new DownloadProgressReporter(writer, totalBytes);
}

export class DownloadProgressReporter {
    private hasRenderedLine = false;
    private lastRenderedAt = 0;
    private lastRenderedBytes = -1;
    private lastRenderedLine: string | undefined;

    constructor(
        private readonly writer: Pick<CliExecutionContext["stderr"], "write">,
        private readonly totalBytes: number | undefined,
    ) {}

    render(downloadedBytes: number): void {
        const now = Date.now();

        if (this.totalBytes !== undefined && downloadedBytes === this.totalBytes) {
            return;
        }

        if (
            downloadedBytes === this.lastRenderedBytes
            || (downloadedBytes !== this.totalBytes && now - this.lastRenderedAt < 100)
        ) {
            return;
        }

        this.lastRenderedBytes = downloadedBytes;
        this.lastRenderedAt = now;
        this.writeProgressLine(
            formatProgressLine(downloadedBytes, this.totalBytes),
        );
    }

    finish(downloadedBytes: number): void {
        this.lastRenderedBytes = downloadedBytes;
        this.lastRenderedAt = Date.now();
        this.writeProgressLine(
            formatProgressLine(downloadedBytes, this.totalBytes),
        );
    }

    complete(downloadedBytes: number): void {
        this.lastRenderedBytes = downloadedBytes;
        this.lastRenderedAt = Date.now();
        this.writeProgressLine(
            formatCompletedProgressLine(downloadedBytes, this.totalBytes),
        );
    }

    private writeProgressLine(line: string): void {
        if (this.hasRenderedLine && line === this.lastRenderedLine) {
            return;
        }

        if (!this.hasRenderedLine) {
            this.hasRenderedLine = true;
            this.lastRenderedLine = line;
            this.writer.write(`${line}\n`);
            return;
        }

        this.lastRenderedLine = line;
        this.writer.write(`\u001B[1A\r\u001B[2K${line}\n`);
    }
}

function formatProgressLine(
    downloadedBytes: number,
    totalBytes: number | undefined,
): string {
    return formatProgressStatusLine("Downloading", downloadedBytes, totalBytes);
}

function formatCompletedProgressLine(
    downloadedBytes: number,
    totalBytes: number | undefined,
): string {
    return formatProgressStatusLine("Downloaded", downloadedBytes, totalBytes);
}

function formatProgressStatusLine(
    status: "Downloaded" | "Downloading",
    downloadedBytes: number,
    totalBytes: number | undefined,
): string {
    if (totalBytes === undefined) {
        return `${status} ${formatByteCount(downloadedBytes)}`;
    }

    const percent = totalBytes === 0
        ? 100
        : Math.max(0, Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)));

    return [
        status,
        formatByteCount(downloadedBytes),
        "/",
        formatByteCount(totalBytes),
        `(${percent}%)`,
    ].join(" ");
}

const byteCountUnits = ["B", "KB", "MB", "GB"] as const;

export function formatByteCount(value: number): string {
    let unitIndex = 0;
    let normalizedValue = value;

    while (
        normalizedValue >= 1024
        && unitIndex < byteCountUnits.length - 1
    ) {
        normalizedValue /= 1024;
        unitIndex += 1;
    }

    if (unitIndex === 0) {
        return `${value} B`;
    }

    const roundedValue = Math.round(normalizedValue * 10) / 10;

    return `${formatRoundedByteCount(roundedValue)} ${byteCountUnits[unitIndex]}`;
}

function formatRoundedByteCount(value: number): string {
    return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}
