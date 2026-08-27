import type { ConnectorFile } from "../schemas/connector.ts";

export interface ConnectorStore {
    read: () => Promise<ConnectorFile>;
    write: (connectorFile: ConnectorFile) => Promise<ConnectorFile>;
    update: (
        updater: (connectorFile: ConnectorFile) => ConnectorFile,
    ) => Promise<ConnectorFile>;
}
