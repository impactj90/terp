import { useTRPC } from "@/trpc"
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"

// --- Queries ---

export function useServiceObjects(
  params: {
    customerAddressId?: string
    parentId?: string | null
    kind?: "SITE" | "BUILDING" | "SYSTEM" | "EQUIPMENT" | "COMPONENT"
    status?:
      | "OPERATIONAL"
      | "DEGRADED"
      | "IN_MAINTENANCE"
      | "OUT_OF_SERVICE"
      | "DECOMMISSIONED"
    search?: string
    isActive?: boolean
    page?: number
    pageSize?: number
  } = {}
) {
  const trpc = useTRPC()
  return useQuery(trpc.serviceObjects.list.queryOptions(params))
}

export function useServiceObject(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.serviceObjects.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useServiceObjectTree(customerAddressId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.serviceObjects.getTree.queryOptions(
      { customerAddressId },
      { enabled: enabled && !!customerAddressId }
    )
  )
}

export function useServiceObjectAttachments(
  serviceObjectId: string,
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.serviceObjects.getAttachments.queryOptions(
      { serviceObjectId },
      { enabled: enabled && !!serviceObjectId }
    )
  )
}

export function useGenerateSingleQr(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.serviceObjects.generateSingleQr.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// --- Mutations ---

export function useCreateServiceObject() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.serviceObjects.create.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trpc.serviceObjects.list.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.serviceObjects.getTree.queryKey() })
    },
  })
}

export function useUpdateServiceObject() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.serviceObjects.update.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trpc.serviceObjects.list.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.serviceObjects.getById.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.serviceObjects.getTree.queryKey() })
    },
  })
}

export function useMoveServiceObject() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.serviceObjects.move.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trpc.serviceObjects.list.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.serviceObjects.getTree.queryKey() })
    },
  })
}

export function useDeleteServiceObject() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.serviceObjects.delete.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trpc.serviceObjects.list.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.serviceObjects.getTree.queryKey() })
    },
  })
}

export function useGetAttachmentUploadUrl() {
  const trpc = useTRPC()
  return useMutation(trpc.serviceObjects.getUploadUrl.mutationOptions())
}

export function useConfirmAttachmentUpload() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.serviceObjects.confirmUpload.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: trpc.serviceObjects.getAttachments.queryKey(),
      })
    },
  })
}

export function useGetAttachmentDownloadUrl() {
  const trpc = useTRPC()
  return useMutation(trpc.serviceObjects.getDownloadUrl.mutationOptions())
}

export function useDeleteAttachment() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.serviceObjects.deleteAttachment.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: trpc.serviceObjects.getAttachments.queryKey(),
      })
    },
  })
}

export function useGenerateQrPdf() {
  const trpc = useTRPC()
  return useMutation(trpc.serviceObjects.generateQrPdf.mutationOptions())
}

export function useImportPreview() {
  const trpc = useTRPC()
  return useMutation(trpc.serviceObjects.importPreview.mutationOptions())
}

export function useImportCommit() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.serviceObjects.importCommit.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trpc.serviceObjects.list.queryKey() })
    },
  })
}
