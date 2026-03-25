export const logCategory = {
    recoverableCache: "recoverable_cache",
    systemError: "system_error",
    userError: "user_error",
} as const;

export type LogCategory = (typeof logCategory)[keyof typeof logCategory];
