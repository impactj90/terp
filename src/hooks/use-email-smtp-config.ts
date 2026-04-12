import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useEmailSmtpConfig() {
  const trpc = useTRPC()
  return useQuery(trpc.email.smtpConfig.get.queryOptions())
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
