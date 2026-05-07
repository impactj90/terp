/**
 * NK Dashboard Card (NK-1, Phase 9)
 *
 * Top-N orders by margin / hourly margin for the last 7 days.
 */
"use client"

import * as React from "react"
import { Link } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { NkAmpelBadge } from "./nk-ampel-badge"
import { useNkRecentOrdersDashboard } from "@/hooks/use-nk-reports"

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—"
  return `${n.toFixed(1)} %`
}
function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—"
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
function classifyMargin(p: number | null | undefined): "red" | "amber" | "green" {
  if (p == null) return "amber"
  if (p < 0) return "red"
  if (p < 5) return "amber"
  return "green"
}

export function NkDashboardCard({
  days = 7,
  limit = 5,
}: {
  days?: number
  limit?: number
}) {
  const t = useTranslations("nachkalkulation.dashboard")
  const query = useNkRecentOrdersDashboard({
    days,
    limit,
    sortBy: "hourly_margin_desc",
  })

  if (query.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32" />
        </CardContent>
      </Card>
    )
  }

  if (query.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("loadError")}</p>
        </CardContent>
      </Card>
    )
  }

  const rows = query.data?.data ?? []
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("subtitle", { days })}</p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {rows.map(
            (row: {
              orderId: string
              code: string
              name: string
              customer?: string | null
              hourlyMargin: number | null
              db2Percent: number | null
            }) => (
              <li
                key={row.orderId}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <Link
                  href={`/admin/orders/${row.orderId}`}
                  className="flex-1 truncate hover:underline"
                >
                  <span className="font-medium">{row.code}</span>
                  <span className="text-muted-foreground"> — {row.name}</span>
                  {row.customer && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {row.customer}
                    </span>
                  )}
                </Link>
                <span className="font-mono">{fmtMoney(row.hourlyMargin)} €/h</span>
                <NkAmpelBadge
                  status={classifyMargin(row.db2Percent)}
                  label={fmtPct(row.db2Percent)}
                />
              </li>
            ),
          )}
        </ul>
        <div className="mt-4 text-right">
          <Link
            href="/admin/nachkalkulation/reports"
            className="text-xs text-muted-foreground hover:underline"
          >
            {t("viewAll")} →
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
