'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { CalendarIcon, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  useCreateEmployee,
  useUpdateEmployee,
  useDepartments,
  useCostCenters,
  useEmploymentTypes,
} from '@/hooks/api'
import { cn } from '@/lib/utils'
import type { components } from '@/lib/api/types'

type Employee = components['schemas']['Employee']

interface EmployeeFormSheetProps {
  /** Whether the sheet is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Employee to edit (null = create mode) */
  employee?: Employee | null
  /** Callback when form submits successfully */
  onSuccess?: () => void
}

interface FormState {
  personnelNumber: string
  pin: string
  firstName: string
  lastName: string
  email: string
  phone: string
  entryDate: Date | undefined
  exitDate: Date | undefined
  departmentId: string
  costCenterId: string
  employmentTypeId: string
  weeklyHours: string
  vacationDaysPerYear: string
}

const INITIAL_STATE: FormState = {
  personnelNumber: '',
  pin: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  entryDate: undefined,
  exitDate: undefined,
  departmentId: '',
  costCenterId: '',
  employmentTypeId: '',
  weeklyHours: '',
  vacationDaysPerYear: '',
}

function validateForm(form: FormState, isEdit: boolean): string[] {
  const errorKeys: string[] = []

  if (!isEdit) {
    if (!form.personnelNumber.trim()) {
      errorKeys.push('validationPersonnelNumberRequired')
    }
    if (!form.pin.trim()) {
      errorKeys.push('validationPinRequired')
    }
  }

  if (!form.firstName.trim()) {
    errorKeys.push('validationFirstNameRequired')
  }

  if (!form.lastName.trim()) {
    errorKeys.push('validationLastNameRequired')
  }

  if (!isEdit && !form.entryDate) {
    errorKeys.push('validationEntryDateRequired')
  }

  if (form.email && !form.email.includes('@')) {
    errorKeys.push('validationInvalidEmail')
  }

  return errorKeys
}

function formatDateForApi(date: Date | undefined): string | undefined {
  if (!date) return undefined
  return format(date, 'yyyy-MM-dd')
}

/**
 * Sheet form for creating or editing an employee.
 */
