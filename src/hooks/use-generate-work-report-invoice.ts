/**
 * React Query hook wrapping `workReports.generateInvoice` mutation.
 *
 * On success invalidates:
 *   - `workReports.getById` (status indicator changes)
 *   - `workReports.previewInvoiceGeneration` (existingInvoice now populated)
 *   - `billing.documents.list` (new invoice appears in the list)
 *
 * Plan: 2026-04-27-rechnungs-uebernahme-arbeitsschein-r1.md (Phase E)
 */
import { useTRPC } from "@/trpc"
import { useMutation, useQueryClient } from "@tanstack/react-query"

export function useGenerateWorkReportInvoice() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.workReports.generateInvoice.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trpc.workReports.getById.queryKey() })
      qc.invalidateQueries({
        queryKey: trpc.workReports.previewInvoiceGeneration.queryKey(),
      })
      qc.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
    },
  })
}
