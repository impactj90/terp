"use client"

/**
 * Platform tRPC client.
 *
 * Parallels `src/trpc/client.tsx` but:
 *   - talks to `/api/trpc-platform` (single `httpBatchLink`, no subscriptions),
 *   - sends cookies via `credentials: "include"` so the `platform-session`
 *     cookie flows on every request,
 *   - detects an expired platform session by looking for
 *     `x-auth-domain: platform` on a 401 response and hard-redirects to
 *     `/platform/login?reason=session`,
 *   - does NOT read a Supabase session and does NOT set `x-tenant-id`.
 */
import { useState } from "react"
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import {
  createTRPCClient,
  httpBatchLink,
  TRPCClientError,
} from "@trpc/client"
import { toast } from "sonner"
import type { PlatformAppRouter } from "@/trpc/platform/_app"
import { PlatformTRPCContextProvider } from "./context"

function platformFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, { ...init, credentials: "include" }).then((res) => {
    if (
      res.status === 401 &&
      res.headers.get("x-auth-domain") === "platform" &&
      typeof window !== "undefined"
    ) {
      const here = window.location.pathname
      if (!here.startsWith("/platform/login")) {
        window.location.href = "/platform/login?reason=session"
      }
    }
    return res
  })
}

function makeQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error) => {
        const message =
          error instanceof TRPCClientError
            ? error.message
            : "An unexpected error occurred"
        toast.error(message)
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: 0,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

function getBaseUrl() {
  if (typeof window !== "undefined") return ""
  return `http://localhost:${process.env.PORT ?? 3001}`
}

export function PlatformTRPCProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [queryClient] = useState(() => makeQueryClient())
  const [trpcClient] = useState(() =>
    createTRPCClient<PlatformAppRouter>({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc-platform`,
          fetch: platformFetch,
        }),
      ],
    })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <PlatformTRPCContextProvider
        trpcClient={trpcClient}
        queryClient={queryClient}
      >
        {children}
      </PlatformTRPCContextProvider>
    </QueryClientProvider>
  )
}
