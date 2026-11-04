/**
 * Runs `worker` over `items` with at most `limit` in flight at once and
 * returns the results in input order.
 *
 * Fails fast: after the first rejection no new items are started, but the
 * call still waits for in-flight workers to settle before rethrowing that
 * first error, so no request outlives the call.
 */
export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results: R[] = Array.from({ length: items.length });
    let nextIndex = 0;
    let failure: { error: unknown } | undefined;

    const runners = Array.from(
        { length: Math.max(1, Math.min(limit, items.length)) },
        async () => {
            while (failure === undefined) {
                const index = nextIndex;

                nextIndex += 1;

                if (index >= items.length) {
                    return;
                }

                try {
                    results[index] = await worker(items[index] as T, index);
                }
                catch (error) {
                    failure ??= { error };
                }
            }
        },
    );

    await Promise.all(runners);

    if (failure !== undefined) {
        throw failure.error;
    }

    return results;
}
