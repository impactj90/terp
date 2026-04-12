import { useTRPC } from "@/trpc"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export function useExportTemplateSnapshots(templateId?: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.exportTemplateSnapshots.list.queryOptions(
      templateId ? { templateId } : undefined,
      { enabled },
    ),
  )
}

export function useRecordExportTemplateSnapshot() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.exportTemplateSnapshots.record.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: trpc.exportTemplateSnapshots.list.queryKey(),
      })
    },
  })
}

export function useVerifyExportTemplateSnapshot() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.exportTemplateSnapshots.verify.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: trpc.exportTemplateSnapshots.list.queryKey(),
      })
    },
  })
}

export function useDeleteExportTemplateSnapshot() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.exportTemplateSnapshots.delete.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: trpc.exportTemplateSnapshots.list.queryKey(),
      })
    },
  })
}
