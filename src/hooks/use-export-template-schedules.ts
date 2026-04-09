import { useTRPC } from "@/trpc"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export function useExportTemplateSchedules(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.exportTemplateSchedules.list.queryOptions(undefined, { enabled }),
  )
}

export function useExportTemplateSchedule(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.exportTemplateSchedules.getById.queryOptions(
      { id },
      { enabled: enabled && !!id },
    ),
  )
}

export function useCreateExportTemplateSchedule() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.exportTemplateSchedules.create.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: trpc.exportTemplateSchedules.list.queryKey(),
      })
    },
  })
}

export function useUpdateExportTemplateSchedule() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.exportTemplateSchedules.update.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: trpc.exportTemplateSchedules.list.queryKey(),
      })
    },
  })
}

export function useDeleteExportTemplateSchedule() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.exportTemplateSchedules.delete.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: trpc.exportTemplateSchedules.list.queryKey(),
      })
    },
  })
}
