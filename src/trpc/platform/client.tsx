"use client"

/**
 * Platform tRPC client — Phase 4 stub.
 *
 * Minimal pass-through provider so `src/app/platform/layout.tsx` can mount
 * a shell around the platform route tree before Phase 5 wires up the real
 * tRPC React client, query client, and transport.
 *
 * Phase 5 will replace this with the real `createTRPCReact` client that
 * points at `/api/trpc-platform` and carries `credentials: "include"` so
 * the `platform-session` cookie is sent.
 */
import type { ReactNode } from "react"

export function PlatformTRPCProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}
