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
import { usePayrollExportPreview } from '@/hooks'

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
  // Collect all unique account codes from all lines
  const accountCodes = React.useMemo(() => {
    const codes = new Set<string>()
    for (const line of lines) {
      if (line.accountValues) {
        Object.keys(line.accountValues).forEach((code) => codes.add(code))
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
      targetHours: 0,
      workedHours: 0,
      overtimeHours: 0,
      vacationDays: 0,
      sickDays: 0,
      otherAbsenceDays: 0,
      accounts: {} as Record<string, number>,
    }
    for (const line of lines) {
      result.targetHours += line.targetHours ?? 0
      result.workedHours += line.workedHours ?? 0
      result.overtimeHours += line.overtimeHours ?? 0
      result.vacationDays += line.vacationDays ?? 0
      result.sickDays += line.sickDays ?? 0
      result.otherAbsenceDays += line.otherAbsenceDays ?? 0
      if (line.accountValues) {
        for (const [code, value] of Object.entries(line.accountValues)) {
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
                    <TableRow key={line.employeeId ?? index}>
                      <TableCell className="font-mono text-sm">{line.personnelNumber}</TableCell>
                      <TableCell>{line.firstName ?? ''}</TableCell>
                      <TableCell>{line.lastName ?? ''}</TableCell>
                      <TableCell>{line.departmentCode ?? ''}</TableCell>
                      <TableCell>{line.costCenterCode ?? ''}</TableCell>
                      <TableCell className="text-right">{formatDecimal(line.targetHours)}</TableCell>
                      <TableCell className="text-right">{formatDecimal(line.workedHours)}</TableCell>
                      <TableCell className="text-right">{formatDecimal(line.overtimeHours)}</TableCell>
                      <TableCell className="text-right">{formatDecimal(line.vacationDays)}</TableCell>
                      <TableCell className="text-right">{formatDecimal(line.sickDays)}</TableCell>
                      <TableCell className="text-right">{formatDecimal(line.otherAbsenceDays)}</TableCell>
                      {accountCodes.map((code) => (
                        <TableCell key={code} className="text-right">
                          {formatDecimal(line.accountValues?.[code])}
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
                    <TableCell className="text-right">{formatDecimal(totals.targetHours)}</TableCell>
                    <TableCell className="text-right">{formatDecimal(totals.workedHours)}</TableCell>
                    <TableCell className="text-right">{formatDecimal(totals.overtimeHours)}</TableCell>
                    <TableCell className="text-right">{formatDecimal(totals.vacationDays)}</TableCell>
                    <TableCell className="text-right">{formatDecimal(totals.sickDays)}</TableCell>
                    <TableCell className="text-right">{formatDecimal(totals.otherAbsenceDays)}</TableCell>
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
