import { CliUserError } from "../../contracts/cli.ts";

export const insufficientCreditHttpStatus = 402;
export const insufficientCreditErrorCode = "OOMOL_INSUFFICIENT_CREDIT";
export const billingUrl = "https://console.oomol.com/billing";

export function createInsufficientCreditError(): CliUserError {
    return new CliUserError("errors.billing.insufficientCredit", 1, {
        url: billingUrl,
    });
}

export function isInsufficientCreditHttpStatus(status: number): boolean {
    return status === insufficientCreditHttpStatus;
}

export function isInsufficientCreditSignal(value: string | undefined): boolean {
    return value?.includes(insufficientCreditErrorCode) ?? false;
}

export function isInsufficientCreditFailure(options: {
    errorCode?: string;
    message?: string;
    status: number;
}): boolean {
    return isInsufficientCreditHttpStatus(options.status)
        || options.errorCode === insufficientCreditErrorCode
        || isInsufficientCreditSignal(options.message);
}
