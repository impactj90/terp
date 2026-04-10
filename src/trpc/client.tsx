"use client"

import { useState } from "react"
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { TRPCClientError } from "@trpc/client"
import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
  type TRPCLink,
} from "@trpc/client"
import { observable } from "@trpc/server/observable"
import { toast } from "sonner"
import type { AppRouter } from "@/trpc/routers/_app"
import { TRPCProvider } from "./context"
import { createClient } from "@/lib/supabase/client"
import { tenantIdStorage, platformImpersonationStorage } from "@/lib/storage"

/**
 * Creates a QueryClient with sensible defaults for tRPC queries.
 */
function makeQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error) => {
        // Global fallback: show a toast for every failed mutation.
        // Individual mutation hooks can still provide specific onError callbacks;
        // this fires in addition to any per-mutation handler.
        const message =
          error instanceof TRPCClientError
            ? error.message
            : 'An unexpected error occurred'
        toast.error(message)
        console.error('[Mutation Error]', error.message)
      },
    }),
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
 * The QueryClientProvider inside this component serves tRPC hooks (useTRPC).
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

      // Platform impersonation takes full precedence over normal tenant
      // auth. We intentionally do NOT attach the Authorization header
      // when impersonation is active — otherwise a concurrent Supabase
      // tenant session on the same browser would hijack the request
      // away from the impersonation branch in src/trpc/init.ts and the
      // platform_audit_logs dual-write would be skipped silently (S2
      // in the plan at thoughts/shared/plans/2026-04-10-platform-impersonation-ui-bridge.md).
      const impersonation = platformImpersonationStorage.get()
      if (impersonation) {
        headers["x-support-session-id"] = impersonation.supportSessionId
        headers["x-tenant-id"] = impersonation.tenantId
        return headers
      }

      // Normal path: forward Supabase auth + selected tenant id
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.access_token) {
        headers["authorization"] = `Bearer ${session.access_token}`
      }

      const tenantId = tenantIdStorage.getTenantId()
      if (tenantId) {
        headers["x-tenant-id"] = tenantId
      }

      return headers
    }

    // S3 mitigation: if the backend rejects an impersonated request
    // (support session revoked, expired, or otherwise invalid) we must
    // flush local impersonation state and bounce the operator back to
    // the Platform UI, otherwise every subsequent request also fails
    // and the tenant tab sits in a silent broken state.
    const impersonationErrorLink: TRPCLink<AppRouter> = () => {
      return ({ next, op }) => {
        return observable((observer) => {
          const sub = next(op).subscribe({
            next: (value) => observer.next(value),
            error: (err) => {
              const code =
                (err as { data?: { code?: string; httpStatus?: number } })
                  .data?.code
              const httpStatus =
                (err as { data?: { code?: string; httpStatus?: number } })
                  .data?.httpStatus
              const isUnauthorized =
                code === "UNAUTHORIZED" || httpStatus === 401
              if (isUnauthorized && platformImpersonationStorage.get()) {
                platformImpersonationStorage.clear()
                if (typeof window !== "undefined") {
                  window.location.href = "/platform/support-sessions"
                }
              }
              observer.error(err)
            },
            complete: () => observer.complete(),
          })
          return () => sub.unsubscribe()
        })
      }
    }

    return createTRPCClient<AppRouter>({
      links: [
        impersonationErrorLink,
        splitLink({
          condition: (op) => op.type === "subscription",
          true: httpSubscriptionLink({
            url,
            // SSE (EventSource) doesn't support custom headers.
            // connectionParams are serialized as URL query parameters
            // and read by createTRPCContext on the server.
            connectionParams: async () => {
              const params: Record<string, string> = {}

              // Mirror getHeaders() — impersonation takes precedence
              // and intentionally omits the Supabase Authorization token.
              const impersonation = platformImpersonationStorage.get()
              if (impersonation) {
                params["x-support-session-id"] =
                  impersonation.supportSessionId
                params["x-tenant-id"] = impersonation.tenantId
                return params
              }

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
