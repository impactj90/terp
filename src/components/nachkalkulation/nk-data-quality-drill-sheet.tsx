/**
 * NK Data Quality Drill-Down Sheet (NK-1, Phase 8)
 *
 * Renders a single DataQualityIssue with its affectedIds and provides
 * navigation links into the underlying entity.
 */
"use client"

import * as React from "react"
import { Link } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export interface DataQualityIssueLike {
  code: string
  severity: "info" | "warning" | "error"
  count: number
  affectedIds: string[]
}

interface NkDataQualityDrillSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  issue: DataQualityIssueLike | null
  /** Order ID for the drill context. Used to build navigation URLs for
   * entities (like OrderBookings) that don't have a standalone detail page. */
  orderId?: string
  /** Optional id -> human-readable label map. UUIDs without a matching label
   * are still rendered (truncated) so we don't drop entries silently. */
  labels?: Record<string, string>
}

// next-intl exports a typed `t` function; we call it with `as never` for
// dynamic per-issue keys to avoid huge generic recursion in the type system.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function translateLabel(t: any, code: string): string | null {
  try {
    const v = t(`${code}.label` as never)
    return typeof v === "string" && v ? v : null
  } catch {
    return null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function translateDescription(t: any, code: string): string | null {
  try {
    const v = t(`${code}.description` as never)
    return typeof v === "string" && v ? v : null
  } catch {
    return null
  }
}

function classifyEntityFromCode(
  code: string,
): "booking" | "workreport" | "movement" | "invoiceLi" | "employee" | "unknown" {
  if (code.startsWith("BOOKING") || code === "PER_UNIT_WITHOUT_QUANTITY") {
    return "booking"
  }
  if (code.startsWith("WORKREPORT") || code === "TRAVEL_NULL_SNAPSHOT") {
    return "workreport"
  }
  if (code.startsWith("MOVEMENT")) {
    return "movement"
  }
  if (code.startsWith("INVOICE_LI")) {
    return "invoiceLi"
  }
  if (code.startsWith("EMPLOYEE")) {
    return "employee"
  }
  return "unknown"
}

function buildHref(
  entity: ReturnType<typeof classifyEntityFromCode>,
  id: string,
  orderId?: string,
): string | null {
  switch (entity) {
    case "workreport":
      return `/admin/work-reports/${id}`
    case "movement":
      return `/admin/warehouse/stock-movements/${id}`
    case "invoiceLi":
      return `/admin/invoices/inbound`
    case "employee":
      return `/admin/employees/${id}`
    case "booking":
      // Bookings live under their order — we navigate back to the
      // order's bookings tab. The booking-id is not deep-linkable yet.
      return orderId ? `/admin/orders/${orderId}?tab=bookings` : null
    default:
      return null
  }
}

export function NkDataQualityDrillSheet({
  open,
  onOpenChange,
  issue,
  orderId,
  labels,
}: NkDataQualityDrillSheetProps) {
  const t = useTranslations("nachkalkulation.dataQualityIssues")
  const tCommon = useTranslations("common")

  if (!issue) return null

  const entity = classifyEntityFromCode(issue.code)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t("drillTitle")}</SheetTitle>
          <SheetDescription>{t("drillSubtitle")}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    issue.severity === "error"
                      ? "destructive"
                      : issue.severity === "warning"
                      ? "outline"
                      : "secondary"
                  }
                >
                  {issue.severity === "error"
                    ? t("severityError")
                    : issue.severity === "warning"
                    ? t("severityWarning")
                    : t("severityInfo")}
                </Badge>
                <span className="font-mono text-xs">{issue.code}</span>
              </div>
              <p className="text-sm font-medium">
                {translateLabel(t, issue.code) ?? issue.code}
              </p>
              <p className="text-xs text-muted-foreground">
                {translateDescription(t, issue.code) ?? ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("drillCount", { count: issue.count })}
              </p>
            </div>

            <div className="space-y-2">
              {issue.affectedIds.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                issue.affectedIds.map((id) => {
                  const href = buildHref(entity, id, orderId)
                  const label = labels?.[id]
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        {label ? (
                          <>
                            <p className="text-sm truncate">{label}</p>
                            <p className="text-xs text-muted-foreground font-mono truncate">
                              {id.slice(0, 8)}…
                            </p>
                          </>
                        ) : (
                          <p className="text-xs font-mono truncate">{id}</p>
                        )}
                      </div>
                      {href ? (
                        <Button asChild variant="ghost" size="sm" className="shrink-0">
                          <Link href={href} aria-label="open">
                            ↗
                          </Link>
                        </Button>
                      ) : (
                        <span className="shrink-0 text-muted-foreground" aria-hidden>
                          —
                        </span>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            {tCommon("close")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
