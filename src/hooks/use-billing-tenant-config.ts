import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Billing Tenant Config Hooks ====================

export function useBillingTenantConfig() {
  const trpc = useTRPC()
  return useQuery(trpc.billing.tenantConfig.get.queryOptions())
}

export function useUpsertBillingTenantConfig() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.tenantConfig.upsert.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.tenantConfig.get.queryKey(),
      })
    },
  })
}
