'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { SearchInput } from '@/components/ui/search-input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  useCreateBookingTypeGroup,
  useUpdateBookingTypeGroup,
  useBookingTypes,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type BookingTypeGroup = components['schemas']['BookingTypeGroup']
type BookingType = components['schemas']['BookingType']

interface BookingTypeGroupFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group?: BookingTypeGroup | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  isActive: boolean
  bookingTypeIds: Set<string>
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  isActive: true,
  bookingTypeIds: new Set(),
}

export function BookingTypeGroupFormSheet({
  open,
  onOpenChange,
  group,
  onSuccess,
}: BookingTypeGroupFormSheetProps) {
  const t = useTranslations('adminBookingTypeGroups')
  const isEdit = !!group
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)
  const [memberSearch, setMemberSearch] = React.useState('')

  const createMutation = useCreateBookingTypeGroup()
  const updateMutation = useUpdateBookingTypeGroup()

  // Fetch booking types for member selection
  const { data: bookingTypesData } = useBookingTypes({ enabled: open })
  const bookingTypes = (bookingTypesData?.data ?? []) as BookingType[]

  const filteredBookingTypes = React.useMemo(() => {
    if (!memberSearch) return bookingTypes
    const s = memberSearch.toLowerCase()
    return bookingTypes.filter(
      (bt) => bt.code?.toLowerCase().includes(s) || bt.name?.toLowerCase().includes(s)
    )
  }, [bookingTypes, memberSearch])

  React.useEffect(() => {
    if (!open) return

    if (group) {
      setForm({
        code: group.code || '',
        name: group.name || '',
        description: group.description || '',
        isActive: group.is_active ?? true,
        bookingTypeIds: new Set(group.booking_type_ids ?? []),
      })
    } else {
      setForm(INITIAL_STATE)
    }
    setError(null)
    setMemberSearch('')
  }, [open, group])

  const toggleBookingType = (id: string) => {
    setForm((prev) => {
      const next = new Set(prev.bookingTypeIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...prev, bookingTypeIds: next }
    })
  }

  const toggleAll = () => {
    setForm((prev) => {
      const allSelected = filteredBookingTypes.every((bt) => prev.bookingTypeIds.has(bt.id))
      const next = new Set(prev.bookingTypeIds)
      filteredBookingTypes.forEach((bt) => {
        if (allSelected) next.delete(bt.id)
        else next.add(bt.id)
      })
      return { ...prev, bookingTypeIds: next }
    })
  }

  const handleSubmit = async () => {
    setError(null)

    const errors: string[] = []
    if (!form.code.trim()) errors.push(t('validationCodeRequired'))
    else if (form.code.trim().length > 20) errors.push(t('validationCodeMaxLength'))
    if (!form.name.trim()) errors.push(t('validationNameRequired'))
    else if (form.name.trim().length > 255) errors.push(t('validationNameMaxLength'))

    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && group) {
        // UpdateBookingTypeGroupRequest does NOT include code (immutable after creation)
        await updateMutation.mutateAsync({
          path: { id: group.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            is_active: form.isActive,
            booking_type_ids: Array.from(form.bookingTypeIds),
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            booking_type_ids: Array.from(form.bookingTypeIds),
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
          <SheetTitle>{isEdit ? t('editGroup') : t('newGroup')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editDescription') : t('createDescription')}
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
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground">{t('codeHint')}</p>
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

            {/* Members section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionMembers')}</h3>
              <SearchInput
                value={memberSearch}
                onChange={setMemberSearch}
                placeholder={t('membersSearchPlaceholder')}
                className="w-full"
              />
              <ScrollArea className="h-48 rounded-md border p-2">
                {filteredBookingTypes.length > 0 && (
                  <div className="flex items-center gap-2 pb-2 mb-2 border-b">
                    <Checkbox
                      checked={
                        filteredBookingTypes.length > 0 &&
                        filteredBookingTypes.every((bt) => form.bookingTypeIds.has(bt.id))
                      }
                      onCheckedChange={() => toggleAll()}
                    />
                    <span className="text-xs text-muted-foreground">
                      {t('membersSelectAll', { count: filteredBookingTypes.length })}
                    </span>
                  </div>
                )}
                {filteredBookingTypes.map((bt) => (
                  <div key={bt.id} className="flex items-center gap-2 py-1">
                    <Checkbox
                      checked={form.bookingTypeIds.has(bt.id)}
                      onCheckedChange={() => toggleBookingType(bt.id)}
                    />
                    <span className="text-sm">
                      <span className="font-mono text-xs">{bt.code}</span> - {bt.name}
                    </span>
                  </div>
                ))}
                {filteredBookingTypes.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('membersNone')}
                  </p>
                )}
              </ScrollArea>
              {form.bookingTypeIds.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t('membersSelected', { count: form.bookingTypeIds.size })}
                </p>
              )}
            </div>

            {/* Status (edit only) */}
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
