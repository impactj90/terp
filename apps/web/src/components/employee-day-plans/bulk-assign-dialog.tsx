'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SearchInput } from '@/components/ui/search-input'
import { useEmployees, useDayPlans, useBulkCreateEmployeeDayPlans } from '@/hooks/api'
import { formatDate } from '@/lib/time-utils'

interface BulkAssignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

function getDatesInRange(from: Date, to: Date): Date[] {
  const dates: Date[] = []
  const current = new Date(from)
  while (current <= to) {
    dates.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

export function BulkAssignDialog({
  open,
  onOpenChange,
  onSuccess,
}: BulkAssignDialogProps) {
  const t = useTranslations('employeeDayPlans')

  // State
  const [selectedEmployeeIds, setSelectedEmployeeIds] = React.useState<Set<string>>(new Set())
  const [employeeSearch, setEmployeeSearch] = React.useState('')
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined)
  const [selectedDayPlanId, setSelectedDayPlanId] = React.useState('')
  const [source, setSource] = React.useState<'tariff' | 'manual' | 'holiday'>('manual')
  const [notes, setNotes] = React.useState('')
  const [result, setResult] = React.useState<{ created: number; updated: number } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Data fetching
  const { data: employeesData } = useEmployees({
    limit: 200,
    active: true,
    enabled: open,
  })
  const employees = employeesData?.data ?? []

  const { data: dayPlansData } = useDayPlans({ active: true, enabled: open })
  const dayPlans = dayPlansData?.data ?? []

  const bulkMutation = useBulkCreateEmployeeDayPlans()

  // Filter employees by search
  const filteredEmployees = React.useMemo(() => {
    if (!employeeSearch) return employees
    const search = employeeSearch.toLowerCase()
    return employees.filter(
      (e) =>
        e.first_name.toLowerCase().includes(search) ||
        e.last_name.toLowerCase().includes(search) ||
        (e.personnel_number && e.personnel_number.toLowerCase().includes(search))
    )
  }, [employees, employeeSearch])

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setSelectedEmployeeIds(new Set())
      setEmployeeSearch('')
      setDateRange(undefined)
      setSelectedDayPlanId('')
      setSource('manual')
      setNotes('')
      setResult(null)
      setError(null)
    }
  }, [open])

  // Toggle employee selection
  const toggleEmployee = (employeeId: string) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev)
      if (next.has(employeeId)) {
        next.delete(employeeId)
      } else {
        next.add(employeeId)
      }
      return next
    })
  }

  // Select/deselect all visible employees
  const toggleAll = () => {
    const allVisibleIds = filteredEmployees.map((e) => e.id)
    const allSelected = allVisibleIds.every((id) => selectedEmployeeIds.has(id))
    if (allSelected) {
      setSelectedEmployeeIds((prev) => {
        const next = new Set(prev)
        allVisibleIds.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelectedEmployeeIds((prev) => {
        const next = new Set(prev)
        allVisibleIds.forEach((id) => next.add(id))
        return next
      })
    }
  }

  // Compute preview stats
  const dayCount =
    dateRange?.from && dateRange?.to
      ? getDatesInRange(dateRange.from, dateRange.to).length
      : 0
  const totalAssignments = selectedEmployeeIds.size * dayCount

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResult(null)

    if (selectedEmployeeIds.size === 0) {
      setError(t('bulkAssignNoEmployees'))
      return
    }
    if (!dateRange?.from || !dateRange?.to) {
      setError(t('bulkAssignNoDateRange'))
      return
    }
    if (!selectedDayPlanId) {
      setError(t('bulkAssignNoDayPlan'))
      return
    }

    const dates = getDatesInRange(dateRange.from, dateRange.to)
    const plans = Array.from(selectedEmployeeIds).flatMap((employeeId) =>
      dates.map((date) => ({
        employee_id: employeeId,
        plan_date: formatDate(date),
        day_plan_id: selectedDayPlanId,
        source,
        notes: notes || undefined,
      }))
    )

    try {
      const response = await bulkMutation.mutateAsync({
        body: { plans },
      })
      const data = response as { created?: number; updated?: number }
      setResult({
        created: data.created ?? 0,
        updated: data.updated ?? 0,
      })
      // Close after brief delay to show result
      setTimeout(() => {
        onOpenChange(false)
        onSuccess?.()
      }, 1500)
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? 'An error occurred')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('bulkAssignTitle')}</DialogTitle>
          <DialogDescription>{t('bulkAssignDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-2">
            {/* Employee multi-select */}
            <div className="space-y-2">
              <Label>{t('bulkAssignEmployees')}</Label>
              <SearchInput
                value={employeeSearch}
                onChange={setEmployeeSearch}
                placeholder={t('bulkAssignSelectEmployees')}
                className="w-full"
              />
              <ScrollArea className="h-40 rounded-md border p-2">
                {filteredEmployees.length > 0 && (
                  <div className="flex items-center gap-2 pb-2 mb-2 border-b">
                    <Checkbox
                      checked={
                        filteredEmployees.length > 0 &&
                        filteredEmployees.every((e) =>
                          selectedEmployeeIds.has(e.id)
                        )
                      }
                      onCheckedChange={() => toggleAll()}
                    />
                    <span className="text-xs text-muted-foreground">
                      Select all ({filteredEmployees.length})
                    </span>
                  </div>
                )}
                {filteredEmployees.map((employee) => (
                  <div
                    key={employee.id}
                    className="flex items-center gap-2 py-1"
                  >
                    <Checkbox
                      checked={selectedEmployeeIds.has(employee.id)}
                      onCheckedChange={() => toggleEmployee(employee.id)}
                    />
                    <span className="text-sm">
                      {employee.last_name}, {employee.first_name}
                    </span>
                  </div>
                ))}
                {filteredEmployees.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('emptyTitle')}
                  </p>
                )}
              </ScrollArea>
              {selectedEmployeeIds.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedEmployeeIds.size} selected
                </p>
              )}
            </div>

            {/* Date range */}
            <div className="space-y-2">
              <Label>{t('bulkAssignDateRange')}</Label>
              <DateRangePicker
                value={dateRange}
                onChange={setDateRange}
              />
            </div>

            {/* Day plan selector */}
            <div className="space-y-2">
              <Label>{t('bulkAssignDayPlan')}</Label>
              <Select
                value={selectedDayPlanId || '__none__'}
                onValueChange={(val) =>
                  setSelectedDayPlanId(val === '__none__' ? '' : val)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('bulkAssignSelectDayPlan')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>
                    {t('bulkAssignSelectDayPlan')}
                  </SelectItem>
                  {dayPlans.map((dp) => (
                    <SelectItem key={dp.id} value={dp.id}>
                      {dp.code} - {dp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Source selector */}
            <div className="space-y-2">
              <Label>{t('bulkAssignSource')}</Label>
              <Select
                value={source}
                onValueChange={(val) => setSource(val as typeof source)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">{t('sourceManual')}</SelectItem>
                  <SelectItem value="tariff">{t('sourceTariff')}</SelectItem>
                  <SelectItem value="holiday">{t('sourceHoliday')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>{t('bulkAssignNotes')}</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('bulkAssignNotesPlaceholder')}
              />
            </div>

            {/* Preview */}
            {totalAssignments > 0 && (
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
                {t('bulkAssignPreview', {
                  count: totalAssignments,
                  employees: selectedEmployeeIds.size,
                  days: dayCount,
                })}
              </p>
            )}

            {/* Result */}
            {result && (
              <Alert>
                <AlertDescription>
                  {t('bulkAssignSuccess', {
                    created: result.created,
                    updated: result.updated,
                  })}
                </AlertDescription>
              </Alert>
            )}

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={bulkMutation.isPending}
            >
              {t('cellEditCancel')}
            </Button>
            <Button type="submit" disabled={bulkMutation.isPending}>
              {bulkMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('bulkAssignConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
