import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { paths } from '@/lib/api/types'
import type { ApiError } from '@/lib/api/errors'

/**
 * Type helper for POST endpoint paths
 */
type PostPaths = {
  [P in keyof paths]: paths[P] extends { post: unknown } ? P : never
}[keyof paths]

/**
 * Type helper for PUT endpoint paths
 */
type PutPaths = {
  [P in keyof paths]: paths[P] extends { put: unknown } ? P : never
}[keyof paths]

/**
 * Type helper for PATCH endpoint paths
 */
type PatchPaths = {
  [P in keyof paths]: paths[P] extends { patch: unknown } ? P : never
}[keyof paths]

/**
 * Type helper for DELETE endpoint paths
 */
type DeletePaths = {
  [P in keyof paths]: paths[P] extends { delete: unknown } ? P : never
}[keyof paths]

/**
 * All mutation paths
 */
type MutationPaths = PostPaths | PutPaths | PatchPaths | DeletePaths

/**
 * HTTP methods for mutations
 */
type MutationMethod = 'post' | 'put' | 'patch' | 'delete'

/**
 * Type helper to extract request body from a mutation endpoint
 */
type RequestBody<Path extends MutationPaths, Method extends MutationMethod> =
  paths[Path] extends { [K in Method]: { requestBody?: { content: { 'application/json': infer B } } } }
    ? B
    : undefined

/**
 * Type helper to extract path parameters from a mutation endpoint
 */
type MutationPathParams<
  Path extends MutationPaths,
  Method extends MutationMethod,
> = paths[Path] extends { [K in Method]: { parameters: { path: infer P } } }
  ? P
  : undefined

/**
 * Type helper to extract success response from a mutation endpoint
 */
type MutationResponse<
  Path extends MutationPaths,
  Method extends MutationMethod,
> = paths[Path] extends {
  [K in Method]: { responses: { 200: { content: { 'application/json': infer R } } } }
}
  ? R
  : paths[Path] extends {
      [K in Method]: { responses: { 201: { content: { 'application/json': infer R } } } }
    }
    ? R
    : void

/**
 * Variables for mutation hook
 */
interface MutationVariables<
  Path extends MutationPaths,
  Method extends MutationMethod,
> {
  body?: RequestBody<Path, Method>
  path?: MutationPathParams<Path, Method>
}

/**
 * Options for useApiMutation hook
 */
interface UseApiMutationOptions<
  Path extends MutationPaths,
  Method extends MutationMethod,
> extends Omit<
    UseMutationOptions<
      MutationResponse<Path, Method>,
      ApiError,
      MutationVariables<Path, Method>,
      unknown
    >,
    'mutationFn' | 'onSuccess'
  > {
  /** Query keys to invalidate on success */
  invalidateKeys?: unknown[][]
  /** Custom onSuccess callback */
  onSuccess?: (
    data: MutationResponse<Path, Method>,
    variables: MutationVariables<Path, Method>,
    context: unknown
  ) => void | Promise<void>
}

// Helper to execute the API call based on method
async function executeApiCall<Path extends MutationPaths, Method extends MutationMethod>(
  path: Path,
  method: Method,
  variables: MutationVariables<Path, Method>
): Promise<{ data?: unknown; error?: unknown }> {
  const options = {
    params: { path: variables.path },
    body: variables.body,
  }

  switch (method) {
    case 'post':
      return api.POST(path as never, options as never)
    case 'put':
      return api.PUT(path as never, options as never)
    case 'patch':
      return api.PATCH(path as never, options as never)
    case 'delete':
      return api.DELETE(path as never, options as never)
    default:
      throw new Error(`Unsupported method: ${method}`)
  }
}

/**
 * Type-safe mutation hook for POST/PUT/PATCH/DELETE endpoints.
 *
 * @example
 * ```ts
 * // POST mutation
 * const createEmployee = useApiMutation('/employees', 'post', {
 *   invalidateKeys: [['/employees']],
 *   onSuccess: () => toast.success('Employee created'),
 * })
 *
 * // Use it
 * createEmployee.mutate({
 *   body: { name: 'John', email: 'john@example.com' }
 * })
 *
 * // PUT mutation with path params
 * const updateEmployee = useApiMutation('/employees/{id}', 'put')
 * updateEmployee.mutate({
 *   path: { id: '123' },
 *   body: { name: 'Updated Name' }
 * })
 *
 * // DELETE mutation
 * const deleteEmployee = useApiMutation('/employees/{id}', 'delete')
 * deleteEmployee.mutate({ path: { id: '123' } })
 * ```
 */
export function useApiMutation<
  Path extends MutationPaths,
  Method extends MutationMethod,
>(path: Path, method: Method, options?: UseApiMutationOptions<Path, Method>) {
  const queryClient = useQueryClient()
  const { invalidateKeys, onSuccess: customOnSuccess, ...mutationOptions } = options ?? {}

  return useMutation({
    mutationFn: async (variables: MutationVariables<Path, Method>) => {
      const { data, error } = await executeApiCall(path, method, variables)

      if (error) {
        throw error
      }

      return data as MutationResponse<Path, Method>
    },
    ...mutationOptions,
    onSuccess: (data, variables, context) => {
      // Invalidate specified query keys
      if (invalidateKeys?.length) {
        invalidateKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key })
        })
      }

      // Call custom onSuccess if provided
      customOnSuccess?.(data, variables, context)
    },
  })
}
