'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { useCrmAddresses, useCrmContacts } from '@/hooks/use-crm-addresses'
import {
  useCreateWhPurchaseOrder,
  useUpdateWhPurchaseOrder,
} from '@/hooks/use-wh-purchase-orders'

interface PurchaseOrderData {
  id: string
  number: string
  supplierId: string
  contactId?: string | null
  requestedDelivery?: string | Date | null
  confirmedDelivery?: string | Date | null
  notes?: string | null
  status: string
}

interface PurchaseOrderFormProps {
  purchaseOrder?: PurchaseOrderData
  onSuccess?: () => void
}

interface FormState {
  supplierId: string
  contactId: string
  requestedDelivery: string
  confirmedDelivery: string
  notes: string
}

const INITIAL_STATE: FormState = {
  supplierId: '',
  contactId: '',
  requestedDelivery: '',
  confirmedDelivery: '',
  notes: '',
}

function toDateInput(date: string | Date | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  return d.toISOString().split('T')[0] ?? ''
}

export function PurchaseOrderForm({ purchaseOrder, onSuccess }: PurchaseOrderFormProps) {
  const t = useTranslations('warehousePurchaseOrders')
  const router = useRouter()
  const isEdit = !!purchaseOrder
  const isDraft = !purchaseOrder || purchaseOrder.status === 'DRAFT'

  const createMutation = useCreateWhPurchaseOrder()
  const updateMutation = useUpdateWhPurchaseOrder()

  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)

  // Load suppliers (type SUPPLIER or BOTH)
  const { data: suppliersData } = useCrmAddresses({
    pageSize: 100,
    isActive: true,
  })

  // Filter to SUPPLIER and BOTH types
  const suppliers = React.useMemo(() => {
    if (!suppliersData?.items) return []
    return suppliersData.items.filter(
      (a: { type?: string }) => a.type === 'SUPPLIER' || a.type === 'BOTH'
    )
  }, [suppliersData])

  // Load contacts for selected supplier
  const { data: contacts } = useCrmContacts(form.supplierId, !!form.supplierId)

  // Populate form on edit
  React.useEffect(() => {
    if (purchaseOrder) {
      setForm({
        supplierId: purchaseOrder.supplierId || '',
        contactId: purchaseOrder.contactId || '',
        requestedDelivery: toDateInput(purchaseOrder.requestedDelivery),
        confirmedDelivery: toDateInput(purchaseOrder.confirmedDelivery),
        notes: purchaseOrder.notes || '',
      })
    } else {
      setForm(INITIAL_STATE)
    }
  }, [purchaseOrder])

  const isPending = createMutation.isPending || updateMutation.isPending

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.supplierId) return

    if (isEdit && purchaseOrder) {
      updateMutation.mutate(
        {
          id: purchaseOrder.id,
          supplierId: form.supplierId,
          contactId: form.contactId || null,
          requestedDelivery: form.requestedDelivery || null,
          confirmedDelivery: form.confirmedDelivery || null,
          notes: form.notes || null,
        },
        {
          onSuccess: () => {
            toast.success(t('toastUpdated'))
            onSuccess?.()
          },
          onError: (err) => toast.error(err.message),
        }
      )
    } else {
      createMutation.mutate(
        {
          supplierId: form.supplierId,
          contactId: form.contactId || undefined,
          requestedDelivery: form.requestedDelivery || undefined,
          notes: form.notes || undefined,
        },
        {
          onSuccess: (data) => {
            toast.success(t('toastCreated'))
            router.push(`/warehouse/purchase-orders/${data.id}`)
          },
          onError: (err) => toast.error(err.message),
        }
      )
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/warehouse/purchase-orders')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">
          {isEdit ? t('formTitleEdit') : t('formTitle')}
        </h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
            {/* Supplier */}
            <div className="space-y-2">
              <Label>{t('labelSupplier')}</Label>
              <Select
                value={form.supplierId || '_none'}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    supplierId: v === '_none' ? '' : v,
                    contactId: '',
                  })
                }
                disabled={!isDraft}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('supplierSelectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">
                    {t('supplierSelectPlaceholder')}
                  </SelectItem>
                  {suppliers.map(
                    (s: { id: string; company?: string | null; number?: string | null }) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.number ? `${s.number} — ` : ''}
                        {s.company || s.id}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Contact */}
            <div className="space-y-2">
              <Label>{t('labelContact')}</Label>
              <Select
                value={form.contactId || '_none'}
                onValueChange={(v) =>
                  setForm({ ...form, contactId: v === '_none' ? '' : v })
                }
                disabled={!isDraft || !form.supplierId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('contactSelectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">{t('noContact')}</SelectItem>
                  {(contacts ?? []).map(
                    (c: {
                      id: string
                      firstName?: string | null
                      lastName?: string | null
                    }) => (
                      <SelectItem key={c.id} value={c.id}>
                        {[c.firstName, c.lastName].filter(Boolean).join(' ') ||
                          c.id}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Requested Delivery */}
            <div className="space-y-2">
              <Label htmlFor="requestedDelivery">
                {t('labelRequestedDelivery')}
              </Label>
              <Input
                id="requestedDelivery"
                type="date"
                value={form.requestedDelivery}
                onChange={(e) =>
                  setForm({ ...form, requestedDelivery: e.target.value })
                }
                disabled={!isDraft}
              />
            </div>

            {/* Confirmed Delivery (edit only) */}
            {isEdit && (
              <div className="space-y-2">
                <Label htmlFor="confirmedDelivery">
                  {t('labelConfirmedDelivery')}
                </Label>
                <Input
                  id="confirmedDelivery"
                  type="date"
                  value={form.confirmedDelivery}
                  onChange={(e) =>
                    setForm({ ...form, confirmedDelivery: e.target.value })
                  }
                  disabled={!isDraft}
                />
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">{t('labelNotes')}</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={4}
                disabled={!isDraft}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/warehouse/purchase-orders')}
              >
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={isPending || !form.supplierId || !isDraft}
              >
                {isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEdit ? t('save') : t('create')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
