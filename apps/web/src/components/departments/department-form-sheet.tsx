'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
import {
  useCreateDepartment,
  useUpdateDepartment,
  useDepartments,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Department = components['schemas']['Department']

interface DepartmentFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  department?: Department | null
  parentId?: string | null
  onSuccess?: () => void
}

interface FormState {
  name: string
  code: string
  description: string
  parentId: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  name: '',
  code: '',
  description: '',
  parentId: '',
  isActive: true,
}

export function DepartmentFormSheet({
  open,
  onOpenChange,
  department,
  parentId,
  onSuccess,
}: DepartmentFormSheetProps) {
  const t = useTranslations('adminDepartments')
  const isEdit = !!department
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  // Mutations
  const createMutation = useCreateDepartment()
  const updateMutation = useUpdateDepartment()

  // Fetch departments for parent selection
  const { data: departmentsData, isLoading: loadingDepartments } = useDepartments({
    enabled: open,
    active: true,
  })
  const departments = departmentsData?.data ?? []

  // Filter out self and descendants for parent selection (prevent circular reference)
  const availableParents = React.useMemo(() => {
    if (!isEdit) return departments
    // Simple filter: exclude self (backend will catch circular references)
    return departments.filter((d) => d.id !== department?.id)
  }, [departments, department, isEdit])

  function validateForm(formData: FormState): string[] {
    const errors: string[] = []

    if (!formData.name.trim()) {
      errors.push(t('validationNameRequired'))
    }

    if (!formData.code.trim()) {
      errors.push(t('validationCodeRequired'))
    } else if (formData.code.length > 20) {
      errors.push(t('validationCodeMaxLength'))
    }

    return errors
  }

  // Reset form when opening/closing or department changes
  React.useEffect(() => {
    if (open) {
      if (department) {
        setForm({
          name: department.name,
          code: department.code,
          description: department.description || '',
          parentId: department.parent_id || '',
          isActive: department.is_active ?? true,
        })
      } else {
        setForm({
          ...INITIAL_STATE,
          parentId: parentId || '',
        })
      }
      setError(null)
    }
  }, [open, department, parentId])

  const handleSubmit = async () => {
    setError(null)

    const errors = validateForm(form)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && department) {
        await updateMutation.mutateAsync({
          path: { id: department.id },
          body: {
            name: form.name.trim(),
            code: form.code.trim(),
            description: form.description.trim() || undefined,
            parent_id: form.parentId || undefined,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            name: form.name.trim(),
            code: form.code.trim(),
            description: form.description.trim() || undefined,
            parent_id: form.parentId || undefined,
          },
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? t(isEdit ? 'updateError' : 'createError')
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
          <SheetTitle>{isEdit ? t('editTitle') : t('newTitle')}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? t('editDescription')
              : t('newDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionBasicInformation')}</h3>

              <div className="space-y-2">
                <Label htmlFor="name">{t('fieldName')} *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('fieldNamePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">{t('fieldCode')} *</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                  }
                  disabled={isSubmitting}
                  placeholder={t('fieldCodePlaceholder')}
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground">
                  {t('fieldCodeHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('fieldDescription')}</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('fieldDescriptionPlaceholder')}
                  rows={3}
                />
              </div>
            </div>

            {/* Hierarchy */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionHierarchy')}</h3>

              <div className="space-y-2">
                <Label>{t('fieldParentDepartment')}</Label>
                <Select
                  value={form.parentId || '__none__'}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, parentId: value === '__none__' ? '' : value }))
                  }
                  disabled={isSubmitting || loadingDepartments}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectParentPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('noParentRootLevel')}</SelectItem>
                    {availableParents.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name} ({dept.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status (only for edit) */}
            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('sectionStatus')}</h3>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">{t('statusActive')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('inactiveDepartmentsHint')}
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
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('createDepartment')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
