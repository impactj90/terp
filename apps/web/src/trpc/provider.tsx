"use client"

import { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { createTRPCClient, httpBatchLink, httpSubscriptionLink, splitLink } from "@trpc/client"
import type { AppRouter } from "@/server/root"
import { TRPCProvider } from "./context"
import { createClient } from "@/lib/supabase/client"
import { tenantIdStorage } from "@/lib/api/client"

/**
 * Creates a QueryClient with defaults matching the existing QueryProvider.
 * This replaces the previous QueryProvider to unify React Query for both
 * tRPC and legacy openapi-fetch hooks.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: true,
        retry: 1,
        retryDelay: (attemptIndex) =>
          Math.min(1000 * 2 ** attemptIndex, 30000),
      },
      mutations: {
        retry: false,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient()
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient()
  }
  return browserQueryClient
}

function getBaseUrl() {
  if (typeof window !== "undefined") return ""
  return `http://localhost:${process.env.PORT ?? 3001}`
}

/**
 * Combined tRPC + React Query provider.
 *
 * Replaces the previous standalone QueryProvider. The QueryClientProvider
 * inside this component serves both tRPC hooks (useTRPC) and legacy
 * openapi-fetch hooks (useApiQuery/useApiMutation).
 */
export function TRPCReactProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const queryClient = getQueryClient()

  const [trpcClient] = useState(() => {
    const url = `${getBaseUrl()}/api/trpc`

    async function getHeaders() {
      const headers: Record<string, string> = {}

      // Get the current Supabase session token
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.access_token) {
        headers["authorization"] = `Bearer ${session.access_token}`
      }

      // Forward tenant ID to tRPC server
      const tenantId = tenantIdStorage.getTenantId()
      if (tenantId) {
        headers["x-tenant-id"] = tenantId
      }

      return headers
    }

    return createTRPCClient<AppRouter>({
      links: [
        splitLink({
          condition: (op) => op.type === "subscription",
          true: httpSubscriptionLink({
            url,
            // SSE (EventSource) doesn't support custom headers.
            // connectionParams are serialized as URL query parameters
            // and read by createTRPCContext on the server.
            connectionParams: async () => {
              const params: Record<string, string> = {}
              const supabase = createClient()
              const {
                data: { session },
              } = await supabase.auth.getSession()
              if (session?.access_token) {
                params["authorization"] = `Bearer ${session.access_token}`
              }
              const tenantId = tenantIdStorage.getTenantId()
              if (tenantId) {
                params["x-tenant-id"] = tenantId
              }
              return params
            },
          }),
          false: httpBatchLink({
            url,
            headers: getHeaders,
          }),
        }),
      ],
    })
  })

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools
          initialIsOpen={false}
          buttonPosition="bottom-left"
        />
      )}
    </QueryClientProvider>
  )
}
