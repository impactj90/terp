/**
 * NK Soll/Ist Section (NK-1, Phase 8)
 *
 * Read-only display of the NK Soll/Ist report for a single order.
 * Renders Soll vs Ist tables, DB-Stufen, Productivity, Position
 * tables (laborHours / flatItems / unitItems) and DataQuality
 * issue counts (with drill-down).
 */
"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { AlertCircle, Info } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { NkAmpelBadge } from "./nk-ampel-badge"
import { useNkSollIstReport } from "@/hooks/use-nk-reports"
import {
  NkDataQualityDrillSheet,
  type DataQualityIssueLike,
} from "./nk-data-quality-drill-sheet"
import { NkEstimatedDrillSheet } from "./nk-estimated-drill-sheet"
import { useEmployees } from "@/hooks"
import { useOrderBookings } from "@/hooks"
import { useWorkReportsByOrder } from "@/hooks/use-work-reports"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function translateIssueLabel(t: any, code: string): string | null {
  try {
    const v = t(`${code}.label` as never)
    return typeof v === "string" && v ? v : null
  } catch {
    return null
  }
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—"
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—"
  return `${n.toFixed(1)} %`
}

function classifyMargin(p: number | null | undefined): "red" | "amber" | "green" {
  if (p == null) return "amber"
  if (p < 0) return "red"
  if (p < 5) return "amber"
  return "green"
}

