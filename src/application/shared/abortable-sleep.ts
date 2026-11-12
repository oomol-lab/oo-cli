/**
 * Resolves after `delayMs`, or rejects with the signal's reason as soon as the
 * signal aborts, so a caller with a deadline is not kept waiting for a delay
 * it can no longer use. The delay itself is `Bun.sleep`, which cannot be
 * cancelled: after an abort its timer simply runs out unobserved.
 */
export async function abortableSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
    if (signal === undefined) {
        await Bun.sleep(delayMs);

        return;
    }

    signal.throwIfAborted();

    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
    });

    try {
        await Promise.race([Bun.sleep(delayMs), aborted]);
    }
    finally {
        if (onAbort !== undefined) {
            signal.removeEventListener("abort", onAbort);
        }
    }
}
