import type { Translator } from "../../contracts/translator.ts";

import { CliUserError } from "../../contracts/cli.ts";
import {
    compileJsonSchema,
    formatJsonSchemaErrors,
    validateCompiledJsonSchema,
} from "../shared/json-schema-validation.ts";

export function validateConnectorActionInput(
    inputValue: unknown,
    schema: unknown,
    translator: Pick<Translator, "locale">,
): void {
    const [validator, compileError] = compileJsonSchema(schema);

    if (compileError !== undefined) {
        throw new CliUserError("errors.connectorRun.invalidActionSchema", 1, {
            message: String(compileError.message ?? compileError),
        });
    }

    const validationErrors = validateCompiledJsonSchema(
        validator,
        inputValue,
        translator.locale,
    );

    if (validationErrors && validationErrors.length > 0) {
        throw new CliUserError("errors.connectorRun.invalidPayload", 2, {
            message: formatJsonSchemaErrors(validationErrors),
        });
    }
}
