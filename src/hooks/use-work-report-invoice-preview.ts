/**
 * React Query hook wrapping `workReports.previewInvoiceGeneration`.
 *
 * Returns the proposed invoice positions, existing-invoice metadata
 * (for the "Zur Rechnung" affordance), and non-blocking warnings.
 *
 * Plan: 2026-04-27-rechnungs-uebernahme-arbeitsschein-r1.md (Phase E)
 */
import { useTRPC } from "@/trpc"
import { useQuery } from "@tanstack/react-query"

export function useWorkReportInvoicePreview(
  workReportId: string,
  enabled = true,
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.workReports.previewInvoiceGeneration.queryOptions(
      { workReportId },
      { enabled: enabled && !!workReportId },
    ),
  )
}
