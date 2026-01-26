'use client'

import * as React from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
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
import { useCreateAbsenceType, useUpdateAbsenceType } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type AbsenceType = components['schemas']['AbsenceType']

interface AbsenceTypeFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  absenceType?: AbsenceType | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  category: string
  color: string
  isPaid: boolean
  affectsVacationBalance: boolean
  requiresApproval: boolean
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  category: 'vacation',
  color: '#808080',
  isPaid: true,
  affectsVacationBalance: false,
  requiresApproval: true,
  isActive: true,
}

const CATEGORY_OPTIONS = [
  { value: 'vacation', label: 'Vacation' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'personal', label: 'Personal Leave' },
  { value: 'unpaid', label: 'Unpaid Leave' },
]

function validateForm(form: FormState): string[] {
  const errors: string[] = []

  if (!form.code.trim()) {
    errors.push('Code is required')
  } else if (form.code.length > 20) {
    errors.push('Code must be 20 characters or less')
  }

  if (!form.name.trim()) {
    errors.push('Name is required')
  } else if (form.name.length > 255) {
    errors.push('Name must be 255 characters or less')
  }

  if (form.color && !/^#[0-9A-Fa-f]{6}$/.test(form.color)) {
    errors.push('Color must be a valid hex color (e.g. #FF0000)')
  }

  return errors
}

export function AbsenceTypeFormSheet({
  open,
  onOpenChange,
  absenceType,
  onSuccess,
}: AbsenceTypeFormSheetProps) {
  const isEdit = !!absenceType
  const isSystem = absenceType?.is_system ?? false
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  // Mutations
  const createMutation = useCreateAbsenceType()
  const updateMutation = useUpdateAbsenceType()

  // Reset form when opening/closing or absenceType changes
  React.useEffect(() => {
    if (open) {
      if (absenceType) {
        setForm({
          code: absenceType.code || '',
          name: absenceType.name || '',
          description: absenceType.description || '',
          category: absenceType.category || 'vacation',
          color: absenceType.color || '#808080',
          isPaid: absenceType.is_paid ?? true,
          affectsVacationBalance: absenceType.affects_vacation_balance ?? false,
          requiresApproval: absenceType.requires_approval ?? true,
          isActive: absenceType.is_active ?? true,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, absenceType])

  const handleSubmit = async () => {
    setError(null)

    const errors = validateForm(form)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && absenceType) {
        await updateMutation.mutateAsync({
          path: { id: absenceType.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            category: form.category as 'vacation' | 'sick' | 'personal' | 'unpaid' | 'holiday' | 'other',
            color: form.color,
            is_paid: form.isPaid,
            affects_vacation_balance: form.affectsVacationBalance,
            requires_approval: form.requiresApproval,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            category: form.category as 'vacation' | 'sick' | 'personal' | 'unpaid' | 'holiday' | 'other',
            color: form.color,
            is_paid: form.isPaid,
            affects_vacation_balance: form.affectsVacationBalance,
            requires_approval: form.requiresApproval,
          },
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? `Failed to ${isEdit ? 'update' : 'create'} absence type`
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
          <SheetTitle>{isEdit ? 'Edit Absence Type' : 'New Absence Type'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update absence type configuration.'
              : 'Create a new absence type for your organization.'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* System type warning */}
            {isSystem && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This is a system absence type. Some fields cannot be modified.
                </AlertDescription>
              </Alert>
            )}

            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Basic Information</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Code *</Label>
                  <Input
                    id="code"
                    value={form.code}
                    onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    disabled={isSubmitting || isSystem || isEdit}
                    placeholder="VAC"
                    maxLength={20}
                  />
                  <p className="text-xs text-muted-foreground">
                    Short identifier (e.g., U=vacation, K=illness)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="color">Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="color"
                      value={form.color}
                      onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
                      disabled={isSubmitting}
                      placeholder="#808080"
                      maxLength={7}
                      className="flex-1"
                    />
                    <div
                      className="h-9 w-9 rounded-md border"
                      style={{ backgroundColor: form.color || '#808080' }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder="Vacation"
                  maxLength={255}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder="Optional description for this absence type"
                  rows={3}
                />
              </div>
            </div>

            {/* Category */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Category</h3>

              <div className="space-y-2">
                <Label>Category *</Label>
                <Select
                  value={form.category}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Behavior */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Behavior</h3>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isPaid">Paid Absence</Label>
                  <p className="text-xs text-muted-foreground">
                    Credits regular working time when absent
                  </p>
                </div>
                <Switch
                  id="isPaid"
                  checked={form.isPaid}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, isPaid: checked }))
                  }
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="affectsVacationBalance">Deducts Vacation</Label>
                  <p className="text-xs text-muted-foreground">
                    Deduct from employee vacation balance
                  </p>
                </div>
                <Switch
                  id="affectsVacationBalance"
                  checked={form.affectsVacationBalance}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, affectsVacationBalance: checked }))
                  }
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="requiresApproval">Requires Approval</Label>
                  <p className="text-xs text-muted-foreground">
                    Absence requests need manager approval
                  </p>
                </div>
                <Switch
                  id="requiresApproval"
                  checked={form.requiresApproval}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, requiresApproval: checked }))
                  }
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Status (edit only) */}
            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">Status</h3>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">Active</Label>
                    <p className="text-xs text-muted-foreground">
                      Inactive types cannot be used for new absences
                    </p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={form.isActive}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, isActive: checked }))
                    }
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            )}

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
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
