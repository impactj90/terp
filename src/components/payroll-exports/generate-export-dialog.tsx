'use client'

import * as React from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useGeneratePayrollExport, useExportInterfaces } from '@/hooks/api'
import { parseApiError } from '@/lib/api/errors'
import { Link } from '@/i18n/navigation'

interface GenerateExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultYear: number
  defaultMonth: number
}

export function GenerateExportDialog({
  open,
  onOpenChange,
  defaultYear,
  defaultMonth,
}: GenerateExportDialogProps) {
  const t = useTranslations('payrollExports')
  const tc = useTranslations('common')

  // Form state
  const [year, setYear] = useState(defaultYear)
  const [month, setMonth] = useState(defaultMonth)
  const [exportType, setExportType] = useState('standard')
  const [format, setFormat] = useState('csv')
  const [interfaceId, setInterfaceId] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [employeeIds, setEmployeeIds] = useState('')
  const [departmentIds, setDepartmentIds] = useState('')
  const [accountIds, setAccountIds] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isMonthNotClosed, setIsMonthNotClosed] = useState(false)

  const generateMutation = useGeneratePayrollExport()
  const { data: interfacesData } = useExportInterfaces(open)
  const interfaces = interfacesData?.data ?? []

  const isFutureMonth = (y: number, m: number) => {
    const now = new Date()
    return y > now.getFullYear() || (y === now.getFullYear() && m >= now.getMonth() + 1)
  }

  // Reset form when opening
  React.useEffect(() => {
    if (open) {
      setYear(defaultYear)
      setMonth(defaultMonth)
      setExportType('standard')
      setFormat('csv')
      setInterfaceId(null)
      setShowAdvanced(false)
      setEmployeeIds('')
      setDepartmentIds('')
      setAccountIds('')
      setError(null)
      setIsMonthNotClosed(false)
    }
  }, [open, defaultYear, defaultMonth])

  const handleClose = () => {
    onOpenChange(false)
  }

  const parseIdList = (input: string): string[] => {
    return input
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const handleSubmit = async () => {
    setError(null)
    setIsMonthNotClosed(false)

    // Validation
    if (!year || !month || !format) {
      setError(t('generate.validationRequired'))
      return
    }

    const parameters: {
      employee_ids?: string[]
      department_ids?: string[]
      include_accounts?: string[]
    } = {}
    const empIds = parseIdList(employeeIds)
    const deptIds = parseIdList(departmentIds)
    const acctIds = parseIdList(accountIds)
    if (empIds.length > 0) parameters.employee_ids = empIds
    if (deptIds.length > 0) parameters.department_ids = deptIds
    if (acctIds.length > 0) parameters.include_accounts = acctIds

    try {
      await generateMutation.mutateAsync({
        body: {
          year,
          month,
          format,
          export_type: exportType,
          ...(interfaceId ? { export_interface_id: interfaceId } : {}),
          ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
        },
      })
      handleClose()
    } catch (err) {
      const apiError = parseApiError(err)
      if (apiError.status === 409) {
        setIsMonthNotClosed(true)
        setError(t('generate.monthNotClosed'))
      } else {
        setError(apiError.message ?? t('generate.error'))
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('generate.title')}</SheetTitle>
          <SheetDescription>{t('generate.description')}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {error}
                  {isMonthNotClosed && (
                    <Link
                      href="/admin/monthly-values"
                      className="block mt-2 underline text-sm"
                    >
                      {t('generate.monthNotClosedLink')}
                    </Link>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Year */}
            <div className="space-y-2">
              <Label>{t('generate.yearLabel')}</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value) || defaultYear)}
                min={2000}
                max={2100}
              />
            </div>

            {/* Month */}
            <div className="space-y-2">
              <Label>{t('generate.monthLabel')}</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2000, m - 1))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isFutureMonth(year, month) && (
                <p className="text-sm text-destructive">{t('generate.futureMonthError')}</p>
              )}
            </div>

            {/* Export Type */}
            <div className="space-y-2">
              <Label>{t('generate.exportTypeLabel')}</Label>
              <Select value={exportType} onValueChange={setExportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">{t('exportType.standard')}</SelectItem>
                  <SelectItem value="datev">{t('exportType.datev')}</SelectItem>
                  <SelectItem value="sage">{t('exportType.sage')}</SelectItem>
                  <SelectItem value="custom">{t('exportType.custom')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Format */}
            <div className="space-y-2">
              <Label>{t('generate.formatLabel')}</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">{t('format.csv')}</SelectItem>
                  <SelectItem value="xlsx">{t('format.xlsx')}</SelectItem>
                  <SelectItem value="xml">{t('format.xml')}</SelectItem>
                  <SelectItem value="json">{t('format.json')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Export Interface (optional) */}
            {interfaces.length > 0 && (
              <div className="space-y-2">
                <Label>{t('generate.interfaceLabel')}</Label>
                <Select
                  value={interfaceId ?? 'none'}
                  onValueChange={(v) => setInterfaceId(v === 'none' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('generate.interfacePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('generate.noInterface')}</SelectItem>
                    {interfaces.map((iface) => (
                      <SelectItem key={iface.id} value={iface.id ?? ''}>
                        {iface.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Advanced Parameters (collapsible) */}
            <div className="space-y-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-between"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {t('generate.advancedParameters')}
                {showAdvanced ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>

              {showAdvanced && (
                <div className="space-y-4 rounded-lg border p-4">
                  <div className="space-y-2">
                    <Label>{t('generate.employeeIdsLabel')}</Label>
                    <Input
                      value={employeeIds}
                      onChange={(e) => setEmployeeIds(e.target.value)}
                      placeholder={t('generate.employeeIdsPlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('generate.departmentIdsLabel')}</Label>
                    <Input
                      value={departmentIds}
                      onChange={(e) => setDepartmentIds(e.target.value)}
                      placeholder={t('generate.departmentIdsPlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('generate.accountIdsLabel')}</Label>
                    <Input
                      value={accountIds}
                      onChange={(e) => setAccountIds(e.target.value)}
                      placeholder={t('generate.accountIdsPlaceholder')}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={generateMutation.isPending}
            className="flex-1"
          >
            {tc('cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={generateMutation.isPending || isFutureMonth(year, month)}
            className="flex-1"
          >
            {generateMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('generate.submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