export function EmployeeFormSheet({
  open,
  onOpenChange,
  employee,
  onSuccess,
}: EmployeeFormSheetProps) {
  const t = useTranslations('adminEmployees')
  const isEdit = !!employee
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  // Calendar month state
  const [entryDateMonth, setEntryDateMonth] = React.useState<Date>(new Date())
  const [exitDateMonth, setExitDateMonth] = React.useState<Date>(new Date())

  // Mutations
  const createMutation = useCreateEmployee()
  const updateMutation = useUpdateEmployee()

  // Reference data
  const { data: departmentsData, isLoading: loadingDepartments } = useDepartments({ enabled: open })
  const { data: costCentersData, isLoading: loadingCostCenters } = useCostCenters({ enabled: open })
  const { data: employmentTypesData, isLoading: loadingEmploymentTypes } = useEmploymentTypes({ enabled: open })

  const departments = departmentsData?.data ?? []
  const costCenters = costCentersData?.data ?? []
  const employmentTypes = employmentTypesData?.data ?? []

  // Reset form when opening/closing or employee changes
  React.useEffect(() => {
    if (open) {
      if (employee) {
        const entryDate = employee.entry_date ? new Date(employee.entry_date) : undefined
        const exitDate = employee.exit_date ? new Date(employee.exit_date) : undefined
        setForm({
          personnelNumber: employee.personnel_number,
          pin: '', // Never show existing PIN
          firstName: employee.first_name,
          lastName: employee.last_name,
          email: employee.email || '',
          phone: employee.phone || '',
          entryDate,
          exitDate,
          departmentId: employee.department_id || '',
          costCenterId: employee.cost_center_id || '',
          employmentTypeId: employee.employment_type_id || '',
          weeklyHours: employee.weekly_hours?.toString() || '',
          vacationDaysPerYear: employee.vacation_days_per_year?.toString() || '',
        })
        // Set calendar months to show the relevant dates
        if (entryDate) setEntryDateMonth(entryDate)
        if (exitDate) setExitDateMonth(exitDate)
      } else {
        setForm(INITIAL_STATE)
        setEntryDateMonth(new Date())
        setExitDateMonth(new Date())
      }
      setError(null)
    }
  }, [open, employee])

  const handleSubmit = async () => {
    setError(null)

    const errorKeys = validateForm(form, isEdit)
    if (errorKeys.length > 0) {
      setError(errorKeys.map((key) => t(key as Parameters<typeof t>[0])).join('. '))
      return
    }

    try {
      if (isEdit && employee) {
        await updateMutation.mutateAsync({
          path: { id: employee.id },
          body: {
            first_name: form.firstName.trim(),
            last_name: form.lastName.trim(),
            email: form.email.trim() || undefined,
            phone: form.phone.trim() || undefined,
            exit_date: formatDateForApi(form.exitDate),
            department_id: form.departmentId || undefined,
            cost_center_id: form.costCenterId || undefined,
            employment_type_id: form.employmentTypeId || undefined,
            weekly_hours: form.weeklyHours ? parseFloat(form.weeklyHours) : undefined,
            vacation_days_per_year: form.vacationDaysPerYear ? parseFloat(form.vacationDaysPerYear) : undefined,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            personnel_number: form.personnelNumber.trim(),
            pin: form.pin.trim(),
            first_name: form.firstName.trim(),
            last_name: form.lastName.trim(),
            email: form.email.trim() || undefined,
            phone: form.phone.trim() || undefined,
            entry_date: formatDateForApi(form.entryDate)!,
            department_id: form.departmentId || undefined,
            cost_center_id: form.costCenterId || undefined,
            employment_type_id: form.employmentTypeId || undefined,
            weekly_hours: form.weeklyHours ? parseFloat(form.weeklyHours) : undefined,
            vacation_days_per_year: form.vacationDaysPerYear ? parseFloat(form.vacationDaysPerYear) : undefined,
          },
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? (isEdit ? t('updateError') : t('createError')))
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending
  const isLoadingReferenceData = loadingDepartments || loadingCostCenters || loadingEmploymentTypes

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editEmployee') : t('newEmployee')}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? t('editEmployeeDescription')
              : t('newEmployeeDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Personal Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionPersonal')}</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t('fieldFirstName')}</Label>
                  <Input
                    id="firstName"
                    value={form.firstName}
                    onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                    disabled={isSubmitting}
                    placeholder={t('placeholderFirstName')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t('fieldLastName')}</Label>
                  <Input
                    id="lastName"
                    value={form.lastName}
                    onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                    disabled={isSubmitting}
                    placeholder={t('placeholderLastName')}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('fieldEmail')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('placeholderEmail')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">{t('fieldPhone')}</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('placeholderPhone')}
                />
              </div>
            </div>

            {/* Employment Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionEmployment')}</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="personnelNumber">{t('fieldPersonnelNumber')}</Label>
                  <Input
                    id="personnelNumber"
                    value={form.personnelNumber}
                    onChange={(e) => setForm((prev) => ({ ...prev, personnelNumber: e.target.value }))}
                    disabled={isEdit || isSubmitting}
                    placeholder={t('placeholderPersonnelNumber')}
                  />
                  {isEdit && (
                    <p className="text-xs text-muted-foreground">{t('cannotBeChanged')}</p>
                  )}
                </div>

                {!isEdit && (
                  <div className="space-y-2">
                    <Label htmlFor="pin">{t('fieldPin')}</Label>
                    <Input
                      id="pin"
                      type="password"
                      value={form.pin}
                      onChange={(e) => setForm((prev) => ({ ...prev, pin: e.target.value }))}
                      disabled={isSubmitting}
                      placeholder={t('placeholderPin')}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('fieldEntryDate')}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !form.entryDate && 'text-muted-foreground'
                        )}
                        disabled={isEdit || isSubmitting}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {form.entryDate ? format(form.entryDate, 'dd.MM.yyyy') : t('selectDate')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        month={entryDateMonth}
                        onMonthChange={setEntryDateMonth}
                        selected={form.entryDate}
                        onSelect={(date) => {
                          if (date instanceof Date) {
                            setForm((prev) => ({ ...prev, entryDate: date }))
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  {isEdit && (
                    <p className="text-xs text-muted-foreground">{t('cannotBeChanged')}</p>
                  )}
                </div>

                {isEdit && (
                  <div className="space-y-2">
                    <Label>{t('fieldExitDate')}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !form.exitDate && 'text-muted-foreground'
                          )}
                          disabled={isSubmitting}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.exitDate ? format(form.exitDate, 'dd.MM.yyyy') : t('selectDate')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          month={exitDateMonth}
                          onMonthChange={setExitDateMonth}
                          selected={form.exitDate}
                          onSelect={(date) => {
                            if (date instanceof Date) {
                              setForm((prev) => ({ ...prev, exitDate: date }))
                            }
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t('fieldDepartment')}</Label>
                <Select
                  value={form.departmentId || '__none__'}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, departmentId: value === '__none__' ? '' : value }))}
                  disabled={isSubmitting || isLoadingReferenceData}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectDepartment')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('none')}</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('fieldCostCenter')}</Label>
                <Select
                  value={form.costCenterId || '__none__'}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, costCenterId: value === '__none__' ? '' : value }))}
                  disabled={isSubmitting || isLoadingReferenceData}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectCostCenter')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('none')}</SelectItem>
                    {costCenters.map((cc) => (
                      <SelectItem key={cc.id} value={cc.id}>
                        {cc.name} ({cc.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('fieldEmploymentType')}</Label>
                <Select
                  value={form.employmentTypeId || '__none__'}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, employmentTypeId: value === '__none__' ? '' : value }))}
                  disabled={isSubmitting || isLoadingReferenceData}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectEmploymentType')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('none')}</SelectItem>
                    {employmentTypes.map((et) => (
                      <SelectItem key={et.id} value={et.id}>
                        {et.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Contract Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionContract')}</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="weeklyHours">{t('fieldWeeklyHours')}</Label>
                  <Input
                    id="weeklyHours"
                    type="number"
                    step="0.5"
                    min="0"
                    max="60"
                    value={form.weeklyHours}
                    onChange={(e) => setForm((prev) => ({ ...prev, weeklyHours: e.target.value }))}
                    disabled={isSubmitting}
                    placeholder="40"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vacationDays">{t('fieldVacationDays')}</Label>
                  <Input
                    id="vacationDays"
                    type="number"
                    step="0.5"
                    min="0"
                    max="60"
                    value={form.vacationDaysPerYear}
                    onChange={(e) => setForm((prev) => ({ ...prev, vacationDaysPerYear: e.target.value }))}
                    disabled={isSubmitting}
                    placeholder="30"
                  />
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
            className="flex-1"
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('createEmployee')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
