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
import { useCreateCrmAddress, useUpdateCrmAddress, useBillingPriceLists } from '@/hooks'

interface FormState {
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH'
  company: string
  matchCode: string
  street: string
  zip: string
  city: string
  country: string
  phone: string
  fax: string
  email: string
  website: string
  taxNumber: string
  vatId: string
  paymentTermDays: string
  discountPercent: string
  discountDays: string
  discountGroup: string
  priceListId: string
  notes: string
}

const INITIAL_STATE: FormState = {
  type: 'CUSTOMER',
  company: '',
  matchCode: '',
  street: '',
  zip: '',
  city: '',
  country: 'DE',
  phone: '',
  fax: '',
  email: '',
  website: '',
  taxNumber: '',
  vatId: '',
  paymentTermDays: '',
  discountPercent: '',
  discountDays: '',
  discountGroup: '',
  priceListId: '',
  notes: '',
}

interface AddressFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  address?: {
    id: string
    type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH'
    company: string
    matchCode: string | null
    street: string | null
    zip: string | null
    city: string | null
    country: string | null
    phone: string | null
    fax: string | null
    email: string | null
    website: string | null
    taxNumber: string | null
    vatId: string | null
    paymentTermDays: number | null
    discountPercent: number | null
    discountDays: number | null
    discountGroup: string | null
    priceListId: string | null
    notes: string | null
  } | null
  onSuccess?: () => void
}

