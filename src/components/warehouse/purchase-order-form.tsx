'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Loader2, ShoppingCart, Building2, User, CalendarDays, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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

  // Selected supplier display
  const selectedSupplier = React.useMemo(() => {
    if (!form.supplierId) return null
    return suppliers.find((s: { id: string }) => s.id === form.supplierId)
  }, [form.supplierId, suppliers])

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
    <div className="p-4 sm:p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => router.push('/warehouse/purchase-orders')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold flex flex-wrap items-center gap-2">
            {isEdit && purchaseOrder?.number && (
              <span className="font-mono text-muted-foreground">{purchaseOrder.number}</span>
            )}
            {isEdit ? t('formTitleEdit') : t('formTitle')}
          </h1>
          {!isEdit && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('formDescription')}
            </p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Supplier & Contact */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              {t('labelSupplier')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Supplier */}
              <div className="space-y-2">
                <Label className="text-sm">{t('labelSupplier')}</Label>
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
                <Label className="text-sm">{t('labelContact')}</Label>
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
            </div>
          </CardContent>
        </Card>

        {/* Delivery Dates */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              {t('labelRequestedDelivery')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="requestedDelivery" className="text-sm">
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

              {isEdit && (
                <div className="space-y-2">
                  <Label htmlFor="confirmedDelivery" className="text-sm">
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
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              {t('labelNotes')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              disabled={!isDraft}
              placeholder={t('notesPlaceholder')}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            type="submit"
            disabled={isPending || !form.supplierId || !isDraft}
            className="gap-2"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4" />
            )}
            {isEdit ? t('save') : t('create')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/warehouse/purchase-orders')}
          >
            {t('cancel')}
          </Button>
        </div>
      </form>
    </div>
  )
}
