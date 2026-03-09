/**
 * RFC 7807 Problem Details response from the API.
 */
export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  errors?: Array<{
    field: string
    message: string
  }>
}

/**
 * Structured API error for use in the application.
 */
export interface ApiError {
  status: number
  title: string
  message: string
  fieldErrors?: Record<string, string>
  raw: ProblemDetails | unknown
}

/**
 * Check if an error is a ProblemDetails response.
 */
function isProblemDetails(error: unknown): error is ProblemDetails {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    'title' in error &&
    'status' in error
  )
}

/**
 * Parse an API error response into a structured ApiError.
 *
 * @example
 * ```ts
 * const { data, error } = await api.GET('/employees')
 * if (error) {
 *   const apiError = parseApiError(error)
 *   console.log(apiError.message)
 *   console.log(apiError.fieldErrors)
 * }
 * ```
 */
export function parseApiError(error: unknown): ApiError {
  if (isProblemDetails(error)) {
    // Convert field errors array to object for easier access
    const fieldErrors = error.errors?.reduce<Record<string, string>>(
      (acc, { field, message }) => {
        acc[field] = message
        return acc
      },
      {}
    )

    return {
      status: error.status,
      title: error.title,
      message: error.detail ?? error.title,
      fieldErrors,
      raw: error,
    }
  }

  // Handle generic errors
  if (error instanceof Error) {
    return {
      status: 0,
      title: 'Error',
      message: error.message,
      raw: error,
    }
  }

  // Handle unknown errors
  return {
    status: 0,
    title: 'Unknown Error',
    message: 'An unexpected error occurred',
    raw: error,
  }
}

/**
 * Get a user-friendly error message for common HTTP status codes.
 */
export function getErrorMessage(status: number, fallback?: string): string {
  const messages: Record<number, string> = {
    400: 'Invalid request. Please check your input.',
    401: 'Please log in to continue.',
    403: 'You do not have permission to perform this action.',
    404: 'The requested resource was not found.',
    409: 'This operation conflicts with existing data.',
    422: 'The provided data is invalid.',
    429: 'Too many requests. Please try again later.',
    500: 'An internal server error occurred. Please try again.',
    502: 'The server is temporarily unavailable. Please try again.',
    503: 'The service is currently unavailable. Please try again.',
  }

  return messages[status] ?? fallback ?? 'An error occurred. Please try again.'
}

/**
 * Check if an error is a specific HTTP status.
 */
export function isHttpStatus(error: ApiError, status: number): boolean {
  return error.status === status
}

/**
 * Check if an error is an authentication error (401).
 */
export function isAuthError(error: ApiError): boolean {
  return error.status === 401
}

/**
 * Check if an error is a permission error (403).
 */
export function isForbiddenError(error: ApiError): boolean {
  return error.status === 403
}

/**
 * Check if an error is a validation error (400 or 422).
 */
export function isValidationError(error: ApiError): boolean {
  return error.status === 400 || error.status === 422
}

/**
 * Check if an error is a not found error (404).
 */
export function isNotFoundError(error: ApiError): boolean {
  return error.status === 404
}
