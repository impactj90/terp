/**
 * Demo self-service hooks — used from the /demo-expired page.
 *
 * Admin-side demo-tenant lifecycle hooks moved to the platform-admin world
 * (see `/platform/tenants/demo`). Do not add admin operations to this file.
 */
"use client"

import { useMutation } from "@tanstack/react-query"
import { useTRPC } from "@/trpc"

export function useRequestConvertFromExpired() {
  const trpc = useTRPC()
  return useMutation(
    trpc.demoSelfService.requestConvertFromExpired.mutationOptions(),
  )
}
