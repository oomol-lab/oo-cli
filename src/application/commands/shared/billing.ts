import { CliUserError } from "../../contracts/cli.ts";

export const insufficientCreditHttpStatus = 402;
export const insufficientCreditErrorCode = "OOMOL_INSUFFICIENT_CREDIT";
export const billingUrl = "https://console.oomol.com/billing";

export function createInsufficientCreditError(): CliUserError {
    return new CliUserError("errors.billing.insufficientCredit", 1, {
        url: billingUrl,
    });
}

// A bare 402 is not enough: connector providers pass their own upstream 402
// through (e.g. an expired third-party API plan). Only OOMOL's balance guards
// put the insufficient-credit marker in the body.
export function isInsufficientCreditResponse(status: number, bodyText: string | undefined): boolean {
    return status === insufficientCreditHttpStatus && isInsufficientCreditSignal(bodyText);
}

export function isInsufficientCreditSignal(value: string | undefined): boolean {
    return value?.includes(insufficientCreditErrorCode) ?? false;
}

export function isInsufficientCreditFailure(options: {
    errorCode?: string;
    message?: string;
}): boolean {
    return options.errorCode === insufficientCreditErrorCode
        || isInsufficientCreditSignal(options.message);
}
