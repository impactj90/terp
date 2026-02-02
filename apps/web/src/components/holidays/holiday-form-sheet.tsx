'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { useTranslations } from 'next-intl'
import { Loader2, CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Calendar } from '@/components/ui/calendar'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  useCreateHoliday,
  useUpdateHoliday,
  useDepartments,
} from '@/hooks/api'
import { cn } from '@/lib/utils'
import { formatDate, parseISODate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Holiday = components['schemas']['Holiday']

interface HolidayFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  holiday?: Holiday | null
  defaultDate?: Date | null
  onSuccess?: () => void
}

interface FormState {
  holidayDate: Date | undefined
  name: string
  category: number
  appliesToAll: boolean
  departmentId: string
}

const INITIAL_STATE: FormState = {
  holidayDate: undefined,
  name: '',
  category: 1,
  appliesToAll: true,
  departmentId: '',
}

export function HolidayFormSheet({
  open,
  onOpenChange,
  holiday,
  defaultDate,
  onSuccess,
}: HolidayFormSheetProps) {
  const t = useTranslations('adminHolidays')
  const isEdit = !!holiday
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)
  const [datePickerOpen, setDatePickerOpen] = React.useState(false)
  const [month, setMonth] = React.useState(() => new Date())

  // Mutations
  const createMutation = useCreateHoliday()
  const updateMutation = useUpdateHoliday()

  // Fetch departments for selection
  const { data: departmentsData, isLoading: loadingDepartments } = useDepartments({
    enabled: open && !form.appliesToAll,
    active: true,
  })
  const departments = departmentsData?.data ?? []

  // Reset form when opening/closing or holiday changes
  React.useEffect(() => {
    if (open) {
      if (holiday) {
        const date = parseISODate(holiday.holiday_date)
        setForm({
          holidayDate: date,
          name: holiday.name,
          category: holiday.category ?? 1,
          appliesToAll: holiday.applies_to_all ?? true,
          departmentId: holiday.department_id || '',
        })
        setMonth(date)
      } else {
        const initialDate = defaultDate || undefined
        setForm({
          ...INITIAL_STATE,
          holidayDate: initialDate,
        })
        if (initialDate) {
          setMonth(initialDate)
        }
      }
      setError(null)
    }
  }, [open, holiday, defaultDate])

  const handleSubmit = async () => {
    setError(null)

    const errors: string[] = []
    if (!form.holidayDate) errors.push(t('validationDateRequired'))
    if (!form.name.trim()) errors.push(t('validationNameRequired'))
    if (!form.appliesToAll && !form.departmentId) errors.push(t('validationDepartmentRequired'))

    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && holiday) {
        await updateMutation.mutateAsync({
          path: { id: holiday.id },
          body: {
            holiday_date: formatDate(form.holidayDate!),
            name: form.name.trim(),
            category: form.category as 1 | 2 | 3,
            applies_to_all: form.appliesToAll,
            department_id: form.appliesToAll ? undefined : form.departmentId || undefined,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            holiday_date: formatDate(form.holidayDate!),
            name: form.name.trim(),
            category: form.category as 1 | 2 | 3,
            applies_to_all: form.appliesToAll,
            department_id: form.appliesToAll ? undefined : form.departmentId || undefined,
          },
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? (isEdit ? t('failedUpdate') : t('failedCreate'))
      )
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editHoliday') : t('newHoliday')}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? t('editDescription')
              : t('createDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Date Selection */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionDate')}</h3>

              <div className="space-y-2">
                <Label>{t('fieldDate')} *</Label>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !form.holidayDate && 'text-muted-foreground'
                      )}
                      disabled={isSubmitting}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.holidayDate ? (
                        format(form.holidayDate, 'EEEE, MMMM d, yyyy')
                      ) : (
                        t('selectDate')
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      month={month}
                      onMonthChange={setMonth}
                      selected={form.holidayDate}
                      onSelect={(date) => {
                        if (date instanceof Date) {
                          setForm((prev) => ({ ...prev, holidayDate: date }))
                          setDatePickerOpen(false)
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionInformation')}</h3>

              <div className="space-y-2">
                <Label htmlFor="name">{t('fieldName')} *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('namePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('categoryLabel')} *</Label>
                <Select
                  value={String(form.category)}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, category: Number(value) }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('categoryPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('categoryFull')}</SelectItem>
                    <SelectItem value="2">{t('categoryHalf')}</SelectItem>
                    <SelectItem value="3">{t('categoryCustom')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('categoryDescription')}
                </p>
              </div>
            </div>

            {/* Scope */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionScope')}</h3>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="appliesToAll">{t('appliesToAllLabel')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('appliesToAllDescription')}
                  </p>
                </div>
                <Switch
                  id="appliesToAll"
                  checked={form.appliesToAll}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({
                      ...prev,
                      appliesToAll: checked,
                      departmentId: checked ? '' : prev.departmentId,
                    }))
                  }
                  disabled={isSubmitting}
                />
              </div>

              {!form.appliesToAll && (
                <div className="space-y-2">
                  <Label>{t('fieldDepartment')} *</Label>
                  <Select
                    value={form.departmentId || '__none__'}
                    onValueChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        departmentId: value === '__none__' ? '' : value,
                      }))
                    }
                    disabled={isSubmitting || loadingDepartments}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectDepartment')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t('selectDepartmentOption')}</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name} ({dept.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting} className="flex-1">
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('createHolidayButton')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
