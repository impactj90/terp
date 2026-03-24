'use client'

import * as React from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import {
  useCreateWhSupplierInvoice,
  useUpdateWhSupplierInvoice,
} from '@/hooks/use-wh-supplier-invoices'
import { useTRPC } from '@/trpc'
import { useQuery } from '@tanstack/react-query'

interface FormState {
  number: string
  supplierId: string
  purchaseOrderId: string
  invoiceDate: string
  receivedDate: string
  totalNet: string
  totalVat: string
  totalGross: string
  paymentTermDays: string
  dueDate: string
  discountPercent: string
  discountDays: string
  discountPercent2: string
  discountDays2: string
  notes: string
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0] ?? ''
}

const INITIAL_STATE: FormState = {
  number: '',
  supplierId: '',
  purchaseOrderId: '',
  invoiceDate: toDateStr(new Date()),
  receivedDate: toDateStr(new Date()),
  totalNet: '',
  totalVat: '',
  totalGross: '',
  paymentTermDays: '',
  dueDate: '',
  discountPercent: '',
  discountDays: '',
  discountPercent2: '',
  discountDays2: '',
  notes: '',
}

interface SupplierInvoiceFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice?: Record<string, unknown> | null
}

export function SupplierInvoiceFormSheet({ open, onOpenChange, invoice }: SupplierInvoiceFormSheetProps) {
  const t = useTranslations('warehouseSupplierInvoices')
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [supplierWarning, setSupplierWarning] = React.useState<string | null>(null)

  const createMutation = useCreateWhSupplierInvoice()
  const updateMutation = useUpdateWhSupplierInvoice()
  const isEdit = !!invoice

  const trpc = useTRPC()

  // Fetch suppliers (type SUPPLIER or BOTH)
  const { data: suppliers } = useQuery(
    trpc.crm.addresses.list.queryOptions(
      { type: 'SUPPLIER', page: 1, pageSize: 200 },
      { enabled: open }
    )
  )

  // Fetch purchase orders for selected supplier
  const { data: purchaseOrders } = useQuery(
    trpc.warehouse.purchaseOrders.list.queryOptions(
      { supplierId: form.supplierId || undefined, page: 1, pageSize: 100 },
      { enabled: open && !!form.supplierId }
    )
  )

  // Populate form when editing
  React.useEffect(() => {
    if (open && invoice) {
      setForm({
        number: (invoice.number as string) || '',
        supplierId: (invoice.supplierId as string) || '',
        purchaseOrderId: (invoice.purchaseOrderId as string) || '',
        invoiceDate: invoice.invoiceDate
          ? toDateStr(new Date(invoice.invoiceDate as string))
          : '',
        receivedDate: invoice.receivedDate
          ? toDateStr(new Date(invoice.receivedDate as string))
          : '',
        totalNet: invoice.totalNet != null ? String(invoice.totalNet) : '',
        totalVat: invoice.totalVat != null ? String(invoice.totalVat) : '',
        totalGross: invoice.totalGross != null ? String(invoice.totalGross) : '',
        paymentTermDays: invoice.paymentTermDays != null ? String(invoice.paymentTermDays) : '',
        dueDate: invoice.dueDate
          ? toDateStr(new Date(invoice.dueDate as string))
          : '',
        discountPercent: invoice.discountPercent != null ? String(invoice.discountPercent) : '',
        discountDays: invoice.discountDays != null ? String(invoice.discountDays) : '',
        discountPercent2: invoice.discountPercent2 != null ? String(invoice.discountPercent2) : '',
        discountDays2: invoice.discountDays2 != null ? String(invoice.discountDays2) : '',
        notes: (invoice.notes as string) || '',
      })
    } else if (open && !invoice) {
      setForm(INITIAL_STATE)
    }
  }, [open, invoice])

  // When supplier changes, check tax info and populate payment terms
  React.useEffect(() => {
    if (!form.supplierId || !suppliers?.items) return
    const supplier = suppliers.items.find((s: { id: string }) => s.id === form.supplierId) as Record<string, unknown> | undefined
    if (!supplier) return

    if (!supplier.taxNumber && !supplier.vatId) {
      setSupplierWarning(t('validationSupplierNoTax'))
    } else {
      setSupplierWarning(null)
    }

    // Auto-populate payment terms from supplier defaults (only for new invoices)
    if (!isEdit) {
      setForm((prev) => ({
        ...prev,
        paymentTermDays: supplier.paymentTermDays != null ? String(supplier.paymentTermDays) : prev.paymentTermDays,
        discountPercent: supplier.discountPercent != null ? String(supplier.discountPercent) : prev.discountPercent,
        discountDays: supplier.discountDays != null ? String(supplier.discountDays) : prev.discountDays,
      }))
    }
  }, [form.supplierId, suppliers, isEdit, t])

  // Auto-calculate gross from net + vat
  React.useEffect(() => {
    const net = parseFloat(form.totalNet) || 0
    const vat = parseFloat(form.totalVat) || 0
    if (net > 0 || vat > 0) {
      setForm((prev) => ({
        ...prev,
        totalGross: (net + vat).toFixed(2),
      }))
    }
  }, [form.totalNet, form.totalVat])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.supplierId) {
      toast.error(t('validationSupplierRequired'))
      return
    }
    if (!form.number.trim()) {
      toast.error(t('validationNumberRequired'))
      return
    }
    if (!form.totalNet || !form.totalGross) {
      toast.error(t('validationAmountsRequired'))
      return
    }

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: invoice!.id as string,
          number: form.number,
          invoiceDate: form.invoiceDate,
          totalNet: parseFloat(form.totalNet),
          totalVat: parseFloat(form.totalVat),
          totalGross: parseFloat(form.totalGross),
          paymentTermDays: form.paymentTermDays ? parseInt(form.paymentTermDays) : null,
          dueDate: form.dueDate || null,
          discountPercent: form.discountPercent ? parseFloat(form.discountPercent) : null,
          discountDays: form.discountDays ? parseInt(form.discountDays) : null,
          discountPercent2: form.discountPercent2 ? parseFloat(form.discountPercent2) : null,
          discountDays2: form.discountDays2 ? parseInt(form.discountDays2) : null,
          notes: form.notes || null,
        })
        toast.success(t('toastUpdated'))
      } else {
        await createMutation.mutateAsync({
          number: form.number,
          supplierId: form.supplierId,
          purchaseOrderId: form.purchaseOrderId || undefined,
          invoiceDate: form.invoiceDate,
          receivedDate: form.receivedDate || undefined,
          totalNet: parseFloat(form.totalNet),
          totalVat: parseFloat(form.totalVat),
          totalGross: parseFloat(form.totalGross),
          paymentTermDays: form.paymentTermDays ? parseInt(form.paymentTermDays) : undefined,
          dueDate: form.dueDate || undefined,
          discountPercent: form.discountPercent ? parseFloat(form.discountPercent) : undefined,
          discountDays: form.discountDays ? parseInt(form.discountDays) : undefined,
          discountPercent2: form.discountPercent2 ? parseFloat(form.discountPercent2) : undefined,
          discountDays2: form.discountDays2 ? parseInt(form.discountDays2) : undefined,
          notes: form.notes || undefined,
        })
        toast.success(t('toastCreated'))
      }
      onOpenChange(false)
    } catch {
      toast.error('Error')
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <SheetHeader>
            <SheetTitle>{isEdit ? t('formEditTitle') : t('formTitle')}</SheetTitle>
            <SheetDescription />
          </SheetHeader>

          <div className="grid gap-4 py-4 px-4">
            {/* Supplier */}
            {!isEdit && (
              <div className="grid gap-2">
                <Label>{t('fieldSupplier')}</Label>
                <Select value={form.supplierId} onValueChange={(v) => setForm((f) => ({ ...f, supplierId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('fieldSupplier')} />
                  </SelectTrigger>
                  <SelectContent>
                    {(suppliers?.items ?? []).map((s: { id: string; company: string | null; number: string }) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.number} - {s.company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {supplierWarning && (
                  <div className="flex items-center gap-2 text-sm text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                    {supplierWarning}
                  </div>
                )}
              </div>
            )}

            {/* Purchase Order Link */}
            {!isEdit && form.supplierId && (
              <div className="grid gap-2">
                <Label>{t('fieldPurchaseOrder')}</Label>
                <Select value={form.purchaseOrderId || 'NONE'} onValueChange={(v) => setForm((f) => ({ ...f, purchaseOrderId: v === 'NONE' ? '' : v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('fieldNoPurchaseOrder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">{t('fieldNoPurchaseOrder')}</SelectItem>
                    {(purchaseOrders?.items ?? []).map((po: { id: string; number: string }) => (
                      <SelectItem key={po.id} value={po.id}>
                        {po.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Invoice Number */}
            <div className="grid gap-2">
              <Label>{t('fieldNumber')}</Label>
              <Input
                value={form.number}
                onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                placeholder={t('fieldNumber')}
              />
            </div>

            {/* Invoice Date */}
            <div className="grid gap-2">
              <Label>{t('fieldInvoiceDate')}</Label>
              <Input
                type="date"
                value={form.invoiceDate}
                onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))}
              />
            </div>

            {/* Received Date */}
            {!isEdit && (
              <div className="grid gap-2">
                <Label>{t('fieldReceivedDate')}</Label>
                <Input
                  type="date"
                  value={form.receivedDate}
                  onChange={(e) => setForm((f) => ({ ...f, receivedDate: e.target.value }))}
                />
              </div>
            )}

            {/* Amounts */}
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label>{t('fieldTotalNet')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.totalNet}
                  onChange={(e) => setForm((f) => ({ ...f, totalNet: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t('fieldTotalVat')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.totalVat}
                  onChange={(e) => setForm((f) => ({ ...f, totalVat: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t('fieldTotalGross')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.totalGross}
                  readOnly
                  className="bg-muted"
                />
              </div>
            </div>

            {/* Payment Terms */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{t('fieldPaymentTermDays')}</Label>
                <Input
                  type="number"
                  value={form.paymentTermDays}
                  onChange={(e) => setForm((f) => ({ ...f, paymentTermDays: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t('fieldDueDate')}</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            </div>

            {/* Discount Tier 1 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{t('fieldDiscountPercent')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.discountPercent}
                  onChange={(e) => setForm((f) => ({ ...f, discountPercent: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t('fieldDiscountDays')}</Label>
                <Input
                  type="number"
                  value={form.discountDays}
                  onChange={(e) => setForm((f) => ({ ...f, discountDays: e.target.value }))}
                />
              </div>
            </div>

            {/* Discount Tier 2 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{t('fieldDiscountPercent2')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.discountPercent2}
                  onChange={(e) => setForm((f) => ({ ...f, discountPercent2: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t('fieldDiscountDays2')}</Label>
                <Input
                  type="number"
                  value={form.discountDays2}
                  onChange={(e) => setForm((f) => ({ ...f, discountDays2: e.target.value }))}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="grid gap-2">
              <Label>{t('fieldNotes')}</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

          <SheetFooter className="px-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? t('save') : t('create')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
