import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useExportTemplates(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.exportTemplates.list.queryOptions(undefined, { enabled }),
  )
}

export function useExportTemplate(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.exportTemplates.getById.queryOptions(
      { id },
      { enabled: enabled && !!id },
    ),
  )
}

export function useExportTemplateVersions(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.exportTemplates.listVersions.queryOptions(
      { id },
      { enabled: enabled && !!id },
    ),
  )
}

export function useCreateExportTemplate() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.exportTemplates.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.exportTemplates.list.queryKey(),
      })
    },
  })
}

export function useUpdateExportTemplate() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.exportTemplates.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.exportTemplates.list.queryKey(),
      })
    },
  })
}

export function useDeleteExportTemplate() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.exportTemplates.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.exportTemplates.list.queryKey(),
      })
    },
  })
}

export function usePreviewExportTemplate() {
  const trpc = useTRPC()
  return useMutation(trpc.exportTemplates.preview.mutationOptions())
}

export function useTestExportTemplate() {
  const trpc = useTRPC()
  return useMutation(trpc.exportTemplates.testExport.mutationOptions())
}

export function useRestoreExportTemplateVersion(templateId: string) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.exportTemplates.restoreVersion.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.exportTemplates.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.exportTemplates.getById.queryKey({ id: templateId }),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.exportTemplates.listVersions.queryKey({
          id: templateId,
        }),
      })
    },
  })
}

export function useExportTemplateShareTargets(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.exportTemplates.listShareTargets.queryOptions(undefined, { enabled }),
  )
}

export function useCopyExportTemplateToTenant() {
  const trpc = useTRPC()
  return useMutation(trpc.exportTemplates.copyToTenant.mutationOptions())
}
