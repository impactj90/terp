'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  useCreateBillingRecurringInvoice,
  useUpdateBillingRecurringInvoice,
  useBillingRecurringInvoice,
  useCrmAddresses,
} from '@/hooks'
import { RecurringPositionEditor, type PositionTemplate } from './recurring-position-editor'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'

const INTERVALS = [
  { value: 'MONTHLY', key: 'intervalMonthly' },
  { value: 'QUARTERLY', key: 'intervalQuarterly' },
  { value: 'SEMI_ANNUALLY', key: 'intervalSemiAnnually' },
  { value: 'ANNUALLY', key: 'intervalAnnually' },
]

interface RecurringFormProps {
  editId?: string
}

export function RecurringForm({ editId }: RecurringFormProps) {
  const t = useTranslations('billingRecurring')
  const tc = useTranslations('common')
  const tDoc = useTranslations('billingDocuments')
  const router = useRouter()
  const createMutation = useCreateBillingRecurringInvoice()
  const updateMutation = useUpdateBillingRecurringInvoice()
  const { data: existingData } = useBillingRecurringInvoice(editId ?? '', !!editId)

  const [name, setName] = React.useState('')
  const [addressId, setAddressId] = React.useState('')
  const [contactId, setContactId] = React.useState('')
  const [interval, setInterval] = React.useState('MONTHLY')
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')
  const [autoGenerate, setAutoGenerate] = React.useState(false)
  const [deliveryType, setDeliveryType] = React.useState('')
  const [deliveryTerms, setDeliveryTerms] = React.useState('')
  const [paymentTermDays, setPaymentTermDays] = React.useState('')
  const [discountPercent, setDiscountPercent] = React.useState('')
  const [discountDays, setDiscountDays] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [internalNotes, setInternalNotes] = React.useState('')
  const [positions, setPositions] = React.useState<PositionTemplate[]>([
    { type: 'FREE', description: '', quantity: 1, unit: 'Stk', unitPrice: 0, vatRate: 19 },
  ])

  // Load addresses for selection
  const { data: addressData } = useCrmAddresses({ pageSize: 100 })

  // Populate form when editing
  React.useEffect(() => {
    if (editId && existingData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = existingData as any
      setName(d.name || '')
      setAddressId(d.addressId || '')
      setContactId(d.contactId || '')
      setInterval(d.interval || 'MONTHLY')
      setStartDate(d.startDate ? new Date(d.startDate).toISOString().slice(0, 10) : '')
      setEndDate(d.endDate ? new Date(d.endDate).toISOString().slice(0, 10) : '')
      setAutoGenerate(d.autoGenerate ?? false)
      setDeliveryType(d.deliveryType || '')
      setDeliveryTerms(d.deliveryTerms || '')
      setPaymentTermDays(d.paymentTermDays?.toString() || '')
      setDiscountPercent(d.discountPercent?.toString() || '')
      setDiscountDays(d.discountDays?.toString() || '')
      setNotes(d.notes || '')
      setInternalNotes(d.internalNotes || '')
      if (Array.isArray(d.positionTemplate)) {
        setPositions(d.positionTemplate as PositionTemplate[])
      }
    }
  }, [editId, !!existingData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error(t('nameRequired'))
      return
    }
    if (!addressId) {
      toast.error(t('addressRequired'))
      return
    }
    if (!startDate) {
      toast.error(t('startDateRequired'))
      return
    }
    if (positions.length === 0) {
      toast.error(t('positionsRequired'))
      return
    }

    const payload = {
      name: name.trim(),
      addressId,
      contactId: contactId || undefined,
      interval: interval as "MONTHLY" | "QUARTERLY" | "SEMI_ANNUALLY" | "ANNUALLY",
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : undefined,
      autoGenerate,
      deliveryType: deliveryType || undefined,
      deliveryTerms: deliveryTerms || undefined,
      paymentTermDays: paymentTermDays ? parseInt(paymentTermDays) : undefined,
      discountPercent: discountPercent ? parseFloat(discountPercent) : undefined,
      discountDays: discountDays ? parseInt(discountDays) : undefined,
      notes: notes || undefined,
      internalNotes: internalNotes || undefined,
      positionTemplate: positions,
    }

    try {
      if (editId) {
        await updateMutation.mutateAsync({ id: editId, ...payload })
        toast.success(t('templateUpdated'))
        router.push(`/orders/recurring/${editId}`)
      } else {
        const result = await createMutation.mutateAsync(payload)
        toast.success(t('templateCreated'))
        if (result?.id) {
          router.push(`/orders/recurring/${result.id}`)
        } else {
          router.push('/orders/recurring')
        }
      }
    } catch {
      toast.error(t('saveError'))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tc('goBack')}</TooltipContent>
        </Tooltip>
        <h2 className="text-2xl font-bold">
          {editId ? t('editTemplate') : t('newRecurringInvoice')}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header Data */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{tDoc('headerData')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rec-name">{t('nameLabel')}</Label>
                <Input
                  id="rec-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('namePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rec-address">{t('customerAddressLabel')}</Label>
                <Select value={addressId} onValueChange={setAddressId}>
                  <SelectTrigger id="rec-address">
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
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rec-interval">{t('intervalLabel')}</Label>
                <Select value={interval} onValueChange={setInterval}>
                  <SelectTrigger id="rec-interval">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVALS.map((i) => (
                      <SelectItem key={i.value} value={i.value}>
                        {t(i.key as Parameters<typeof t>[0])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rec-start">{t('startDateLabel')}</Label>
                <Input
                  id="rec-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rec-end">{t('endDateLabel')}</Label>
                <Input
                  id="rec-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="rec-auto"
                checked={autoGenerate}
                onCheckedChange={(v) => setAutoGenerate(v === true)}
              />
              <Label htmlFor="rec-auto">{t('autoGenerateLabel')}</Label>
            </div>
          </CardContent>
        </Card>

        {/* Terms */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{tDoc('terms')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rec-payment">{t('paymentTermDays')}</Label>
                <Input
                  id="rec-payment"
                  type="number"
                  value={paymentTermDays}
                  onChange={(e) => setPaymentTermDays(e.target.value)}
                  placeholder={tDoc('paymentTermPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rec-discount-pct">{t('discountPercent')}</Label>
                <Input
                  id="rec-discount-pct"
                  type="number"
                  step="0.01"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  placeholder={t('discountPercentPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rec-discount-days">{t('discountDaysLabel')}</Label>
                <Input
                  id="rec-discount-days"
                  type="number"
                  value={discountDays}
                  onChange={(e) => setDiscountDays(e.target.value)}
                  placeholder={t('discountDaysPlaceholder')}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rec-delivery-type">{tDoc('deliveryType')}</Label>
                <Input
                  id="rec-delivery-type"
                  value={deliveryType}
                  onChange={(e) => setDeliveryType(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rec-delivery-terms">{tDoc('deliveryTerms')}</Label>
                <Input
                  id="rec-delivery-terms"
                  value={deliveryTerms}
                  onChange={(e) => setDeliveryTerms(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Positions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('positions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <RecurringPositionEditor positions={positions} onChange={setPositions} />
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('notesSection')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rec-notes">{t('notesLabel')}</Label>
              <Textarea
                id="rec-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rec-internal">{t('internalNotesLabel')}</Label>
              <Textarea
                id="rec-internal"
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {t('save')}
          </Button>
        </div>
      </form>
    </div>
  )
}
