import type { InteractiveInput } from "../../contracts/cli.ts";

/**
 * Read all of stdin to EOF as a UTF-8 string.
 *
 * Accumulates `data` chunks and resolves on `end`. The content is returned
 * verbatim (no trimming); an immediately-ended stream yields an empty string.
 * Callers that must not block on an interactive terminal should check
 * `stdin.isTTY` before invoking this.
 */
export async function readStdinToEnd(stdin: InteractiveInput): Promise<string> {
    return await new Promise<string>((resolve) => {
        const decoder = new TextDecoder();
        let buffer = "";

        const onData = (chunk: string | Uint8Array): void => {
            buffer += typeof chunk === "string"
                ? chunk
                : decoder.decode(chunk, { stream: true });
        };

        const onEnd = (): void => {
            buffer += decoder.decode();
            stdin.off("data", onData);
            stdin.off("end", onEnd);
            resolve(buffer);
        };

        // Subscribe to `data` before `end` so buffered chunks flush first.
        stdin.on("data", onData);
        stdin.on("end", onEnd);
        stdin.resume?.();
    });
}
