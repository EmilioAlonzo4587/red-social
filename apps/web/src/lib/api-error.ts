import type { ErrorResponseDto } from "@red/api-types";

export class ApiError extends Error {
  readonly statusCode: number;
  readonly details: ErrorResponseDto["details"];

  constructor(body: ErrorResponseDto, statusCode: number) {
    super(body.message);
    this.statusCode = statusCode;
    this.details = body.details;
  }
}

export async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ErrorResponseDto;
    return new ApiError(body, response.status);
  } catch {
    return new ApiError(
      {
        statusCode: response.status,
        error: response.statusText,
        message: response.statusText,
        details: [],
      },
      response.status,
    );
  }
}
