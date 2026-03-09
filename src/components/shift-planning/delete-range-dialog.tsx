'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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
import { useEmployees, useDeleteEmployeeDayPlanRange } from '@/hooks/api'
import { formatDate, formatDisplayDate } from '@/lib/time-utils'

interface DeleteRangeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultEmployeeId?: string
  defaultEmployeeName?: string
  onSuccess?: () => void
}

export function DeleteRangeDialog({
  open,
  onOpenChange,
  defaultEmployeeId,
  defaultEmployeeName,
  onSuccess,
}: DeleteRangeDialogProps) {
  const t = useTranslations('shiftPlanning')
  const locale = useLocale()

  // State
  const [selectedEmployeeId, setSelectedEmployeeId] = React.useState('')
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined)
  const [result, setResult] = React.useState<{ deleted: number } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Data fetching
  const { data: employeesData } = useEmployees({
    limit: 200,
    active: true,
    enabled: open,
  })
  const employees = employeesData?.data ?? []

  const deleteMutation = useDeleteEmployeeDayPlanRange()

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setSelectedEmployeeId(defaultEmployeeId ?? '')
      setDateRange(undefined)
      setResult(null)
      setError(null)
    }
  }, [open, defaultEmployeeId])

  // Get the selected employee name for confirmation text
  const selectedEmployeeName = React.useMemo(() => {
    if (defaultEmployeeName && selectedEmployeeId === defaultEmployeeId) {
      return defaultEmployeeName
    }
    const employee = employees.find((e) => e.id === selectedEmployeeId)
    return employee ? `${employee.last_name}, ${employee.first_name}` : ''
  }, [selectedEmployeeId, employees, defaultEmployeeId, defaultEmployeeName])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResult(null)

    if (!selectedEmployeeId) {
      setError(t('deleteRangeNoEmployee'))
      return
    }
    if (!dateRange?.from || !dateRange?.to) {
      setError(t('deleteRangeNoDateRange'))
      return
    }

    try {
      const response = await deleteMutation.mutateAsync({
        body: {
          employee_id: selectedEmployeeId,
          from: formatDate(dateRange.from),
          to: formatDate(dateRange.to),
        },
      })
      const data = response as { deleted?: number }
      setResult({ deleted: data.deleted ?? 0 })
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

  const showConfirmation =
    selectedEmployeeId && dateRange?.from && dateRange?.to

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('deleteRangeTitle')}</DialogTitle>
          <DialogDescription>{t('deleteRangeDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-2">
            {/* Employee selector */}
            <div className="space-y-2">
              <Label>{t('deleteRangeEmployee')}</Label>
              <Select
                value={selectedEmployeeId || '__none__'}
                onValueChange={(val) =>
                  setSelectedEmployeeId(val === '__none__' ? '' : val)
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t('deleteRangeSelectEmployee')}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>
                    {t('deleteRangeSelectEmployee')}
                  </SelectItem>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.last_name}, {employee.first_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date range */}
            <div className="space-y-2">
              <Label>{t('deleteRangeDateRange')}</Label>
              <DateRangePicker
                value={dateRange}
                onChange={setDateRange}
              />
            </div>

            {/* Confirmation warning */}
            {showConfirmation && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t('deleteRangeConfirmation', {
                    employee: selectedEmployeeName,
                    from: formatDisplayDate(dateRange.from!, 'short', locale),
                    to: formatDisplayDate(dateRange.to!, 'short', locale),
                  })}
                </AlertDescription>
              </Alert>
            )}

            {/* Result */}
            {result && (
              <Alert>
                <AlertDescription>
                  {t('deleteRangeSuccess', { deleted: result.deleted })}
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
              disabled={deleteMutation.isPending}
            >
              {t('assignmentCancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('deleteRangeConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
