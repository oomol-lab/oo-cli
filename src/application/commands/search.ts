import { connectorSearchCommand } from "./connector/search.ts";

/**
 * `oo search` is the top-level entry to connector action discovery. It is the
 * same command as `oo connector search` - same argument, options, output
 * contract and handler - and differs only in its help text, which addresses a
 * reader who has not navigated into the connector group.
 *
 * It became a duplicate in b861d8a: it used to search packages and connector
 * actions together, and package search was removed.
 */
export const searchCommand: typeof connectorSearchCommand = {
    ...connectorSearchCommand,
    summaryKey: "commands.search.summary",
    descriptionKey: "commands.search.description",
};
