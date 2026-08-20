import type { KnownAgentNames } from "@vercel/detect-agent";
import { determineAgent, KNOWN_AGENTS } from "@vercel/detect-agent";

// Reported values are the library's agent names verbatim, plus two sentinels:
// "other" means an agent was detected but is not in the library's known set
// (for example a free-form AI_AGENT value, which must never reach telemetry
// as-is), and "unknown" means no agent marker was detected at all.
export type TelemetryAgentClient = KnownAgentNames | "other" | "unknown";

// Derived from the library so a dependency upgrade extends the accepted
// values without any code change here.
const knownAgentClientNames = new Set<string>(Object.values(KNOWN_AGENTS));

function isKnownAgentClientName(value: string): value is KnownAgentNames {
    return knownAgentClientNames.has(value);
}

export function isTelemetryAgentClient(
    value: string,
): value is TelemetryAgentClient {
    return isKnownAgentClientName(value)
        || value === "other"
        || value === "unknown";
}

// The library reads process.env directly (there is no injection point), which
// matches the real invocation environment in production.
export async function detectTelemetryAgentClient(): Promise<TelemetryAgentClient> {
    try {
        const result = await determineAgent();

        if (!result.isAgent) {
            return "unknown";
        }

        return isKnownAgentClientName(result.agent.name)
            ? result.agent.name
            : "other";
    }
    catch {
        return "unknown";
    }
}
