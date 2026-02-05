'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  useCreateContactKind,
  useUpdateContactKind,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type ContactType = components['schemas']['ContactType']
type ContactKind = components['schemas']['ContactKind']

interface ContactKindFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactKind?: ContactKind | null
  contactType: ContactType
  onSuccess?: () => void
}

interface FormState {
  code: string
  label: string
  sortOrder: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  label: '',
  sortOrder: '',
  isActive: true,
}

export function ContactKindFormSheet({
  open,
  onOpenChange,
  contactKind,
  contactType,
  onSuccess,
}: ContactKindFormSheetProps) {
  const t = useTranslations('adminContactTypes')
  const isEdit = !!contactKind
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateContactKind()
  const updateMutation = useUpdateContactKind()

  React.useEffect(() => {
    if (open) {
      if (contactKind) {
        setForm({
          code: contactKind.code || '',
          label: contactKind.label || '',
          sortOrder: contactKind.sort_order !== undefined && contactKind.sort_order !== null
            ? String(contactKind.sort_order)
            : '',
          isActive: contactKind.is_active ?? true,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, contactKind])

  function validateForm(formData: FormState): string[] {
    const errors: string[] = []

    if (!formData.code.trim()) {
      errors.push(t('validationCodeRequired'))
    } else if (formData.code.length > 50) {
      errors.push(t('validationCodeMaxLength'))
    }

    if (!formData.label.trim()) {
      errors.push(t('validationLabelRequired'))
    }

    return errors
  }

  const handleSubmit = async () => {
    setError(null)

    const errors = validateForm(form)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && contactKind) {
        await updateMutation.mutateAsync({
          path: { id: contactKind.id },
          body: {
            label: form.label.trim(),
            is_active: form.isActive,
            sort_order: form.sortOrder ? parseInt(form.sortOrder, 10) : undefined,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            contact_type_id: contactType.id,
            code: form.code.trim(),
            label: form.label.trim(),
            sort_order: form.sortOrder ? parseInt(form.sortOrder, 10) : undefined,
          },
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? t(isEdit ? 'failedUpdateKind' : 'failedCreateKind')
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
          <SheetTitle>{isEdit ? t('editKind') : t('newKind')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editKindDescription') : t('createKindDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionBasicInfo')}</h3>

              <div className="space-y-2">
                <Label>{t('fieldContactType')}</Label>
                <Input
                  value={contactType.name}
                  disabled
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="kindCode">{t('fieldCode')} *</Label>
                <Input
                  id="kindCode"
                  value={form.code}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                  }
                  disabled={isSubmitting || isEdit}
                  placeholder={t('codePlaceholder')}
                  maxLength={50}
                />
                <p className="text-xs text-muted-foreground">
                  {t('codeHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="kindLabel">{t('fieldLabel')} *</Label>
                <Input
                  id="kindLabel"
                  value={form.label}
                  onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('labelPlaceholder')}
                  maxLength={255}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="kindSortOrder">{t('fieldSortOrder')}</Label>
                <Input
                  id="kindSortOrder"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('sortOrderPlaceholder')}
                />
              </div>
            </div>

            {/* Status (only for edit) */}
            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('sectionStatus')}</h3>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="kindIsActive">{t('fieldActive')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('fieldActiveDescription')}
                    </p>
                  </div>
                  <Switch
                    id="kindIsActive"
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
            {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
