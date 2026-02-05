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
  Select,
  SelectContent,
  SelectItem,
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
  useCreateContactType,
  useUpdateContactType,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type ContactType = components['schemas']['ContactType']

interface ContactTypeFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactType?: ContactType | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  dataType: 'text' | 'email' | 'phone' | 'url'
  description: string
  sortOrder: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  dataType: 'text',
  description: '',
  sortOrder: '',
  isActive: true,
}

export function ContactTypeFormSheet({
  open,
  onOpenChange,
  contactType,
  onSuccess,
}: ContactTypeFormSheetProps) {
  const t = useTranslations('adminContactTypes')
  const isEdit = !!contactType
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateContactType()
  const updateMutation = useUpdateContactType()

  React.useEffect(() => {
    if (open) {
      if (contactType) {
        setForm({
          code: contactType.code || '',
          name: contactType.name || '',
          dataType: contactType.data_type || 'text',
          description: contactType.description || '',
          sortOrder: contactType.sort_order !== undefined && contactType.sort_order !== null
            ? String(contactType.sort_order)
            : '',
          isActive: contactType.is_active ?? true,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, contactType])

  function validateForm(formData: FormState): string[] {
    const errors: string[] = []

    if (!formData.code.trim()) {
      errors.push(t('validationCodeRequired'))
    } else if (formData.code.length > 50) {
      errors.push(t('validationCodeMaxLength'))
    }

    if (!formData.name.trim()) {
      errors.push(t('validationNameRequired'))
    }

    if (!formData.dataType) {
      errors.push(t('validationDataTypeRequired'))
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
      if (isEdit && contactType) {
        await updateMutation.mutateAsync({
          path: { id: contactType.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            is_active: form.isActive,
            sort_order: form.sortOrder ? parseInt(form.sortOrder, 10) : undefined,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            data_type: form.dataType,
            description: form.description.trim() || undefined,
            sort_order: form.sortOrder ? parseInt(form.sortOrder, 10) : undefined,
          },
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? t(isEdit ? 'failedUpdateType' : 'failedCreateType')
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
          <SheetTitle>{isEdit ? t('editType') : t('newType')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editTypeDescription') : t('createTypeDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionBasicInfo')}</h3>

              <div className="space-y-2">
                <Label htmlFor="code">{t('fieldCode')} *</Label>
                <Input
                  id="code"
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
                <Label htmlFor="name">{t('fieldName')} *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('namePlaceholder')}
                  maxLength={255}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataType">{t('fieldDataType')} *</Label>
                <Select
                  value={form.dataType}
                  onValueChange={(value: 'text' | 'email' | 'phone' | 'url') =>
                    setForm((prev) => ({ ...prev, dataType: value }))
                  }
                  disabled={isSubmitting || isEdit}
                >
                  <SelectTrigger id="dataType">
                    <SelectValue placeholder={t('dataTypePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">{t('dataTypeText')}</SelectItem>
                    <SelectItem value="email">{t('dataTypeEmail')}</SelectItem>
                    <SelectItem value="phone">{t('dataTypePhone')}</SelectItem>
                    <SelectItem value="url">{t('dataTypeUrl')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('dataTypeHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('fieldDescription')}</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('descriptionPlaceholder')}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sortOrder">{t('fieldSortOrder')}</Label>
                <Input
                  id="sortOrder"
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
                    <Label htmlFor="isActive">{t('fieldActive')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('fieldActiveDescription')}
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
            {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
