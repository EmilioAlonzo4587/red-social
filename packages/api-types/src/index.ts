export type { paths, components, operations } from "./openapi";

import type { components } from "./openapi";

export type RegisterDto = components["schemas"]["RegisterDto"];
export type LoginDto = components["schemas"]["LoginDto"];
export type MeDto = components["schemas"]["MeDto"];
export type ErrorResponseDto = components["schemas"]["ErrorResponseDto"];
export type ErrorDetailDto = components["schemas"]["ErrorDetailDto"];
export type HealthResponseDto = components["schemas"]["HealthResponseDto"];
