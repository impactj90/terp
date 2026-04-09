"use client"

import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

/**
 * Hook to fetch the list of active demo tenants with days-remaining metadata.
 * Gated server-side by tenants.manage permission.
 */
export function useDemoTenants(opts?: { enabled?: boolean }) {
  const trpc = useTRPC()
  return useQuery(
    trpc.demoTenants.list.queryOptions(undefined, { enabled: opts?.enabled ?? true }),
  )
}

/**
 * Hook to fetch available demo templates (key + label + description).
 * Used by the create-demo sheet dropdown.
 */
export function useDemoTemplates(opts?: { enabled?: boolean }) {
  const trpc = useTRPC()
  return useQuery(
    trpc.demoTenants.templates.queryOptions(undefined, { enabled: opts?.enabled ?? true }),
  )
}

export function useCreateDemoTenant() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.demoTenants.create.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trpc.demoTenants.list.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.tenants.list.queryKey() })
    },
  })
}

export function useExtendDemoTenant() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.demoTenants.extend.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trpc.demoTenants.list.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.tenants.list.queryKey() })
    },
  })
}

export function useConvertDemoTenant() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.demoTenants.convert.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trpc.demoTenants.list.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.tenants.list.queryKey() })
    },
  })
}

export function useExpireDemoTenantNow() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.demoTenants.expireNow.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trpc.demoTenants.list.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.tenants.list.queryKey() })
    },
  })
}

export function useDeleteDemoTenant() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.demoTenants.delete.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trpc.demoTenants.list.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.tenants.list.queryKey() })
    },
  })
}

/**
 * Self-service conversion request used on /demo-expired.
 * NOT gated by tenants.manage — service enforces that caller has a
 * user_tenants row for the target tenant and that tenant is an expired demo.
 */
export function useRequestConvertFromExpired() {
  const trpc = useTRPC()
  return useMutation({
    ...trpc.demoTenants.requestConvertFromExpired.mutationOptions(),
  })
}
