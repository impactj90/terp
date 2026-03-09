'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { usePayrollExportPreview } from '@/hooks/api'
import type { PayrollExportLine } from '@/hooks/api'

interface PayrollExportPreviewProps {
  exportId: string | undefined
  exportYear?: number
  exportMonth?: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PayrollExportPreview({
  exportId,
  exportYear,
  exportMonth,
  open,
  onOpenChange,
}: PayrollExportPreviewProps) {
  const t = useTranslations('payrollExports')
  const locale = useLocale()

  const { data: previewData, isLoading, error } = usePayrollExportPreview(
    exportId,
    open && !!exportId
  )

  const lines = previewData?.lines ?? []
  const summary = previewData?.summary

  // Collect all unique account codes from all lines
  const accountCodes = React.useMemo(() => {
    const codes = new Set<string>()
    for (const line of lines) {
      if (line.account_values) {
        Object.keys(line.account_values).forEach((code) => codes.add(code))
      }
    }
    return Array.from(codes).sort()
  }, [lines])

  const periodLabel = React.useMemo(() => {
    if (!exportYear || !exportMonth) return ''
    const formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    return formatter.format(new Date(exportYear, exportMonth - 1, 1))
  }, [exportYear, exportMonth, locale])

  const formatDecimal = (value?: number) => {
    if (value == null) return '-'
    return value.toFixed(2)
  }

  // Compute summary totals for the footer
  const totals = React.useMemo(() => {
    const result = {
      target_hours: 0,
      worked_hours: 0,
      overtime_hours: 0,
      vacation_days: 0,
      sick_days: 0,
      other_absence_days: 0,
      accounts: {} as Record<string, number>,
    }
    for (const line of lines) {
      result.target_hours += line.target_hours ?? 0
      result.worked_hours += line.worked_hours ?? 0
      result.overtime_hours += line.overtime_hours ?? 0
      result.vacation_days += line.vacation_days ?? 0
      result.sick_days += line.sick_days ?? 0
      result.other_absence_days += line.other_absence_days ?? 0
      if (line.account_values) {
        for (const [code, value] of Object.entries(line.account_values)) {
          result.accounts[code] = (result.accounts[code] ?? 0) + value
        }
      }
    }
    return result
  }, [lines])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-4xl flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('preview.title')}</SheetTitle>
          <SheetDescription>
            {t('preview.description', { period: periodLabel })}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <Alert variant="destructive" className="my-4">
              <AlertDescription>{t('preview.notReady')}</AlertDescription>
            </Alert>
          )}

          {!isLoading && !error && lines.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              {t('preview.noData')}
            </div>
          )}

          {!isLoading && lines.length > 0 && (
            <div className="overflow-x-auto py-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">{t('preview.personnelNumber')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('preview.firstName')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('preview.lastName')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('preview.department')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('preview.costCenter')}</TableHead>
                    <TableHead className="whitespace-nowrap text-right">{t('preview.targetHours')}</TableHead>
                    <TableHead className="whitespace-nowrap text-right">{t('preview.workedHours')}</TableHead>
                    <TableHead className="whitespace-nowrap text-right">{t('preview.overtimeHours')}</TableHead>
                    <TableHead className="whitespace-nowrap text-right">{t('preview.vacationDays')}</TableHead>
                    <TableHead className="whitespace-nowrap text-right">{t('preview.sickDays')}</TableHead>
                    <TableHead className="whitespace-nowrap text-right">{t('preview.otherAbsenceDays')}</TableHead>
                    {accountCodes.map((code) => (
                      <TableHead key={code} className="whitespace-nowrap text-right">
                        {code}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => (
                    <TableRow key={line.employee_id ?? index}>
                      <TableCell className="font-mono text-sm">{line.personnel_number}</TableCell>
                      <TableCell>{line.first_name ?? ''}</TableCell>
                      <TableCell>{line.last_name ?? ''}</TableCell>
                      <TableCell>{line.department_code ?? ''}</TableCell>
                      <TableCell>{line.cost_center_code ?? ''}</TableCell>
                      <TableCell className="text-right">{formatDecimal(line.target_hours)}</TableCell>
                      <TableCell className="text-right">{formatDecimal(line.worked_hours)}</TableCell>
                      <TableCell className="text-right">{formatDecimal(line.overtime_hours)}</TableCell>
                      <TableCell className="text-right">{formatDecimal(line.vacation_days)}</TableCell>
                      <TableCell className="text-right">{formatDecimal(line.sick_days)}</TableCell>
                      <TableCell className="text-right">{formatDecimal(line.other_absence_days)}</TableCell>
                      {accountCodes.map((code) => (
                        <TableCell key={code} className="text-right">
                          {formatDecimal(line.account_values?.[code])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-medium">
                    <TableCell colSpan={5} className="text-right">
                      {t('preview.summaryRow')}
                    </TableCell>
                    <TableCell className="text-right">{formatDecimal(totals.target_hours)}</TableCell>
                    <TableCell className="text-right">{formatDecimal(totals.worked_hours)}</TableCell>
                    <TableCell className="text-right">{formatDecimal(totals.overtime_hours)}</TableCell>
                    <TableCell className="text-right">{formatDecimal(totals.vacation_days)}</TableCell>
                    <TableCell className="text-right">{formatDecimal(totals.sick_days)}</TableCell>
                    <TableCell className="text-right">{formatDecimal(totals.other_absence_days)}</TableCell>
                    {accountCodes.map((code) => (
                      <TableCell key={code} className="text-right">
                        {formatDecimal(totals.accounts[code])}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('preview.close')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
