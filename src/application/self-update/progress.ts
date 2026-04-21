// Stages reported by performSelfUpdateOperation via its reportStage callback.
export type SelfUpdateOperationStage
    = | "prepare"
        | "download"
        | "reuse"
        | "activate"
        | "verify"
        | "cleanup";

// All stages including "resolve", which is managed at the command level.
export type SelfUpdateProgressStage = SelfUpdateOperationStage | "resolve";

export interface SelfUpdateProgressStageDetails {
    version?: string;
}

export interface SelfUpdateProgressEvent extends SelfUpdateProgressStageDetails {
    stage: SelfUpdateOperationStage;
}
