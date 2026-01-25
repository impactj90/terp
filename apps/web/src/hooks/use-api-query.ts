import { useQuery, type UseQueryOptions, type QueryKey } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { paths } from '@/lib/api/types'
import type { ApiError } from '@/lib/api/errors'

/**
 * Type helper for GET endpoint paths
 */
type GetPaths = {
  [P in keyof paths]: paths[P] extends { get: unknown } ? P : never
}[keyof paths]

/**
 * Type helper to extract query parameters from a GET endpoint
 */
type QueryParams<Path extends GetPaths> = paths[Path]['get'] extends {
  parameters: { query?: infer Q }
}
  ? Q
  : undefined

/**
 * Type helper to extract path parameters from a GET endpoint
 */
type PathParams<Path extends GetPaths> = paths[Path]['get'] extends {
  parameters: { path: infer P }
}
  ? P
  : undefined

/**
 * Type helper to extract success response from a GET endpoint
 */
type SuccessResponse<Path extends GetPaths> = paths[Path]['get'] extends {
  responses: { 200: { content: { 'application/json': infer R } } }
}
  ? R
  : unknown

/**
 * Options for useApiQuery hook
 */
interface UseApiQueryOptions<Path extends GetPaths>
  extends Omit<
    UseQueryOptions<SuccessResponse<Path>, ApiError, SuccessResponse<Path>, QueryKey>,
    'queryKey' | 'queryFn'
  > {
  params?: QueryParams<Path>
  path?: PathParams<Path>
}

/**
 * Type-safe query hook for GET endpoints.
 *
 * @example
 * ```ts
 * // Simple query
 * const { data, isLoading } = useApiQuery('/employees')
 *
 * // With query parameters
 * const { data } = useApiQuery('/employees', {
 *   params: { limit: 20, cursor: 'abc' }
 * })
 *
 * // With path parameters
 * const { data } = useApiQuery('/employees/{id}', {
 *   path: { id: '123' }
 * })
 * ```
 */
export function useApiQuery<Path extends GetPaths>(
  path: Path,
  options?: UseApiQueryOptions<Path>
) {
  const { params, path: pathParams, ...queryOptions } = options ?? {}

  return useQuery({
    queryKey: [path, params, pathParams],
    queryFn: async () => {
      const { data, error } = await api.GET(path as never, {
        params: {
          query: params,
          path: pathParams,
        },
      } as never)

      if (error) {
        throw error
      }

      return data as SuccessResponse<Path>
    },
    ...queryOptions,
  })
}
