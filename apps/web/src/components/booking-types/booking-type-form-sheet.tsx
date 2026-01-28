'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
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
import { useCreateBookingType, useUpdateBookingType } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type BookingType = components['schemas']['BookingType']

type Direction = 'in' | 'out'

interface BookingTypeFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingType?: BookingType | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  direction: Direction | ''
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  direction: '',
  isActive: true,
}

const DIRECTION_OPTIONS = [
  { value: 'in', labelKey: 'directionIn' },
  { value: 'out', labelKey: 'directionOut' },
] as const

export function BookingTypeFormSheet({
  open,
  onOpenChange,
  bookingType,
  onSuccess,
}: BookingTypeFormSheetProps) {
  const t = useTranslations('adminBookingTypes')
  const isEdit = !!bookingType
  const isSystem = bookingType?.is_system ?? false
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateBookingType()
  const updateMutation = useUpdateBookingType()

  React.useEffect(() => {
    if (!open) return

    if (bookingType) {
      setForm({
        code: bookingType.code || '',
        name: bookingType.name || '',
        description: bookingType.description || '',
        direction: (bookingType.direction as Direction) || '',
        isActive: bookingType.is_active ?? true,
      })
    } else {
      setForm(INITIAL_STATE)
    }
    setError(null)
  }, [open, bookingType])

  const handleSubmit = async () => {
    setError(null)

    const errors: string[] = []
    if (!form.code.trim()) errors.push(t('validationCodeRequired'))
    else if (form.code.trim().length > 20) errors.push(t('validationCodeMaxLength'))
    if (!form.name.trim()) errors.push(t('validationNameRequired'))
    else if (form.name.trim().length > 255) errors.push(t('validationNameMaxLength'))
    if (!form.direction) errors.push(t('validationDirectionRequired'))

    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && bookingType) {
        await updateMutation.mutateAsync({
          path: { id: bookingType.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            direction: form.direction as Direction,
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

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editBookingType') : t('newBookingType')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editDescription') : t('createDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {isSystem && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{t('systemTypeWarning')}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionBasicInfo')}</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">{t('fieldCode')} *</Label>
                  <Input
                    id="code"
                    value={form.code}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                    }
                    disabled={isSubmitting || isSystem || isEdit}
                    placeholder={t('codePlaceholder')}
                    maxLength={20}
                  />
                  <p className="text-xs text-muted-foreground">{t('codeHint')}</p>
                </div>

                <div className="space-y-2">
                  <Label>{t('fieldDirection')} *</Label>
                  <Select
                    value={form.direction}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, direction: value as Direction }))
                    }
                    disabled={isSubmitting || isSystem || isEdit}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectDirection')} />
                    </SelectTrigger>
                    <SelectContent>
                      {DIRECTION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {t(option.labelKey as Parameters<typeof t>[0])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                <Label htmlFor="description">{t('fieldDescription')}</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  disabled={isSubmitting}
                  placeholder={t('descriptionPlaceholder')}
                  rows={3}
                />
              </div>
            </div>

            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('sectionStatus')}</h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">{t('fieldActive')}</Label>
                    <p className="text-xs text-muted-foreground">{t('fieldActiveDescription')}</p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={form.isActive}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, isActive: checked }))
                    }
                    disabled={isSubmitting || isSystem}
                  />
                </div>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="flex-1"
          >
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
