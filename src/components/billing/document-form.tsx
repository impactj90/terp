'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCreateBillingDocument } from '@/hooks'
import { useCrmAddresses } from '@/hooks'
import { useCrmInquiries } from '@/hooks'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'

const DOCUMENT_TYPES = ['OFFER', 'ORDER_CONFIRMATION', 'DELIVERY_NOTE', 'SERVICE_NOTE', 'RETURN_DELIVERY', 'INVOICE', 'CREDIT_NOTE'] as const
const DOC_TYPE_KEYS: Record<string, string> = {
  OFFER: 'typeOffer',
  ORDER_CONFIRMATION: 'typeOrderConfirmation',
  DELIVERY_NOTE: 'typeDeliveryNote',
  SERVICE_NOTE: 'typeServiceNote',
  RETURN_DELIVERY: 'typeReturnDelivery',
  INVOICE: 'typeInvoice',
  CREDIT_NOTE: 'typeCreditNote',
}

export function BillingDocumentForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const createMutation = useCreateBillingDocument()
  const t = useTranslations('billingDocuments')

  const [type, setType] = React.useState(searchParams.get('type') ?? 'OFFER')
  const [addressId, setAddressId] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [internalNotes, setInternalNotes] = React.useState('')
  const [paymentTermDays, setPaymentTermDays] = React.useState('')
  const [discountPercent, setDiscountPercent] = React.useState('')
  const [discountDays, setDiscountDays] = React.useState('')
  const [discountPercent2, setDiscountPercent2] = React.useState('')
  const [discountDays2, setDiscountDays2] = React.useState('')
  const [deliveryType, setDeliveryType] = React.useState('')
  const [deliveryTerms, setDeliveryTerms] = React.useState('')
  const [inquiryId, setInquiryId] = React.useState('')

  // Load addresses for selection
  const { data: addressData } = useCrmAddresses({ pageSize: 100 })

  // Load inquiries filtered by selected address
  const { data: inquiryData } = useCrmInquiries({
    addressId: addressId || undefined,
    pageSize: 100,
  })

  // Only show OPEN and IN_PROGRESS inquiries
  const activeInquiries = React.useMemo(
    () => (inquiryData?.items ?? []).filter(
      (inq) => inq.status === 'OPEN' || inq.status === 'IN_PROGRESS'
    ),
    [inquiryData]
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!addressId) {
      toast.error(t('selectAddressRequired'))
      return
    }

    try {
      const result = await createMutation.mutateAsync({
        type: type as "OFFER",
        addressId,
        notes: notes || undefined,
        internalNotes: internalNotes || undefined,
        paymentTermDays: paymentTermDays ? parseInt(paymentTermDays) : undefined,
        discountPercent: discountPercent ? parseFloat(discountPercent) : undefined,
        discountDays: discountDays ? parseInt(discountDays) : undefined,
        discountPercent2: discountPercent2 ? parseFloat(discountPercent2) : undefined,
        discountDays2: discountDays2 ? parseInt(discountDays2) : undefined,
        deliveryType: deliveryType || undefined,
        deliveryTerms: deliveryTerms || undefined,
        inquiryId: inquiryId && inquiryId !== 'none' ? inquiryId : undefined,
      })
      toast.success(t('documentCreated'))
      if (result?.id) {
        router.push(`/orders/documents/${result.id}`)
      } else {
        router.push('/orders/documents')
      }
    } catch {
      toast.error(t('createError'))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">{t('newDocumentTitle')}</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Type and Customer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('headerData')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">{t('documentType')}</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((val) => (
                      <SelectItem key={val} value={val}>
                        {t(DOC_TYPE_KEYS[val] as any)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressId">{t('customerAddress')}</Label>
                <Select value={addressId} onValueChange={(v) => { setAddressId(v); setInquiryId(''); }}>
                  <SelectTrigger id="addressId">
                    <SelectValue placeholder={t('selectAddress')} />
                  </SelectTrigger>
                  <SelectContent>
                    {addressData?.items?.map((addr) => (
                      <SelectItem key={addr.id} value={addr.id}>
                        {addr.company} ({addr.number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {addressId && activeInquiries.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="inquiryId">{t('inquiry')}</Label>
                <Select value={inquiryId} onValueChange={setInquiryId}>
                  <SelectTrigger id="inquiryId">
                    <SelectValue placeholder={t('selectInquiry')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('noInquiry')}</SelectItem>
                    {activeInquiries.map((inq) => (
                      <SelectItem key={inq.id} value={inq.id}>
                        {inq.number} — {inq.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Terms */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('terms')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paymentTermDays">{t('paymentTermDays')}</Label>
                <Input
                  id="paymentTermDays"
                  type="number"
                  value={paymentTermDays}
                  onChange={(e) => setPaymentTermDays(e.target.value)}
                  placeholder={t('paymentTermPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discountPercent">{t('discount1Percent')}</Label>
                <Input
                  id="discountPercent"
                  type="number"
                  step="0.01"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  placeholder={t('discount1PercentPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discountDays">{t('discount1Days')}</Label>
                <Input
                  id="discountDays"
                  type="number"
                  value={discountDays}
                  onChange={(e) => setDiscountDays(e.target.value)}
                  placeholder={t('discount1DaysPlaceholder')}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div />
              <div className="space-y-2">
                <Label htmlFor="discountPercent2">{t('discount2Percent')}</Label>
                <Input
                  id="discountPercent2"
                  type="number"
                  step="0.01"
                  value={discountPercent2}
                  onChange={(e) => setDiscountPercent2(e.target.value)}
                  placeholder={t('discount2PercentPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discountDays2">{t('discount2Days')}</Label>
                <Input
                  id="discountDays2"
                  type="number"
                  value={discountDays2}
                  onChange={(e) => setDiscountDays2(e.target.value)}
                  placeholder={t('discount2DaysPlaceholder')}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="deliveryType">{t('deliveryType')}</Label>
                <Input
                  id="deliveryType"
                  value={deliveryType}
                  onChange={(e) => setDeliveryType(e.target.value)}
                  placeholder={t('deliveryTypePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deliveryTerms">{t('deliveryTerms')}</Label>
                <Input
                  id="deliveryTerms"
                  value={deliveryTerms}
                  onChange={(e) => setDeliveryTerms(e.target.value)}
                  placeholder={t('deliveryTermsPlaceholder')}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('notes')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="notes">{t('notesExternal')}</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('notesPlaceholder')}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="internalNotes">{t('internalNotes')}</Label>
              <Textarea
                id="internalNotes"
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder={t('internalNotesPlaceholder')}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? t('creating') : t('save')}
          </Button>
        </div>
      </form>
    </div>
  )
}
