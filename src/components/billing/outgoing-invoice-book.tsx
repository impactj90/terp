"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  formatInputDate,
  formatDisplayDate,
  parseInputDate,
} from "@/lib/date"
import {
  useOutgoingInvoiceBookList,
  useExportOutgoingInvoiceBookPdf,
  useExportOutgoingInvoiceBookCsv,
} from "@/hooks"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value)
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)} %`
}

function formatServicePeriod(
  from: Date | string | null,
  to: Date | string | null
): string {
  if (!from && !to) return "—"
  const f = from ? formatDisplayDate(from) : "—"
  const t = to ? formatDisplayDate(to) : "—"
  return `${f} – ${t}`
}

function lastCompletedMonth(): { from: Date; to: Date } {
  const now = new Date()
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonth = new Date(firstOfThisMonth.getTime() - 1)
  const from = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1)
  const to = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0)
  return { from, to }
}

function currentMonth(): { from: Date; to: Date } {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from, to }
}

function currentYear(): { from: Date; to: Date } {
  const now = new Date()
  const from = new Date(now.getFullYear(), 0, 1)
  const to = new Date(now.getFullYear(), 11, 31)
  return { from, to }
}

export function OutgoingInvoiceBook() {
  const t = useTranslations("billingOutgoingInvoiceBook")
  const initial = React.useMemo(lastCompletedMonth, [])
  const [dateFrom, setDateFrom] = React.useState<Date>(initial.from)
  const [dateTo, setDateTo] = React.useState<Date>(initial.to)

  const { data, isLoading } = useOutgoingInvoiceBookList(dateFrom, dateTo)
  const exportPdf = useExportOutgoingInvoiceBookPdf()
  const exportCsv = useExportOutgoingInvoiceBookCsv()

  const rangeInvalid = dateFrom > dateTo

  const applyRange = (range: { from: Date; to: Date }) => {
    setDateFrom(range.from)
    setDateTo(range.to)
  }

  const handleExportPdf = async () => {
    try {
      const result = await exportPdf.mutateAsync({ dateFrom, dateTo })
      if (result?.signedUrl) {
        window.open(result.signedUrl, "_blank")
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      toast.error(`PDF export failed: ${msg}`)
    }
  }

  const handleExportCsv = async (encoding: "utf8" | "win1252") => {
    try {
      const result = await exportCsv.mutateAsync({
        dateFrom,
        dateTo,
        encoding,
      })
      if (!result) return
      const bytes = Uint8Array.from(atob(result.csv), (c) => c.charCodeAt(0))
      const mime =
        encoding === "win1252"
          ? "text/csv;charset=windows-1252"
          : "text/csv;charset=utf-8"
      const blob = new Blob([bytes], { type: mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = result.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      toast.error(`CSV export failed: ${msg}`)
    }
  }

  const entries = data?.entries ?? []
  const summary = data?.summary

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg sm:text-2xl font-bold">{t("title")}</h2>
      </div>

      {/* Filter Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1 sm:w-48">
              <label className="text-xs text-muted-foreground" htmlFor="oib-from">
                {t("dateFrom")}
              </label>
              <Input
                id="oib-from"
                type="date"
                value={formatInputDate(dateFrom)}
                onChange={(e) => {
                  const d = parseInputDate(e.target.value)
                  if (d) setDateFrom(d)
                }}
              />
            </div>
            <div className="flex flex-col gap-1 sm:w-48">
              <label className="text-xs text-muted-foreground" htmlFor="oib-to">
                {t("dateTo")}
              </label>
              <Input
                id="oib-to"
                type="date"
                value={formatInputDate(dateTo)}
                onChange={(e) => {
                  const d = parseInputDate(e.target.value)
                  if (d) setDateTo(d)
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyRange(lastCompletedMonth())}
              >
                {t("quickLastMonth")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyRange(currentMonth())}
              >
                {t("quickCurrentMonth")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyRange(currentYear())}
              >
                {t("quickCurrentYear")}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button
                type="button"
                size="sm"
                disabled={
                  exportPdf.isPending ||
                  rangeInvalid ||
                  entries.length === 0
                }
                onClick={handleExportPdf}
              >
                {t("exportPdf")}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      exportCsv.isPending ||
                      rangeInvalid ||
                      entries.length === 0
                    }
                  >
                    {t("exportCsv")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExportCsv("utf8")}>
                    {t("csvEncodingUtf8")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleExportCsv("win1252")}
                  >
                    {t("csvEncodingWin1252")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4">{t("loading")}</p>
      ) : rangeInvalid ? (
        <p className="text-sm text-destructive py-4">
          {t("dateFrom")} &gt; {t("dateTo")}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          {t("noEntriesFound")}
        </p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columnDate")}</TableHead>
                    <TableHead>{t("columnNumber")}</TableHead>
                    <TableHead>{t("columnType")}</TableHead>
                    <TableHead>{t("columnCustomer")}</TableHead>
                    <TableHead>{t("columnServicePeriod")}</TableHead>
                    <TableHead className="text-right">
                      {t("columnNet")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("columnVatRate")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("columnVat")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("columnGross")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.flatMap((entry) =>
                    entry.vatBreakdown.length === 0
                      ? [
                          <TableRow key={entry.id}>
                            <TableCell>
                              {formatDisplayDate(entry.documentDate)}
                            </TableCell>
                            <TableCell className="font-medium">
                              {entry.number}
                            </TableCell>
                            <TableCell>
                              {entry.type === "INVOICE"
                                ? t("typeInvoice")
                                : t("typeCreditNote")}
                            </TableCell>
                            <TableCell>{entry.customerName}</TableCell>
                            <TableCell>
                              {formatServicePeriod(
                                entry.servicePeriodFrom,
                                entry.servicePeriodTo
                              )}
                            </TableCell>
                            <TableCell className="text-right">—</TableCell>
                            <TableCell className="text-right">—</TableCell>
                            <TableCell className="text-right">—</TableCell>
                            <TableCell className="text-right">—</TableCell>
                          </TableRow>,
                        ]
                      : entry.vatBreakdown.map((b, idx) => (
                          <TableRow key={`${entry.id}:${b.vatRate}`}>
                            {idx === 0 && (
                              <>
                                <TableCell rowSpan={entry.vatBreakdown.length}>
                                  {formatDisplayDate(entry.documentDate)}
                                </TableCell>
                                <TableCell
                                  rowSpan={entry.vatBreakdown.length}
                                  className="font-medium"
                                >
                                  {entry.number}
                                </TableCell>
                                <TableCell rowSpan={entry.vatBreakdown.length}>
                                  {entry.type === "INVOICE"
                                    ? t("typeInvoice")
                                    : t("typeCreditNote")}
                                </TableCell>
                                <TableCell rowSpan={entry.vatBreakdown.length}>
                                  {entry.customerName}
                                </TableCell>
                                <TableCell rowSpan={entry.vatBreakdown.length}>
                                  {formatServicePeriod(
                                    entry.servicePeriodFrom,
                                    entry.servicePeriodTo
                                  )}
                                </TableCell>
                              </>
                            )}
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(b.net)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatPercent(b.vatRate)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(b.vat)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(b.gross)}
                            </TableCell>
                          </TableRow>
                        ))
                  )}
                </TableBody>
                {summary && (
                  <TableFooter>
                    {summary.perRate.map((row) => (
                      <TableRow key={`sum-${row.vatRate}`}>
                        <TableCell
                          colSpan={5}
                          className="text-right font-medium"
                        >
                          {t("summaryPerVatRate", {
                            rate: new Intl.NumberFormat("de-DE", {
                              maximumFractionDigits: 2,
                            }).format(row.vatRate),
                          })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(row.net)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPercent(row.vatRate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(row.vat)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(row.gross)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-right font-bold"
                      >
                        {t("grandTotal")}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {formatCurrency(summary.totalNet)}
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right font-bold tabular-nums">
                        {formatCurrency(summary.totalVat)}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {formatCurrency(summary.totalGross)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {entries.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("entriesCount", { count: entries.length })}
        </p>
      )}
    </div>
  )
}
