'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { useGenerateReport, useEmployees, useDepartments, useCostCenters, useTeams } from '@/hooks/api'
import { parseApiError } from '@/lib/api/errors'
import type { components } from '@/lib/api/types'

interface GenerateReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const REQUIRES_DATE_RANGE = [
  'daily_overview',
  'weekly_overview',
  'monthly_overview',
  'employee_timesheet',
  'absence_report',
  'overtime_report',
  'department_summary',
  'account_balances',
]

function formatDateParam(date: Date): string {
  const iso = date.toISOString()
  return iso.slice(0, 10) // YYYY-MM-DD
}

// --- Multi-select popover helper ---

interface MultiSelectPopoverProps {
  label: string
  placeholder: string
  selectedIds: string[]
  onSelectedIdsChange: (ids: string[]) => void
  items: Array<{ id: string; label: string }>
}

function MultiSelectPopover({
  label,
  placeholder,
  selectedIds,
  onSelectedIdsChange,
  items,
}: MultiSelectPopoverProps) {
  const toggleId = (id: string, checked: boolean | 'indeterminate') => {
    if (checked === true) {
      onSelectedIdsChange([...selectedIds, id])
    } else {
      onSelectedIdsChange(selectedIds.filter((sid) => sid !== id))
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between font-normal">
            {selectedIds.length > 0
              ? `${label} (${selectedIds.length})`
              : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <ScrollArea className="h-60">
            {items.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                No items
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center space-x-2 px-3 py-2 hover:bg-accent cursor-pointer"
                  onClick={() => toggleId(item.id, !selectedIds.includes(item.id))}
                >
                  <Checkbox
                    checked={selectedIds.includes(item.id)}
                    onCheckedChange={(checked) => toggleId(item.id, checked)}
                  />
                  <span className="text-sm">{item.label}</span>
                </div>
              ))
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// --- Main dialog component ---

export function GenerateReportDialog({
  open,
  onOpenChange,
}: GenerateReportDialogProps) {
  const t = useTranslations('reports')
  const tc = useTranslations('common')

  // Form state
  const [reportType, setReportType] = React.useState('')
  const [name, setName] = React.useState('')
  const [format, setFormat] = React.useState('pdf')
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined)
  const [employeeIds, setEmployeeIds] = React.useState<string[]>([])
  const [departmentIds, setDepartmentIds] = React.useState<string[]>([])
  const [costCenterIds, setCostCenterIds] = React.useState<string[]>([])
  const [teamIds, setTeamIds] = React.useState<string[]>([])
  const [error, setError] = React.useState<string | null>(null)

  const generateMutation = useGenerateReport()

  // Entity data for filter dropdowns (only fetch when dialog is open)
  const { data: employeesData } = useEmployees({ limit: 200, enabled: open })
  const { data: departmentsData } = useDepartments({ enabled: open })
  const { data: costCentersData } = useCostCenters({ enabled: open })
  const { data: teamsData } = useTeams({ limit: 200, enabled: open })

  const employees = React.useMemo(() => {
    const items = employeesData?.data ?? []
    return items.map((e) => ({
      id: e.id ?? '',
      label: `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || e.personnel_number,
    }))
  }, [employeesData])

  const departments = React.useMemo(() => {
    const items = departmentsData?.data ?? []
    return items.map((d) => ({
      id: d.id ?? '',
      label: d.name ?? d.code ?? '',
    }))
  }, [departmentsData])

  const costCenters = React.useMemo(() => {
    const items = costCentersData?.data ?? []
    return items.map((c) => ({
      id: c.id ?? '',
      label: c.name ?? c.code ?? '',
    }))
  }, [costCentersData])

  const teams = React.useMemo(() => {
    const items = teamsData?.items ?? []
    return items.map((team) => ({
      id: team.id ?? '',
      label: team.name ?? '',
    }))
  }, [teamsData])

  const needsDateRange = reportType ? REQUIRES_DATE_RANGE.includes(reportType) : false

  // Reset form when opening
  React.useEffect(() => {
    if (open) {
      setReportType('')
      setName('')
      setFormat('pdf')
      setDateRange(undefined)
      setEmployeeIds([])
      setDepartmentIds([])
      setCostCenterIds([])
      setTeamIds([])
      setError(null)
    }
  }, [open])

  const handleClose = () => {
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    setError(null)

    if (!reportType) {
      setError(t('generate.validationReportTypeRequired'))
      return
    }
    if (!format) {
      setError(t('generate.validationFormatRequired'))
      return
    }
    if (needsDateRange && (!dateRange?.from || !dateRange?.to)) {
      setError(t('generate.dateRangeRequired'))
      return
    }

    const parameters: components['schemas']['GenerateReportRequest']['parameters'] = {}
    if (dateRange?.from) parameters.from_date = formatDateParam(dateRange.from)
    if (dateRange?.to) parameters.to_date = formatDateParam(dateRange.to)
    if (employeeIds.length > 0) parameters.employee_ids = employeeIds
    if (departmentIds.length > 0) parameters.department_ids = departmentIds
    if (costCenterIds.length > 0) parameters.cost_center_ids = costCenterIds
    if (teamIds.length > 0) parameters.team_ids = teamIds

    try {
      await generateMutation.mutateAsync({
        body: {
          report_type: reportType as components['schemas']['GenerateReportRequest']['report_type'],
          format: format as components['schemas']['GenerateReportRequest']['format'],
          ...(name ? { name } : {}),
          ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
        },
      })
      handleClose()
    } catch (err) {
      const apiError = parseApiError(err)
      setError(apiError.message ?? t('generate.error'))
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
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Report Type (grouped) */}
            <div className="space-y-2">
              <Label>{t('generate.reportTypeLabel')}</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue placeholder={t('generate.reportTypePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>{t('typeGroups.masterData')}</SelectLabel>
                    <SelectItem value="daily_overview">{t('types.daily_overview')}</SelectItem>
                    <SelectItem value="weekly_overview">{t('types.weekly_overview')}</SelectItem>
                    <SelectItem value="employee_timesheet">{t('types.employee_timesheet')}</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>{t('typeGroups.monthly')}</SelectLabel>
                    <SelectItem value="monthly_overview">{t('types.monthly_overview')}</SelectItem>
                    <SelectItem value="department_summary">{t('types.department_summary')}</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>{t('typeGroups.absenceVacation')}</SelectLabel>
                    <SelectItem value="absence_report">{t('types.absence_report')}</SelectItem>
                    <SelectItem value="vacation_report">{t('types.vacation_report')}</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>{t('typeGroups.timeAnalysis')}</SelectLabel>
                    <SelectItem value="overtime_report">{t('types.overtime_report')}</SelectItem>
                    <SelectItem value="account_balances">{t('types.account_balances')}</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>{t('typeGroups.other')}</SelectLabel>
                    <SelectItem value="custom">{t('types.custom')}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label>{t('generate.nameLabel')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('generate.namePlaceholder')}
              />
            </div>

            {/* Format */}
            <div className="space-y-2">
              <Label>{t('generate.formatLabel')}</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">{t('format.pdf')}</SelectItem>
                  <SelectItem value="xlsx">{t('format.xlsx')}</SelectItem>
                  <SelectItem value="csv">{t('format.csv')}</SelectItem>
                  <SelectItem value="json">{t('format.json')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Range (shown when report type requires it) */}
            {reportType && needsDateRange && (
              <div className="space-y-2">
                <Label>{t('generate.dateRangeLabel')}</Label>
                <DateRangePicker
                  value={dateRange}
                  onChange={setDateRange}
                  placeholder={t('generate.dateRangeLabel')}
                />
              </div>
            )}

            {/* Entity Filters (shown after type is selected) */}
            {reportType && (
              <div className="space-y-4 rounded-lg border p-4">
                <h4 className="text-sm font-medium">{t('generate.filtersSection')}</h4>

                <MultiSelectPopover
                  label={t('generate.employeeFilterLabel')}
                  placeholder={t('generate.employeeFilterPlaceholder')}
                  selectedIds={employeeIds}
                  onSelectedIdsChange={setEmployeeIds}
                  items={employees}
                />

                <MultiSelectPopover
                  label={t('generate.departmentFilterLabel')}
                  placeholder={t('generate.departmentFilterPlaceholder')}
                  selectedIds={departmentIds}
                  onSelectedIdsChange={setDepartmentIds}
                  items={departments}
                />

                <MultiSelectPopover
                  label={t('generate.costCenterFilterLabel')}
                  placeholder={t('generate.costCenterFilterPlaceholder')}
                  selectedIds={costCenterIds}
                  onSelectedIdsChange={setCostCenterIds}
                  items={costCenters}
                />

                <MultiSelectPopover
                  label={t('generate.teamFilterLabel')}
                  placeholder={t('generate.teamFilterPlaceholder')}
                  selectedIds={teamIds}
                  onSelectedIdsChange={setTeamIds}
                  items={teams}
                />
              </div>
            )}
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
            disabled={generateMutation.isPending || !reportType}
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
