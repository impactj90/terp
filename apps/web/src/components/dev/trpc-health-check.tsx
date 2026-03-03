"use client"

import { useQuery } from "@tanstack/react-query"
import { useTRPC } from "@/trpc/context"

/**
 * Development-only component to verify tRPC health check.
 * Remove after ZMI-TICKET-201 is verified.
 */
export function TrpcHealthCheck() {
  const trpc = useTRPC()
  const { data, error, isLoading } = useQuery(
    trpc.health.check.queryOptions()
  )

  if (process.env.NODE_ENV !== "development") return null

  return (
    <div className="fixed bottom-12 right-4 z-50 rounded border bg-background p-3 text-xs shadow-lg">
      <div className="font-semibold mb-1">tRPC Health</div>
      {isLoading && <div>Checking...</div>}
      {error && <div className="text-destructive">Error: {error.message}</div>}
      {data && (
        <div className="space-y-0.5">
          <div>Status: {data.status}</div>
          <div>DB: {data.database}</div>
          <div>Time: {new Date(data.timestamp).toLocaleTimeString()}</div>
        </div>
      )}
    </div>
  )
}
