/**
 * WorkReports React Query hooks.
 *
 * Mirrors the `use-service-objects.ts` / `use-orders.ts` patterns:
 *   - Queries via `trpc.X.queryOptions`
 *   - Mutations via `trpc.X.mutationOptions` with explicit cross-resource
 *     cache invalidation in `onSuccess`.
 *
 * Key invalidation rules:
 *   - create/update/delete invalidate `list`, `listByOrder`,
 *     `listByServiceObject`, and (for update/delete) `getById`.
 *   - sign/void invalidate `list`, `getById`, `listByOrder`,
 *     `listByServiceObject` because the status badge appears in list views.
 *   - assignments.* invalidate `assignments.list` AND `getById`
 *     (getById include contains assignments).
 *   - attachments.* invalidate `attachments.list` AND `getById`
 *     (getById include contains attachments).
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 8)
 */
import { useTRPC } from "@/trpc"
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

// --- Queries ---

export function useWorkReports(
  params: {
    status?: "DRAFT" | "SIGNED" | "VOID"
    orderId?: string
    serviceObjectId?: string
    limit?: number
    offset?: number
  } = {},
  enabled = true,
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.workReports.list.queryOptions(params, { enabled }),
  )
}

export function useWorkReport(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.workReports.getById.queryOptions(
      { id },
      { enabled: enabled && !!id },
    ),
  )
}

export function useWorkReportsByOrder(orderId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.workReports.listByOrder.queryOptions(
      { orderId },
      { enabled: enabled && !!orderId },
    ),
  )
}

export function useWorkReportsByServiceObject(
  serviceObjectId: string,
  params: { limit?: number } = {},
  enabled = true,
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.workReports.listByServiceObject.queryOptions(
      { serviceObjectId, limit: params.limit ?? 20 },
      { enabled: enabled && !!serviceObjectId },
    ),
  )
}

export function useWorkReportAssignments(
  workReportId: string,
  enabled = true,
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.workReports.assignments.list.queryOptions(
      { workReportId },
      { enabled: enabled && !!workReportId },
    ),
  )
}

export function useWorkReportAttachments(
  workReportId: string,
  enabled = true,
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.workReports.attachments.list.queryOptions(
      { workReportId },
      { enabled: enabled && !!workReportId },
    ),
  )
}

// --- Mutations ---

/**
 * Helper: invalidates all list-shaped WorkReport queries (list, listByOrder,
 * listByServiceObject). Used by most mutations because a create/update/sign/
 * void can affect any of them depending on which filter the user has active.
 *
 * `refetchType: "all"` forces a refetch even for queries without an active
 * observer. Mutations like sign/void are typically triggered from the detail
 * page, so the list queries are inactive at that moment. Default
 * `refetchType: "active"` would only mark them stale — and if Next.js App
 * Router returns a cached route segment on back-navigation (no re-mount),
 * `refetchOnMount` never fires and the user sees stale status badges until
 * a hard reload. Forcing `"all"` refetches in the background so that by the
 * time the user is back on the list, fresh data is already there.
 */
function invalidateAllWorkReportLists(
  qc: ReturnType<typeof useQueryClient>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trpc: any,
) {
  qc.invalidateQueries({
    queryKey: trpc.workReports.list.queryKey(),
    refetchType: "all",
  })
  qc.invalidateQueries({
    queryKey: trpc.workReports.listByOrder.queryKey(),
    refetchType: "all",
  })
  qc.invalidateQueries({
    queryKey: trpc.workReports.listByServiceObject.queryKey(),
    refetchType: "all",
  })
}

export function useCreateWorkReport() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.workReports.create.mutationOptions(),
    onSuccess: () => {
      invalidateAllWorkReportLists(qc, trpc)
    },
  })
}

export function useUpdateWorkReport() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.workReports.update.mutationOptions(),
    onSuccess: () => {
      invalidateAllWorkReportLists(qc, trpc)
      qc.invalidateQueries({ queryKey: trpc.workReports.getById.queryKey() })
    },
  })
}

export function useDeleteWorkReport() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.workReports.delete.mutationOptions(),
    onSuccess: () => {
      invalidateAllWorkReportLists(qc, trpc)
      qc.invalidateQueries({ queryKey: trpc.workReports.getById.queryKey() })
    },
  })
}

export function useSignWorkReport() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.workReports.sign.mutationOptions(),
    onSuccess: () => {
      invalidateAllWorkReportLists(qc, trpc)
      qc.invalidateQueries({ queryKey: trpc.workReports.getById.queryKey() })
    },
  })
}

export function useVoidWorkReport() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.workReports.void.mutationOptions(),
    onSuccess: () => {
      invalidateAllWorkReportLists(qc, trpc)
      qc.invalidateQueries({ queryKey: trpc.workReports.getById.queryKey() })
    },
  })
}

export function useDownloadWorkReportPdf() {
  const trpc = useTRPC()
  // No invalidation — the response is a short-lived signed URL, no state change.
  return useMutation(trpc.workReports.downloadPdf.mutationOptions())
}

// --- Assignment Mutations ---

export function useAddWorkReportAssignment() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.workReports.assignments.add.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: trpc.workReports.assignments.list.queryKey(),
      })
      qc.invalidateQueries({ queryKey: trpc.workReports.getById.queryKey() })
    },
  })
}

export function useRemoveWorkReportAssignment() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.workReports.assignments.remove.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: trpc.workReports.assignments.list.queryKey(),
      })
      qc.invalidateQueries({ queryKey: trpc.workReports.getById.queryKey() })
    },
  })
}

// --- Attachment Mutations ---

export function useGetWorkReportAttachmentUploadUrl() {
  const trpc = useTRPC()
  return useMutation(trpc.workReports.attachments.getUploadUrl.mutationOptions())
}

export function useConfirmWorkReportAttachmentUpload() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.workReports.attachments.confirmUpload.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: trpc.workReports.attachments.list.queryKey(),
      })
      qc.invalidateQueries({ queryKey: trpc.workReports.getById.queryKey() })
    },
  })
}

export function useGetWorkReportAttachmentDownloadUrl() {
  const trpc = useTRPC()
  return useMutation(
    trpc.workReports.attachments.getDownloadUrl.mutationOptions(),
  )
}

export function useRemoveWorkReportAttachment() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.workReports.attachments.remove.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: trpc.workReports.attachments.list.queryKey(),
      })
      qc.invalidateQueries({ queryKey: trpc.workReports.getById.queryKey() })
    },
  })
}
