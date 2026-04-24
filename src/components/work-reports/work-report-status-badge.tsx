/**
 * WorkReportStatusBadge — compact status indicator for WorkReports.
 *
 * Status-mapping:
 *   DRAFT  → gray   ("Entwurf")
 *   SIGNED → green  ("Signiert") — legally binding, immutable
 *   VOID   → red    ("Storniert")
 *
 * Colors are chosen to mirror the platform convention established by
 * `OrderStatusBadge` (gray/green/blue/red) and the handbook’s own §12c
 * status description — not the tenant-configurable category badges from
 * `BillingDocumentStatusBadge`.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 8)
 */
"use client"

import { Badge } from "@/components/ui/badge"

export type WorkReportStatus = "DRAFT" | "SIGNED" | "VOID"

interface WorkReportStatusBadgeProps {
  status: WorkReportStatus | string | null | undefined
}

const LABELS: Record<WorkReportStatus, string> = {
  DRAFT: "Entwurf",
  SIGNED: "Signiert",
  VOID: "Storniert",
}

const VARIANTS: Record<WorkReportStatus, "gray" | "green" | "red"> = {
  DRAFT: "gray",
  SIGNED: "green",
  VOID: "red",
}

export function WorkReportStatusBadge({ status }: WorkReportStatusBadgeProps) {
  if (!status || !(status in LABELS)) {
    return <Badge variant="secondary">–</Badge>
  }
  const s = status as WorkReportStatus
  return <Badge variant={VARIANTS[s]}>{LABELS[s]}</Badge>
}
