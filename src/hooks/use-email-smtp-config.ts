import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useEmailSmtpConfig() {
  const trpc = useTRPC()
  return useQuery(trpc.email.smtpConfig.get.queryOptions())
}

export function useSmtpConfigStatus() {
  const trpc = useTRPC()
  const { data, isLoading } = useQuery(
    trpc.email.smtpConfig.status.queryOptions(),
  )
  return {
    isConfigured: data?.isConfigured ?? null,
    isLoading,
  }
}

export function useUpsertEmailSmtpConfig() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.email.smtpConfig.upsert.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.email.smtpConfig.get.queryKey(),
      })
    },
  })
}

export function useTestEmailSmtpConnection() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.email.smtpConfig.testConnection.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.email.smtpConfig.get.queryKey(),
      })
    },
  })
}
