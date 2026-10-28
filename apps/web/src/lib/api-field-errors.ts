import type { ErrorDetailDto } from "@red/api-types";

const RULE_MESSAGES: Record<string, string> = {
  minLength: "muy corto",
  maxLength: "muy largo",
  matches: "solo letras, números y guion bajo",
  isEmail: "correo no válido",
  isString: "debe ser texto",
  isNotEmpty: "es obligatorio",
  unique: "ya está en uso",
};

export function fieldErrorsFromDetails(
  details: ErrorDetailDto[] | undefined,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const { field, rule } of details ?? []) {
    errors[field] = RULE_MESSAGES[rule] ?? "valor inválido";
  }
  return errors;
}
