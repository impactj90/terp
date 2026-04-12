'use client'

import * as React from 'react'
import { Loader2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  useCreateEmployeeMessage,
  useEmployees,
  useDepartments,
} from '@/hooks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Employee = any

interface MessageComposeSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (messageId: string, subject: string, recipientCount: number) => void
}

type RecipientMode = 'individual' | 'department' | 'all'

interface ComposeFormState {
  subject: string
  body: string
  recipientMode: RecipientMode
  selectedEmployeeIds: string[]
  selectedDepartmentIds: string[]
  allConfirmed: boolean
}

const INITIAL_STATE: ComposeFormState = {
  subject: '',
  body: '',
  recipientMode: 'individual',
  selectedEmployeeIds: [],
  selectedDepartmentIds: [],
  allConfirmed: false,
}

export function MessageComposeSheet({
  open,
  onOpenChange,
  onSuccess,
}: MessageComposeSheetProps) {
  const t = useTranslations('adminEmployeeMessages')
  const [form, setForm] = React.useState<ComposeFormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  // Mutations
  const createMutation = useCreateEmployeeMessage()

  // Fetch employees for individual selection
  const { data: employeesData } = useEmployees({
    isActive: true,
    pageSize: 100,
    enabled: open,
  })
  const allEmployees = employeesData?.items ?? []
  const totalEmployeeCount = employeesData?.total ?? 0

  // Fetch departments for department selection
  const { data: departmentsData } = useDepartments({
    active: true,
    enabled: open && form.recipientMode === 'department',
  })
  const allDepartments = departmentsData?.data ?? []

  // Fetch employees for each selected department
  const { data: deptEmployeesData } = useEmployees({
    isActive: true,
    pageSize: 100,
    departmentId: form.selectedDepartmentIds.length === 1 ? form.selectedDepartmentIds[0] : undefined,
    enabled: open && form.recipientMode === 'department' && form.selectedDepartmentIds.length === 1,
  })

  // For department mode, we track resolved employee IDs
  const [resolvedDeptEmployeeIds, setResolvedDeptEmployeeIds] = React.useState<string[]>([])

  // When department employees change, update resolved IDs
  React.useEffect(() => {
    if (form.recipientMode === 'department' && deptEmployeesData?.items) {
      const ids = deptEmployeesData.items.map((e: Employee) => e.id)
      setResolvedDeptEmployeeIds(ids)
    }
  }, [form.recipientMode, deptEmployeesData])

  // Compute recipient count
  const recipientCount = React.useMemo(() => {
    if (form.recipientMode === 'individual') {
      return form.selectedEmployeeIds.length
    }
    if (form.recipientMode === 'department') {
      return resolvedDeptEmployeeIds.length
    }
    if (form.recipientMode === 'all' && form.allConfirmed) {
      return totalEmployeeCount
    }
    return 0
  }, [form.recipientMode, form.selectedEmployeeIds, resolvedDeptEmployeeIds, form.allConfirmed, totalEmployeeCount])

  // Reset form on open/close
  React.useEffect(() => {
    if (open) {
      setForm(INITIAL_STATE)
      setError(null)
      setResolvedDeptEmployeeIds([])
    }
  }, [open])

  function validateForm(): string[] {
    const errors: string[] = []

    if (!form.subject.trim()) {
      errors.push(t('validationSubjectRequired'))
    }
    if (!form.body.trim()) {
      errors.push(t('validationBodyRequired'))
    }

    if (form.recipientMode === 'individual' && form.selectedEmployeeIds.length === 0) {
      errors.push(t('validationRecipientsRequired'))
    }
    if (form.recipientMode === 'department' && form.selectedDepartmentIds.length === 0) {
      errors.push(t('validationRecipientsRequired'))
    }
    if (form.recipientMode === 'all' && !form.allConfirmed) {
      errors.push(t('validationAllConfirmRequired'))
    }

    return errors
  }

  const handleSubmit = async () => {
    setError(null)

    const errors = validateForm()
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      // Resolve employee IDs based on mode
      let employeeIds: string[] = []

      if (form.recipientMode === 'individual') {
        employeeIds = form.selectedEmployeeIds
      } else if (form.recipientMode === 'department') {
        // Use resolved department employee IDs
        employeeIds = resolvedDeptEmployeeIds
      } else if (form.recipientMode === 'all') {
        // Send all active employee IDs
        employeeIds = allEmployees.map((e) => e.id)
      }

      if (employeeIds.length === 0) {
        setError(t('validationRecipientsRequired'))
        return
      }

      const result = await createMutation.mutateAsync({
        subject: form.subject.trim(),
        body: form.body.trim(),
        employeeIds,
      })

      onSuccess?.(result.id, form.subject.trim(), employeeIds.length)
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('createError'))
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const handleAddEmployee = (employeeId: string) => {
    if (employeeId && !form.selectedEmployeeIds.includes(employeeId)) {
      setForm((prev) => ({
        ...prev,
        selectedEmployeeIds: [...prev.selectedEmployeeIds, employeeId],
      }))
    }
  }

  const handleRemoveEmployee = (employeeId: string) => {
    setForm((prev) => ({
      ...prev,
      selectedEmployeeIds: prev.selectedEmployeeIds.filter((id) => id !== employeeId),
    }))
  }

  const handleAddDepartment = (departmentId: string) => {
    if (departmentId && !form.selectedDepartmentIds.includes(departmentId)) {
      setForm((prev) => ({
        ...prev,
        selectedDepartmentIds: [...prev.selectedDepartmentIds, departmentId],
      }))
    }
  }

  const handleRemoveDepartment = (departmentId: string) => {
    setForm((prev) => ({
      ...prev,
      selectedDepartmentIds: prev.selectedDepartmentIds.filter((id) => id !== departmentId),
    }))
  }

  const getEmployeeName = (id: string) => {
    const emp = allEmployees.find((e) => e.id === id)
    return emp ? `${emp.firstName} ${emp.lastName}` : id.slice(0, 8)
  }

  const getDepartmentName = (id: string) => {
    const dept = allDepartments.find((d) => d.id === id)
    return dept ? dept.name : id.slice(0, 8)
  }

  const isSubmitting = createMutation.isPending

  // Filter out already-selected employees from the list
  const availableEmployees = allEmployees.filter(
    (e) => !form.selectedEmployeeIds.includes(e.id)
  )

  const availableDepartments = allDepartments.filter(
    (d) => !form.selectedDepartmentIds.includes(d.id)
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('composeTitle')}</SheetTitle>
          <SheetDescription>{t('composeDescription')}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {/* Subject */}
            <div className="space-y-2">
              <Label htmlFor="subject">{t('fieldSubject')} *</Label>
              <Input
                id="subject"
                value={form.subject}
                onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
                disabled={isSubmitting}
                placeholder={t('fieldSubjectPlaceholder')}
                maxLength={255}
              />
            </div>

            {/* Body */}
            <div className="space-y-2">
              <Label htmlFor="body">{t('fieldBody')} *</Label>
              <Textarea
                id="body"
                value={form.body}
                onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
                disabled={isSubmitting}
                placeholder={t('fieldBodyPlaceholder')}
                rows={6}
              />
            </div>

            {/* Recipients */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionRecipients')}</h3>

              {/* Mode toggle */}
              <Tabs
                value={form.recipientMode}
                onValueChange={(v) => {
                  setForm((prev) => ({
                    ...prev,
                    recipientMode: v as RecipientMode,
                    selectedEmployeeIds: [],
                    selectedDepartmentIds: [],
                    allConfirmed: false,
                  }))
                  setResolvedDeptEmployeeIds([])
                }}
              >
                <TabsList className="w-full">
                  <TabsTrigger value="individual" className="flex-1">
                    {t('recipientModeIndividual')}
                  </TabsTrigger>
                  <TabsTrigger value="department" className="flex-1">
                    {t('recipientModeDepartment')}
                  </TabsTrigger>
                  <TabsTrigger value="all" className="flex-1">
                    {t('recipientModeAll')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Individual mode */}
              {form.recipientMode === 'individual' && (
                <div className="space-y-3">
                  <Select
                    value=""
                    onValueChange={handleAddEmployee}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectEmployees')} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableEmployees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName} ({emp.personnelNumber})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {form.selectedEmployeeIds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {form.selectedEmployeeIds.map((id) => (
                        <Badge key={id} variant="secondary" className="gap-1">
                          {getEmployeeName(id)}
                          <button
                            type="button"
                            onClick={() => handleRemoveEmployee(id)}
                            className="ml-1 hover:text-destructive"
                            disabled={isSubmitting}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Department mode */}
              {form.recipientMode === 'department' && (
                <div className="space-y-3">
                  <Select
                    value=""
                    onValueChange={handleAddDepartment}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectDepartments')} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableDepartments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {form.selectedDepartmentIds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {form.selectedDepartmentIds.map((id) => (
                        <Badge key={id} variant="secondary" className="gap-1">
                          {getDepartmentName(id)}
                          <button
                            type="button"
                            onClick={() => handleRemoveDepartment(id)}
                            className="ml-1 hover:text-destructive"
                            disabled={isSubmitting}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* All mode */}
              {form.recipientMode === 'all' && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="allConfirm"
                    checked={form.allConfirmed}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, allConfirmed: !!checked }))
                    }
                    disabled={isSubmitting}
                  />
                  <Label htmlFor="allConfirm" className="text-sm">
                    {t('allEmployeesConfirm')} ({totalEmployeeCount})
                  </Label>
                </div>
              )}

              {/* Recipient count */}
              <p className="text-sm text-muted-foreground">
                {recipientCount > 0
                  ? t('recipientCount', { count: recipientCount })
                  : t('recipientCountNone')}
              </p>
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
            {isSubmitting ? t('creating') : t('createMessage')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
