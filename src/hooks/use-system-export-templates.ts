import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useSystemExportTemplates(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.systemExportTemplates.list.queryOptions(undefined, { enabled }),
  )
}

export function useSystemExportTemplate(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.systemExportTemplates.getById.queryOptions(
      { id },
      { enabled: enabled && !!id },
    ),
  )
}

export function useCopySystemExportTemplate() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.systemExportTemplates.copyToTenant.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.exportTemplates.list.queryKey(),
      })
    },
  })
}
