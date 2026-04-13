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
import { Checkbox } from '@/components/ui/checkbox'
import {
  useCreateCrmAddress,
  useUpdateCrmAddress,
  useBillingPriceLists,
  useSetCustomerDunningBlock,
} from '@/hooks'

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
  leitwegId: string
  paymentTermDays: string
  discountPercent: string
  discountDays: string
  discountGroup: string
  ourCustomerNumber: string
  salesPriceListId: string
  purchasePriceListId: string
  notes: string
  dunningBlocked: boolean
  dunningBlockReason: string
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
  leitwegId: '',
  paymentTermDays: '',
  discountPercent: '',
  discountDays: '',
  discountGroup: '',
  ourCustomerNumber: '',
  salesPriceListId: '',
  purchasePriceListId: '',
  notes: '',
  dunningBlocked: false,
  dunningBlockReason: '',
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
    leitwegId: string | null
    paymentTermDays: number | null
    discountPercent: number | null
    discountDays: number | null
    discountGroup: string | null
    ourCustomerNumber: string | null
    salesPriceListId: string | null
    purchasePriceListId: string | null
    notes: string | null
    dunningBlocked?: boolean | null
    dunningBlockReason?: string | null
  } | null
  onSuccess?: () => void
}

export function AddressFormSheet({ open, onOpenChange, address, onSuccess }: AddressFormSheetProps) {
  const t = useTranslations('crmAddresses')
  const isEdit = !!address

  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)
  const { data: salesPriceListsData } = useBillingPriceLists({ type: 'sales', enabled: open })
  const { data: purchasePriceListsData } = useBillingPriceLists({ type: 'purchase', enabled: open })

  const createMutation = useCreateCrmAddress()
  const updateMutation = useUpdateCrmAddress()
  const setDunningBlockMutation = useSetCustomerDunningBlock()
  const isSubmitting =
    createMutation.isPending ||
    updateMutation.isPending ||
    setDunningBlockMutation.isPending

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
          leitwegId: address.leitwegId || '',
          paymentTermDays: address.paymentTermDays?.toString() || '',
          discountPercent: address.discountPercent?.toString() || '',
          discountDays: address.discountDays?.toString() || '',
          discountGroup: address.discountGroup || '',
          ourCustomerNumber: address.ourCustomerNumber || '',
          salesPriceListId: address.salesPriceListId || '',
          purchasePriceListId: address.purchasePriceListId || '',
          notes: address.notes || '',
          dunningBlocked: address.dunningBlocked === true,
          dunningBlockReason: address.dunningBlockReason || '',
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
        leitwegId: form.leitwegId.trim() || undefined,
        paymentTermDays: form.paymentTermDays ? parseInt(form.paymentTermDays, 10) : undefined,
        discountPercent: form.discountPercent ? parseFloat(form.discountPercent) : undefined,
        discountDays: form.discountDays ? parseInt(form.discountDays, 10) : undefined,
        discountGroup: form.discountGroup.trim() || undefined,
        ourCustomerNumber: form.ourCustomerNumber.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }

      if (isEdit) {
        await updateMutation.mutateAsync({
          id: address!.id,
          ...payload,
          salesPriceListId: form.salesPriceListId || null,
          purchasePriceListId: form.purchasePriceListId || null,
        })

        const previousBlocked = address?.dunningBlocked === true
        const previousReason = address?.dunningBlockReason ?? ''
        const blockChanged =
          previousBlocked !== form.dunningBlocked ||
          (form.dunningBlocked && previousReason !== form.dunningBlockReason)
        if (blockChanged) {
          await setDunningBlockMutation.mutateAsync({
            customerAddressId: address!.id,
            blocked: form.dunningBlocked,
            reason: form.dunningBlocked
              ? form.dunningBlockReason.trim() || undefined
              : undefined,
          })
        }
      } else {
        await createMutation.mutateAsync({
          ...payload,
          salesPriceListId: form.salesPriceListId || null,
          purchasePriceListId: form.purchasePriceListId || null,
        })
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

        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
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
              <div className="space-y-2">
                <Label htmlFor="leitwegId">Leitweg-ID</Label>
                <Input
                  id="leitwegId"
                  value={form.leitwegId}
                  onChange={(e) => updateField('leitwegId', e.target.value)}
                  disabled={isSubmitting}
                  placeholder="991-12345-67"
                />
                <p className="text-xs text-muted-foreground">Für XRechnung an öffentliche Auftraggeber</p>
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

            {/* Supplier Data — only for SUPPLIER or BOTH */}
            {(form.type === 'SUPPLIER' || form.type === 'BOTH') && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('sectionSupplier')}</h3>
                <div className="space-y-2">
                  <Label htmlFor="ourCustomerNumber">{t('labelOurCustomerNumber')}</Label>
                  <Input
                    id="ourCustomerNumber"
                    value={form.ourCustomerNumber}
                    onChange={(e) => updateField('ourCustomerNumber', e.target.value)}
                    disabled={isSubmitting}
                    maxLength={50}
                    placeholder="z.B. KD-12345"
                  />
                </div>
              </div>
            )}

            {/* Price Lists */}
            {(salesPriceListsData?.items?.length || purchasePriceListsData?.items?.length) ? (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('sectionPriceList')}</h3>

                {/* Sales Price List */}
                {salesPriceListsData?.items && salesPriceListsData.items.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="salesPriceListId">{t('labelSalesPriceList')}</Label>
                    <Select
                      value={form.salesPriceListId || '_none'}
                      onValueChange={(v) => updateField('salesPriceListId', v === '_none' ? '' : v)}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="salesPriceListId">
                        <SelectValue placeholder={t('labelPriceListPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">{t('labelNoPriceList')}</SelectItem>
                        {salesPriceListsData.items.map((pl) => (
                          <SelectItem key={pl.id} value={pl.id}>
                            {pl.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Purchase Price List — only for suppliers */}
                {(form.type === 'SUPPLIER' || form.type === 'BOTH') &&
                  purchasePriceListsData?.items && purchasePriceListsData.items.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="purchasePriceListId">{t('labelPurchasePriceList')}</Label>
                    <Select
                      value={form.purchasePriceListId || '_none'}
                      onValueChange={(v) => updateField('purchasePriceListId', v === '_none' ? '' : v)}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="purchasePriceListId">
                        <SelectValue placeholder={t('labelPriceListPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">{t('labelNoPriceList')}</SelectItem>
                        {purchasePriceListsData.items.map((pl) => (
                          <SelectItem key={pl.id} value={pl.id}>
                            {pl.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ) : null}

            {/* Dunning Block — only in edit mode (block toggles act on existing address) */}
            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t('sectionDunningBlock')}
                </h3>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="dunningBlocked"
                    checked={form.dunningBlocked}
                    onCheckedChange={(v) => updateField('dunningBlocked', v === true)}
                    disabled={isSubmitting}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="dunningBlocked" className="text-sm">
                      {t('labelDunningBlocked')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('hintDunningBlocked')}
                    </p>
                  </div>
                </div>
                {form.dunningBlocked && (
                  <div className="space-y-2">
                    <Label htmlFor="dunningBlockReason">
                      {t('labelDunningBlockReason')}
                    </Label>
                    <Textarea
                      id="dunningBlockReason"
                      value={form.dunningBlockReason}
                      onChange={(e) =>
                        updateField('dunningBlockReason', e.target.value)
                      }
                      disabled={isSubmitting}
                      rows={2}
                      maxLength={500}
                    />
                  </div>
                )}
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
