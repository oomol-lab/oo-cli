// Thin compatibility shell: the env-override primitives moved into the deep
// identity module. Import from ../../auth/identity.ts directly; this file is
// deleted once every caller has migrated.
export {
    applyEndpointOverride,
    buildEnvApiKeyAccount,
    defaultOomolEndpoint,
    envOverrideAccountId,
    isEnvOverrideAccount,
    readEndpointOverride,
    readTrimmedEnv,
} from "../../auth/identity.ts";
