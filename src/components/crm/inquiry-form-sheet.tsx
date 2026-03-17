'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import {
  useCreateCrmInquiry,
  useUpdateCrmInquiry,
  useCrmAddresses,
  useCrmContacts,
} from '@/hooks'
import { toast } from 'sonner'

interface FormState {
  title: string
  addressId: string
  contactId: string
  effort: string
  creditRating: string
  notes: string
}

const INITIAL_STATE: FormState = {
  title: '',
  addressId: '',
  contactId: '',
  effort: '',
  creditRating: '',
  notes: '',
}

interface InquiryFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  addressId?: string
  editItem?: Record<string, unknown> | null
}

export function InquiryFormSheet({
  open,
  onOpenChange,
  addressId: presetAddressId,
  editItem,
}: InquiryFormSheetProps) {
  const t = useTranslations('crmInquiries')
  const isEdit = !!editItem

  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateCrmInquiry()
  const updateMutation = useUpdateCrmInquiry()
  const isSubmitting = createMutation.isPending || updateMutation.isPending

  // Fetch addresses for address select (only when no preset addressId)
  const { data: addressData } = useCrmAddresses({
    enabled: open && !presetAddressId,
    pageSize: 100,
    isActive: true,
  })
  const addresses = (addressData?.items ?? []) as Array<{ id: string; company: string; number: string }>

  // Fetch contacts for selected address
  const selectedAddressId = form.addressId || presetAddressId
  const { data: contacts } = useCrmContacts(selectedAddressId || '', open && !!selectedAddressId)
  const contactList = (contacts ?? []) as Array<{ id: string; firstName: string; lastName: string }>

  React.useEffect(() => {
    if (open) {
      setError(null)
      if (editItem) {
        setForm({
          title: (editItem.title as string) || '',
          addressId: (editItem.addressId as string) || presetAddressId || '',
          contactId: (editItem.contactId as string) || '',
          effort: (editItem.effort as string) || '',
          creditRating: (editItem.creditRating as string) || '',
          notes: (editItem.notes as string) || '',
        })
      } else {
        setForm({
          ...INITIAL_STATE,
          addressId: presetAddressId || '',
        })
      }
    }
  }, [open, editItem, presetAddressId])

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false)
    }
  }

  const handleSubmit = async () => {
    setError(null)

    if (!form.title.trim()) {
      setError(t('inquiryTitle') + ' required')
      return
    }

    const effectiveAddressId = form.addressId || presetAddressId
    if (!effectiveAddressId && !isEdit) {
      setError(t('address') + ' required')
      return
    }

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: editItem!.id as string,
          title: form.title.trim(),
          contactId: form.contactId || null,
          effort: form.effort || null,
          creditRating: form.creditRating || null,
          notes: form.notes.trim() || null,
        })
      } else {
        await createMutation.mutateAsync({
          title: form.title.trim(),
          addressId: effectiveAddressId!,
          contactId: form.contactId || undefined,
          effort: form.effort || undefined,
          notes: form.notes.trim() || undefined,
        })
      }

      toast.success(isEdit ? t('save') : t('create'))
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    }
  }

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col overflow-hidden">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editTitle') : t('createTitle')}</SheetTitle>
          <SheetDescription>{''}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Basic Data */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('basicData')}</h3>

              <div className="space-y-2">
                <Label htmlFor="inqTitle">{t('inquiryTitle')} *</Label>
                <Input
                  id="inqTitle"
                  value={form.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              {/* Address select (hidden when preset) */}
              {!presetAddressId && (
                <div className="space-y-2">
                  <Label htmlFor="inqAddress">{t('address')} *</Label>
                  <Select
                    value={form.addressId || '_none'}
                    onValueChange={(v) => {
                      updateField('addressId', v === '_none' ? '' : v)
                      updateField('contactId', '')
                    }}
                    disabled={isSubmitting || isEdit}
                  >
                    <SelectTrigger id="inqAddress">
                      <SelectValue placeholder={t('selectAddress')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">{t('selectAddress')}</SelectItem>
                      {addresses.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.number} — {a.company}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Contact select */}
              <div className="space-y-2">
                <Label htmlFor="inqContact">{t('contact')}</Label>
                <Select
                  value={form.contactId || '_none'}
                  onValueChange={(v) => updateField('contactId', v === '_none' ? '' : v)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="inqContact">
                    <SelectValue placeholder={t('selectContact')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">{t('noContact')}</SelectItem>
                    {contactList.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.firstName} {c.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Effort */}
              <div className="space-y-2">
                <Label htmlFor="inqEffort">{t('effort')}</Label>
                <Select
                  value={form.effort || '_none'}
                  onValueChange={(v) => updateField('effort', v === '_none' ? '' : v)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="inqEffort">
                    <SelectValue placeholder={t('selectEffort')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">{t('selectEffort')}</SelectItem>
                    <SelectItem value="low">{t('effortLow')}</SelectItem>
                    <SelectItem value="medium">{t('effortMedium')}</SelectItem>
                    <SelectItem value="high">{t('effortHigh')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Additional Info (shown in edit mode) */}
            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('additionalInfo')}</h3>

                <div className="space-y-2">
                  <Label htmlFor="inqCreditRating">{t('creditRating')}</Label>
                  <Input
                    id="inqCreditRating"
                    value={form.creditRating}
                    onChange={(e) => updateField('creditRating', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inqNotes">{t('notes')}</Label>
                  <Textarea
                    id="inqNotes"
                    value={form.notes}
                    onChange={(e) => updateField('notes', e.target.value)}
                    disabled={isSubmitting}
                    rows={5}
                  />
                </div>
              </div>
            )}

            {/* Notes in create mode too */}
            {!isEdit && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="inqNotes">{t('notes')}</Label>
                  <Textarea
                    id="inqNotes"
                    value={form.notes}
                    onChange={(e) => updateField('notes', e.target.value)}
                    disabled={isSubmitting}
                    rows={3}
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
        </div>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting} className="flex-1">
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? t('save') : t('create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
