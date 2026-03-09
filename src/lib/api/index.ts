// API Client
export { api, authStorage, tenantIdStorage } from './client'
export type { AuthTokenStorage, TenantStorage, ApiResponse, ApiRequestBody } from './client'

// Generated Types
export type { paths, components, operations } from './types'

// Error utilities
export {
  parseApiError,
  getErrorMessage,
  isHttpStatus,
  isAuthError,
  isForbiddenError,
  isValidationError,
  isNotFoundError,
} from './errors'
export type { ProblemDetails, ApiError } from './errors'