export function NkSollIstSection({ orderId }: { orderId: string }) {
  const t = useTranslations("nachkalkulation.report")
  const tDb = useTranslations("nachkalkulation.dbStufen")
  const tEst = useTranslations("nachkalkulation.estimated")
  const tDq = useTranslations("nachkalkulation.dataQualityIssues")

  const reportQuery = useNkSollIstReport(orderId)

  // Auxiliary lookup queries to render human-readable labels in the
  // data-quality drill sheet (instead of raw UUIDs).
  const employeesQuery = useEmployees({ pageSize: 500 })
  const bookingsQuery = useOrderBookings({ orderId })
  const workReportsQuery = useWorkReportsByOrder(orderId)

  const labelMap = React.useMemo(() => {
    const map: Record<string, string> = {}
    // Employees -> "Vorname Nachname"
    const empItems = (employeesQuery.data as { items?: Array<{ id: string; firstName?: string; lastName?: string }> } | undefined)?.items ?? []
    for (const e of empItems) {
      if (e.id) {
        map[e.id] = [e.firstName, e.lastName].filter(Boolean).join(" ").trim() || e.id
      }
    }
    // Bookings -> "Datum • Std:Min • Mitarbeiter"
    const bookingItems = (bookingsQuery.data as { items?: Array<{ id: string; booking_date?: string; bookingDate?: string; time_minutes?: number; timeMinutes?: number; employee_id?: string; employeeId?: string }> } | undefined)?.items ?? []
    for (const b of bookingItems) {
      const date = (b.booking_date ?? b.bookingDate ?? "").split("T")[0] ?? ""
      const mins = b.time_minutes ?? b.timeMinutes ?? 0
      const h = Math.floor(mins / 60)
      const m = mins % 60
      const empId = b.employee_id ?? b.employeeId ?? ""
      const empName = empId && map[empId] ? map[empId] : ""
      const time = `${h}:${String(m).padStart(2, "0")}h`
      map[b.id] = [date, time, empName].filter(Boolean).join(" • ")
    }
    // WorkReports -> "Code (Datum)"
    const wrItems = (workReportsQuery.data as { items?: Array<{ id: string; code?: string; visitDate?: string }> } | undefined)?.items ?? []
    for (const w of wrItems) {
      if (w.id) {
        map[w.id] = w.code ? `${w.code}${w.visitDate ? ` (${w.visitDate})` : ""}` : w.id
      }
    }
    return map
  }, [employeesQuery.data, bookingsQuery.data, workReportsQuery.data])

  const [issueDrill, setIssueDrill] = React.useState<DataQualityIssueLike | null>(
    null,
  )
  const [estimatedOpen, setEstimatedOpen] = React.useState(false)

  if (reportQuery.isLoading) {
    return <Skeleton className="h-72 w-full" />
  }
  if (reportQuery.isError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">
            {reportQuery.error.message}
          </p>
        </CardContent>
      </Card>
    )
  }
  const data = reportQuery.data
  if (!data) return null

  const target = data.target
  const ist = data.ist
  const cmp = data.comparison
  const mc = data.marginContribution
  const prod = data.productivity

  return (
    <div className="space-y-4">
      {data.ist.estimatedShare > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-medium">{tEst("bannerTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {tEst("bannerBody", {
                  percent: (data.ist.estimatedShare * 100).toFixed(0),
                })}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEstimatedOpen(true)}>
              {tEst("bannerCta")}
            </Button>
          </CardContent>
        </Card>
      )}

      {!target && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium">{t("noTargetTitle")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("noTargetBody")}</p>
          </CardContent>
        </Card>
      )}

      {/* Soll/Ist-Tabelle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("sectionTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columnComponent")}</TableHead>
                <TableHead className="text-right">{t("columnSoll")}</TableHead>
                <TableHead className="text-right">{t("columnIstTotal")}</TableHead>
                <TableHead className="text-right">{t("columnDelta")}</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>{t("rowHours")}</TableCell>
                <TableCell className="text-right">
                  {fmtMoney(target?.targetHours ?? null)}
                </TableCell>
                <TableCell className="text-right">
                  {fmtMoney(
                    ist.laborHours.totalHours +
                      ist.flatItems.reduce(
                        (s, f) => s + f.calculatedHourEquivalent,
                        0,
                      ),
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {fmtMoney(cmp.hoursVariance)}
                </TableCell>
                <TableCell className="text-right">
                  {fmtPct(cmp.hoursVariancePercent)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{t("rowMaterial")}</TableCell>
                <TableCell className="text-right">
                  {fmtMoney(target?.targetMaterialCost ?? null)} €
                </TableCell>
                <TableCell className="text-right">
                  {fmtMoney(ist.material.totalCost)} €
                </TableCell>
                <TableCell className="text-right">
                  {fmtMoney(cmp.materialVariance)} €
                </TableCell>
                <TableCell className="text-right">
                  {fmtPct(cmp.materialVariancePercent)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{t("rowTravel")}</TableCell>
                <TableCell className="text-right">
                  {target?.targetTravelMinutes ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  {ist.travel.totalMinutes}
                </TableCell>
                <TableCell className="text-right">
                  {fmtMoney(cmp.travelVariance)}
                </TableCell>
                <TableCell className="text-right">
                  {fmtPct(cmp.travelVariancePercent)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{t("rowExternal")}</TableCell>
                <TableCell className="text-right">
                  {fmtMoney(target?.targetExternalCost ?? null)} €
                </TableCell>
                <TableCell className="text-right">
                  {fmtMoney(ist.externalCost.totalCost)} €
                </TableCell>
                <TableCell className="text-right">
                  {fmtMoney(cmp.externalCostVariance)} €
                </TableCell>
                <TableCell className="text-right">
                  {fmtPct(cmp.externalCostVariancePercent)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{t("rowRevenue")}</TableCell>
                <TableCell className="text-right">
                  {fmtMoney(target?.targetRevenue ?? null)} €
                </TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">—</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* DB-Stufen */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tDb("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tDb("title")}</TableHead>
                <TableHead className="text-right">EUR</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead>{t("columnAmpel")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>{tDb("db1")}</TableCell>
                <TableCell className="text-right">
                  {fmtMoney(mc.db1)} €
                </TableCell>
                <TableCell className="text-right">
                  {fmtPct(mc.db1Percent)}
                </TableCell>
                <TableCell>
                  <NkAmpelBadge status={classifyMargin(mc.db1Percent)} />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{tDb("db2")}</TableCell>
                <TableCell className="text-right">
                  {fmtMoney(mc.db2)} €
                </TableCell>
                <TableCell className="text-right">
                  {fmtPct(mc.db2Percent)}
                </TableCell>
                <TableCell>
                  <NkAmpelBadge status={classifyMargin(mc.db2Percent)} />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{tDb("db3")}</TableCell>
                <TableCell className="text-right">
                  {fmtMoney(mc.db3)} €
                </TableCell>
                <TableCell className="text-right">
                  {fmtPct(mc.db3Percent)}
                </TableCell>
                <TableCell>
                  <NkAmpelBadge status={classifyMargin(mc.db3Percent)} />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Productivity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tDb("productivity")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>{tDb("hourlyMargin")}:</div>
            <div className="text-right">
              {fmtMoney(data.hourlyMargin)} €/h
            </div>
            <div>{tDb("productivity")}:</div>
            <div className="text-right">
              {fmtPct(prod.productivityPercent)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Position-Typen */}
      {ist.flatItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("rowFlatItems")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columnComponent")}</TableHead>
                  <TableHead className="text-right">Σ €</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ist.flatItems.map((f) => (
                  <TableRow key={f.activityId}>
                    <TableCell>{f.activityName}</TableCell>
                    <TableCell className="text-right">
                      {fmtMoney(f.totalAmount)} €
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {ist.unitItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("rowUnitItems")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columnComponent")}</TableHead>
                  <TableHead className="text-right">Σ €</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ist.unitItems.map((u) => (
                  <TableRow key={u.activityId}>
                    <TableCell>
                      {u.activityName} ({u.quantity} {u.unit})
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtMoney(u.totalAmount)} €
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Datenqualität */}
      {ist.dataQualityIssues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="h-4 w-4" />
              {tDq("title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-2">
              {tDq("subtitle")}
            </p>
            <ul className="space-y-2 text-sm">
              {ist.dataQualityIssues.map((issue) => (
                <li
                  key={issue.code}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2"
                >
                  <span
                    className={
                      issue.severity === "error"
                        ? "text-destructive"
                        : issue.severity === "warning"
                          ? "text-amber-600"
                          : "text-muted-foreground"
                    }
                  >
                    {issue.severity === "error"
                      ? "✗"
                      : issue.severity === "warning"
                        ? "⚠"
                        : "ⓘ"}
                  </span>
                  <span className="flex-1 text-xs">
                    {translateIssueLabel(tDq, issue.code) ?? issue.code}{" "}
                    — {issue.count}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setIssueDrill({
                        code: issue.code,
                        severity: issue.severity,
                        count: issue.count,
                        affectedIds: issue.affectedIds,
                      })
                    }
                  >
                    {tDq("drillTitle")}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <NkDataQualityDrillSheet
        open={!!issueDrill}
        onOpenChange={(open) => {
          if (!open) setIssueDrill(null)
        }}
        issue={issueDrill}
        orderId={orderId}
        labels={labelMap}
      />

      <NkEstimatedDrillSheet
        open={estimatedOpen}
        onOpenChange={setEstimatedOpen}
        estimatedShare={data.ist.estimatedShare}
        estimatedComponents={data.ist.estimatedComponents}
      />
    </div>
  )
}