export function AddressFormSheet({ open, onOpenChange, address, onSuccess }: AddressFormSheetProps) {
  const t = useTranslations('crmAddresses')
  const isEdit = !!address

  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)
  const { data: priceListsData } = useBillingPriceLists({ enabled: open })

  const createMutation = useCreateCrmAddress()
  const updateMutation = useUpdateCrmAddress()
  const isSubmitting = createMutation.isPending || updateMutation.isPending

  React.useEffect(() => {
    if (open) {
      setError(null)
      if (address) {
        setForm({
          type: address.type,
          company: address.company,
          matchCode: address.matchCode || '',
          street: address.street || '',
          zip: address.zip || '',
          city: address.city || '',
          country: address.country || 'DE',
          phone: address.phone || '',
          fax: address.fax || '',
          email: address.email || '',
          website: address.website || '',
          taxNumber: address.taxNumber || '',
          vatId: address.vatId || '',
          paymentTermDays: address.paymentTermDays?.toString() || '',
          discountPercent: address.discountPercent?.toString() || '',
          discountDays: address.discountDays?.toString() || '',
          discountGroup: address.discountGroup || '',
          priceListId: address.priceListId || '',
          notes: address.notes || '',
        })
      } else {
        setForm(INITIAL_STATE)
      }
    }
  }, [open, address])

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false)
    }
  }

  const handleSubmit = async () => {
    setError(null)

    if (!form.company.trim()) {
      setError(t('labelCompany') + ' is required')
      return
    }

    try {
      const payload = {
        type: form.type as 'CUSTOMER' | 'SUPPLIER' | 'BOTH',
        company: form.company.trim(),
        matchCode: form.matchCode.trim() || undefined,
        street: form.street.trim() || undefined,
        zip: form.zip.trim() || undefined,
        city: form.city.trim() || undefined,
        country: form.country.trim() || undefined,
        phone: form.phone.trim() || undefined,
        fax: form.fax.trim() || undefined,
        email: form.email.trim() || undefined,
        website: form.website.trim() || undefined,
        taxNumber: form.taxNumber.trim() || undefined,
        vatId: form.vatId.trim() || undefined,
        paymentTermDays: form.paymentTermDays ? parseInt(form.paymentTermDays, 10) : undefined,
        discountPercent: form.discountPercent ? parseFloat(form.discountPercent) : undefined,
        discountDays: form.discountDays ? parseInt(form.discountDays, 10) : undefined,
        discountGroup: form.discountGroup.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }

      if (isEdit) {
        await updateMutation.mutateAsync({
          id: address!.id,
          ...payload,
          priceListId: form.priceListId || null,
        })
      } else {
        await createMutation.mutateAsync(payload)
      }

      onOpenChange(false)
      onSuccess?.()
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
          <SheetDescription>
            {isEdit ? t('editDescription') : t('createDescription')}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionBasic')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">{t('labelType')}</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => updateField('type', v as FormState['type'])}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CUSTOMER">{t('typeCustomer')}</SelectItem>
                      <SelectItem value="SUPPLIER">{t('typeSupplier')}</SelectItem>
                      <SelectItem value="BOTH">{t('typeBoth')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="matchCode">{t('labelMatchCode')}</Label>
                  <Input
                    id="matchCode"
                    value={form.matchCode}
                    onChange={(e) => updateField('matchCode', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">{t('labelCompany')} *</Label>
                <Input
                  id="company"
                  value={form.company}
                  onChange={(e) => updateField('company', e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
            </div>

            {/* Address */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionAddress')}</h3>
              <div className="space-y-2">
                <Label htmlFor="street">{t('labelStreet')}</Label>
                <Input
                  id="street"
                  value={form.street}
                  onChange={(e) => updateField('street', e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="zip">{t('labelZip')}</Label>
                  <Input
                    id="zip"
                    value={form.zip}
                    onChange={(e) => updateField('zip', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">{t('labelCity')}</Label>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={(e) => updateField('city', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">{t('labelCountry')}</Label>
                  <Input
                    id="country"
                    value={form.country}
                    onChange={(e) => updateField('country', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>

            {/* Communication */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionCommunication')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">{t('labelPhone')}</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fax">{t('labelFax')}</Label>
                  <Input
                    id="fax"
                    value={form.fax}
                    onChange={(e) => updateField('fax', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('labelEmail')}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">{t('labelWebsite')}</Label>
                  <Input
                    id="website"
                    value={form.website}
                    onChange={(e) => updateField('website', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>

            {/* Tax Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionTax')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="taxNumber">{t('labelTaxNumber')}</Label>
                  <Input
                    id="taxNumber"
                    value={form.taxNumber}
                    onChange={(e) => updateField('taxNumber', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vatId">{t('labelVatId')}</Label>
                  <Input
                    id="vatId"
                    value={form.vatId}
                    onChange={(e) => updateField('vatId', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>

            {/* Payment Terms */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionPayment')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paymentTermDays">{t('labelPaymentTermDays')}</Label>
                  <Input
                    id="paymentTermDays"
                    type="number"
                    value={form.paymentTermDays}
                    onChange={(e) => updateField('paymentTermDays', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discountPercent">{t('labelDiscountPercent')}</Label>
                  <Input
                    id="discountPercent"
                    type="number"
                    step="0.01"
                    value={form.discountPercent}
                    onChange={(e) => updateField('discountPercent', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discountDays">{t('labelDiscountDays')}</Label>
                  <Input
                    id="discountDays"
                    type="number"
                    value={form.discountDays}
                    onChange={(e) => updateField('discountDays', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discountGroup">{t('labelDiscountGroup')}</Label>
                  <Input
                    id="discountGroup"
                    value={form.discountGroup}
                    onChange={(e) => updateField('discountGroup', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>

            {/* Price List */}
            {priceListsData?.items && priceListsData.items.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('sectionPriceList')}</h3>
                <div className="space-y-2">
                  <Label htmlFor="priceListId">{t('labelPriceList')}</Label>
                  <Select
                    value={form.priceListId || '_none'}
                    onValueChange={(v) => updateField('priceListId', v === '_none' ? '' : v)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="priceListId">
                      <SelectValue placeholder={t('labelPriceListPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">{t('labelNoPriceList')}</SelectItem>
                      {priceListsData.items.map((pl) => (
                        <SelectItem key={pl.id} value={pl.id}>
                          {pl.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionNotes')}</h3>
              <div className="space-y-2">
                <Label htmlFor="notes">{t('labelNotes')}</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>
            </div>

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
            {isSubmitting ? t('saving') : isEdit ? t('save') : t('create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
