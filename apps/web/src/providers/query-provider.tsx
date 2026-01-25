'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { type ReactNode } from 'react'

interface QueryProviderProps {
  children: ReactNode
}

/**
 * Creates a QueryClient with sensible defaults.
 * - 5 minute stale time for most queries
 * - 30 minute garbage collection time
 * - Disabled refetch on window focus by default (can be overridden per-query)
 * - 1 retry on failure
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is considered fresh for 5 minutes
        staleTime: 5 * 60 * 1000,
        // Cached data is kept for 30 minutes
        gcTime: 30 * 60 * 1000,
        // Don't refetch on window focus by default
        refetchOnWindowFocus: false,
        // Retry failed requests once
        retry: 1,
        // Don't retry on 4xx errors (except 408, 429)
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      },
      mutations: {
        // Don't retry mutations by default
        retry: false,
      },
    },
  })
}

// Browser: Create a single client instance
let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: Always create a new client
    return makeQueryClient()
  }
  // Browser: Reuse the same client
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient()
  }
  return browserQueryClient
}

/**
 * React Query provider component.
 * Wrap your app with this to enable data fetching hooks.
 *
 * @example
 * ```tsx
 * // In layout.tsx
 * <QueryProvider>
 *   {children}
 * </QueryProvider>
 * ```
 */
export function QueryProvider({ children }: QueryProviderProps) {
  const queryClient = getQueryClient()

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  )
}
