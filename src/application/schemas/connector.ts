import { stringify as stringifyToml } from "smol-toml";
import { z } from "zod";

// Self-hosted connector configuration persisted in connector.toml. It is a
// capability override, not an account: when present, connector-family commands
// route to this server instead of the OOMOL-hosted connector service. It is
// stored outside auth.toml so older CLI versions (whose auth schema is strict)
// keep working on machines that configure a self-hosted connector.
export const selfHostedConnectorConfigSchema = z.object({
    token: z.string().min(1).optional(),
    url: z.string().min(1),
}).strict();

export const connectorFileSchema = z.object({
    selfHosted: selfHostedConnectorConfigSchema.optional(),
}).strict();

const selfHostedConnectorTomlSchema = z.object({
    token: z.string().min(1).optional(),
    url: z.string().min(1),
}).strict();

export const connectorTomlFileSchema = z.object({
    self_hosted: selfHostedConnectorTomlSchema.optional(),
}).strict().transform(file => ({
    ...(file.self_hosted === undefined
        ? {}
        : {
                selfHosted: {
                    ...(file.self_hosted.token === undefined
                        ? {}
                        : { token: file.self_hosted.token }),
                    url: file.self_hosted.url,
                },
            }),
}));

export type SelfHostedConnectorConfig = z.output<typeof selfHostedConnectorConfigSchema>;
export type ConnectorFile = z.output<typeof connectorFileSchema>;

export const defaultConnectorFile: ConnectorFile = {};

export function renderConnectorFile(connectorFile: ConnectorFile): string {
    const selfHosted = connectorFile.selfHosted;

    if (selfHosted === undefined) {
        return "";
    }

    const lines = [
        "[self_hosted]",
        renderTomlLine("url", selfHosted.url),
    ];

    if (selfHosted.token !== undefined) {
        lines.push(renderTomlLine("token", selfHosted.token));
    }

    return `${lines.join("\n")}\n`;
}

export function getSelfHostedConnectorConfig(
    connectorFile: ConnectorFile,
): SelfHostedConnectorConfig | undefined {
    return connectorFile.selfHosted;
}

function renderTomlLine(key: string, value: string): string {
    return stringifyToml({ [key]: value }).trimEnd();
}
