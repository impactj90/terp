'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
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
import {
  useCreateOrderAssignment,
  useUpdateOrderAssignment,
  useEmployees,
} from '@/hooks/api'
interface OrderAssignment {
  id: string
  employeeId?: string
  employee_id?: string
  role: string
  validFrom?: Date | string | null
  valid_from?: string | null
  validTo?: Date | string | null
  valid_to?: string | null
}

interface OrderAssignmentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  assignment?: OrderAssignment | null
  onSuccess?: () => void
}

interface FormState {
  employeeId: string
  role: 'worker' | 'leader' | 'sales'
  validFrom: string
  validTo: string
}

const INITIAL_STATE: FormState = {
  employeeId: '',
  role: 'worker',
  validFrom: '',
  validTo: '',
}

export function OrderAssignmentFormDialog({
  open,
  onOpenChange,
  orderId,
  assignment,
  onSuccess,
}: OrderAssignmentFormDialogProps) {
  const t = useTranslations('adminOrders')
  const isEdit = !!assignment
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateOrderAssignment()
  const updateMutation = useUpdateOrderAssignment()
  const { data: employeesData } = useEmployees({ isActive: true, enabled: open })
  const employees = employeesData?.items ?? []

  React.useEffect(() => {
    if (open) {
      if (assignment) {
        const empId = assignment.employeeId ?? assignment.employee_id ?? ''
        const vFrom = assignment.validFrom ?? assignment.valid_from
        const vTo = assignment.validTo ?? assignment.valid_to
        setForm({
          employeeId: empId,
          role: (assignment.role as FormState['role']) || 'worker',
          validFrom: vFrom ? String(vFrom).split('T')[0] ?? '' : '',
          validTo: vTo ? String(vTo).split('T')[0] ?? '' : '',
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, assignment])

  const handleSave = async () => {
    setError(null)

    if (!form.employeeId) {
      setError(t('validationEmployeeRequired'))
      return
    }

    try {
      if (isEdit && assignment) {
        await updateMutation.mutateAsync({
          id: assignment.id,
          role: form.role,
          validFrom: form.validFrom || undefined,
          validTo: form.validTo || undefined,
        })
      } else {
        await createMutation.mutateAsync({
          orderId,
          employeeId: form.employeeId,
          role: form.role,
          validFrom: form.validFrom || undefined,
          validTo: form.validTo || undefined,
        })
      }

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('assignmentSaveError'))
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('editAssignment') : t('newAssignment')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t('fieldEmployee')} *</Label>
            <Select
              value={form.employeeId || '__none__'}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, employeeId: value === '__none__' ? '' : value }))
              }
              disabled={isPending || isEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('employeePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('selectEmployee')}</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} ({emp.personnelNumber})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('fieldRole')}</Label>
            <Select
              value={form.role}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, role: value as FormState['role'] }))
              }
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="worker">{t('roleWorker')}</SelectItem>
                <SelectItem value="leader">{t('roleLeader')}</SelectItem>
                <SelectItem value="sales">{t('roleSales')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('fieldValidFrom')}</Label>
              <Input
                type="date"
                value={form.validFrom}
                onChange={(e) => setForm((prev) => ({ ...prev, validFrom: e.target.value }))}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('fieldValidTo')}</Label>
              <Input
                type="date"
                value={form.validTo}
                onChange={(e) => setForm((prev) => ({ ...prev, validTo: e.target.value }))}
                disabled={isPending}
              />
            </div>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
