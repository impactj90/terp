/**
 * NK Dimension Drill-Down Sheet (NK-1, Phase 9)
 *
 * Renders the orders under a single DimensionAggregate.
 */
"use client"

import * as React from "react"
import { Link } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface DimensionOrderRow {
  orderId: string
  code: string
  name: string
  db2Percent: number | null
  hourlyMargin: number | null
}

interface NkDimensionDrillSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dimensionLabel: string
  orders: DimensionOrderRow[]
}

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

export function NkDimensionDrillSheet({
  open,
  onOpenChange,
  dimensionLabel,
  orders,
}: NkDimensionDrillSheetProps) {
  const t = useTranslations("nachkalkulation.dimensionDrill")

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>
            <span className="font-medium">{dimensionLabel}</span>
            <span className="ml-2 text-muted-foreground">{t("subtitle")}</span>
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="py-4">
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noOrders")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columnOrderCode")}</TableHead>
                    <TableHead>{t("columnOrderName")}</TableHead>
                    <TableHead className="text-right">
                      {t("columnDb2Percent")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("columnHourlyMargin")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((row) => (
                    <TableRow key={row.orderId}>
                      <TableCell className="font-mono text-sm">
                        <Link
                          href={`/admin/orders/${row.orderId}?tab=nachkalkulation`}
                          className="hover:underline"
                        >
                          {row.code}
                        </Link>
                      </TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtPct(row.db2Percent)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtMoney(row.hourlyMargin)} €/h
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            {t("openOrder")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
