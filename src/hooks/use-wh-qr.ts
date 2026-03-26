import { useTRPC } from "@/trpc"
import { useMutation, useQuery } from "@tanstack/react-query"

// ==================== Mutation Hooks ====================

/** Resolve QR code (mutation, called imperatively on scan) */
export function useResolveQrCode() {
  const trpc = useTRPC()
  return useMutation({
    ...trpc.warehouse.qr.resolveCode.mutationOptions(),
  })
}

/** Resolve by article number (manual input fallback) */
export function useResolveByNumber() {
  const trpc = useTRPC()
  return useMutation({
    ...trpc.warehouse.qr.resolveByNumber.mutationOptions(),
  })
}

/** Generate label PDF for selected articles */
export function useGenerateLabelPdf() {
  const trpc = useTRPC()
  return useMutation({
    ...trpc.warehouse.qr.generateLabelPdf.mutationOptions(),
  })
}

/** Generate label PDF for all articles (optional group filter) */
export function useGenerateAllLabelsPdf() {
  const trpc = useTRPC()
  return useMutation({
    ...trpc.warehouse.qr.generateAllLabelsPdf.mutationOptions(),
  })
}

// ==================== Query Hooks ====================

/** Get single QR code data URL */
export function useGenerateSingleQr(articleId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.qr.generateSingleQr.queryOptions(
      { articleId },
      { enabled: enabled && !!articleId }
    )
  )
}

/** Recent movements for an article (Storno flow) */
export function useQrRecentMovements(articleId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.qr.recentMovements.queryOptions(
      { articleId },
      { enabled: enabled && !!articleId }
    )
  )
}

/** Pending PO positions for an article (Wareneingang flow) */
export function useQrPendingPositions(articleId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.qr.pendingPositionsForArticle.queryOptions(
      { articleId },
      { enabled: enabled && !!articleId }
    )
  )
}
