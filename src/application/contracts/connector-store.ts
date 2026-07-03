import type { ConnectorFile } from "../schemas/connector.ts";

export interface ConnectorStore {
    getFilePath: () => string;
    read: () => Promise<ConnectorFile>;
    write: (connectorFile: ConnectorFile) => Promise<ConnectorFile>;
    update: (
        updater: (connectorFile: ConnectorFile) => ConnectorFile,
    ) => Promise<ConnectorFile>;
}
