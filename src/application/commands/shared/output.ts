import type { Writer } from "../../contracts/cli.ts";

export function writeLine(stream: Writer, message: string): void {
    stream.write(`${message}\n`);
}
