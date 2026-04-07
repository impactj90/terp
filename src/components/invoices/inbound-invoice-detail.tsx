'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Save, Send, ChevronRight, ChevronLeft, Check, X, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InboundInvoiceStatusBadge } from './inbound-invoice-status-badge'
import { InboundInvoiceLineItems, type LineItem } from './inbound-invoice-line-items'
import { SupplierAssignmentDialog } from './supplier-assignment-dialog'
import { InboundApprovalTimeline } from './inbound-approval-timeline'
import {
  useInboundInvoice,
  useInboundInvoicePdfUrl,
  useUpdateInboundInvoice,
  useUpdateInboundInvoiceLineItems,
  useSubmitInboundInvoiceForApproval,
  useApproveInboundInvoice,
  useRejectInboundInvoice,
  usePendingApprovals,
  useExportDatev,
} from '@/hooks/useInboundInvoices'

interface Props {
  id: string
}

const formatDate = (d: string | Date | null | undefined) => {
  if (!d) return ''
  const date = new Date(d)
  return date.toISOString().slice(0, 10)
}

export function InboundInvoiceDetail({ id }: Props) {
  const t = useTranslations('inboundInvoices')
  const router = useRouter()
  const { data: invoice, isLoading } = useInboundInvoice(id)
  const { data: pdfUrl } = useInboundInvoicePdfUrl(id)
  const updateMutation = useUpdateInboundInvoice()
  const updateLineItemsMutation = useUpdateInboundInvoiceLineItems()
  const submitMutation = useSubmitInboundInvoiceForApproval()
  const approveMutation = useApproveInboundInvoice()
  const rejectMutation = useRejectInboundInvoice()
  const exportDatevMutation = useExportDatev()
  const { data: pendingApprovals } = usePendingApprovals()

  const [sidebarOpen, setSidebarOpen] = React.useState(true)
  const [supplierDialogOpen, setSupplierDialogOpen] = React.useState(false)
  const [approveDialogOpen, setApproveDialogOpen] = React.useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false)
  const [rejectionReason, setRejectionReason] = React.useState('')

  // Form state (initialized from invoice data)
  const [form, setForm] = React.useState<Record<string, unknown>>({})
  const [lineItems, setLineItems] = React.useState<LineItem[]>([])
  const [dirty, setDirty] = React.useState(false)

  // Sync form state when invoice loads
  React.useEffect(() => {
    if (invoice) {
      setForm({
        invoiceNumber: invoice.invoiceNumber ?? '',
        invoiceDate: formatDate(invoice.invoiceDate),
        dueDate: formatDate(invoice.dueDate),
        totalNet: invoice.totalNet != null ? Number(invoice.totalNet) : '',
        totalVat: invoice.totalVat != null ? Number(invoice.totalVat) : '',
        totalGross: invoice.totalGross != null ? Number(invoice.totalGross) : '',
        paymentTermDays: invoice.paymentTermDays ?? '',
        notes: invoice.notes ?? '',
      })
      setLineItems(
        (invoice.lineItems ?? []).map((li: Record<string, unknown>, idx: number) => ({
          position: (li.position as number) ?? idx + 1,
          articleNumber: (li.articleNumber as string) ?? '',
          description: (li.description as string) ?? '',
          quantity: li.quantity != null ? Number(li.quantity) : null,
          unit: (li.unit as string) ?? 'Stk',
          unitPriceNet: li.unitPriceNet != null ? Number(li.unitPriceNet) : null,
          totalNet: li.totalNet != null ? Number(li.totalNet) : null,
          vatRate: li.vatRate != null ? Number(li.vatRate) : null,
          vatAmount: li.vatAmount != null ? Number(li.vatAmount) : null,
          totalGross: li.totalGross != null ? Number(li.totalGross) : null,
        }))
      )
      setDirty(false)
    }
  }, [invoice])

  const isEditable = invoice && ['DRAFT', 'REJECTED'].includes(invoice.status)

  const handleFieldChange = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setDirty(true)
  }

  const handleSave = async () => {
    if (!invoice) return
    try {
      await updateMutation.mutateAsync({
        id: invoice.id,
        invoiceNumber: form.invoiceNumber as string || undefined,
        invoiceDate: form.invoiceDate as string || undefined,
        dueDate: (form.dueDate as string) || null,
        totalNet: form.totalNet !== '' ? Number(form.totalNet) : null,
        totalVat: form.totalVat !== '' ? Number(form.totalVat) : null,
        totalGross: form.totalGross !== '' ? Number(form.totalGross) : null,
        paymentTermDays: form.paymentTermDays !== '' ? Number(form.paymentTermDays) : null,
        notes: (form.notes as string) || null,
      })

      if (lineItems.length > 0) {
        await updateLineItemsMutation.mutateAsync({
          invoiceId: invoice.id,
          items: lineItems,
        })
      }

      toast.success(t('detail.saveSuccess'))
      setDirty(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('detail.saveError'))
    }
  }

  const handleSubmit = async () => {
    if (!invoice) return
    try {
      // Save first if dirty
      if (dirty) await handleSave()
      await submitMutation.mutateAsync({ id: invoice.id })
      toast.success(t('detail.submitSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('detail.submitError'))
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    )
  }

  if (!invoice) {
    return <div className="p-6 text-center text-muted-foreground">{t('detail.invoiceNotFound')}</div>
  }

  const supplier = invoice.supplier as { id: string; company: string; number: string } | null

  // Find if current user has a pending approval for this invoice
  const myPendingApproval = pendingApprovals?.find(
    (a) => a.invoiceId === id && a.status === 'PENDING'
  )
  const isSubmitter = invoice.submittedBy != null // submitter check done server-side

  const handleApprove = async () => {
    if (!myPendingApproval) return
    try {
      await approveMutation.mutateAsync({
        invoiceId: id,
        approvalId: myPendingApproval.id,
      })
      toast.success(t('detail.approveSuccess'))
      setApproveDialogOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('detail.approveError'))
    }
  }

  const handleReject = async () => {
    if (!myPendingApproval || !rejectionReason.trim()) return
    try {
      await rejectMutation.mutateAsync({
        invoiceId: id,
        approvalId: myPendingApproval.id,
        reason: rejectionReason.trim(),
      })
      toast.success(t('detail.rejectSuccess'))
      setRejectDialogOpen(false)
      setRejectionReason('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('detail.rejectError'))
    }
  }

  const handleDatevExport = async () => {
    try {
      const result = await exportDatevMutation.mutateAsync({
        invoiceIds: [id],
      })
      // Trigger download
      const blob = new Blob(
        [Uint8Array.from(atob(result.csv), (c) => c.charCodeAt(0))],
        { type: 'text/csv;charset=windows-1252' }
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('datev.exportSuccess', { count: result.count }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('datev.exportError'))
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/invoices/inbound')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{invoice.number}</h1>
          <p className="text-xs text-muted-foreground">
            {invoice.invoiceNumber ?? t('detail.noInvoiceNumber')} · {supplier?.company ?? invoice.sellerName ?? t('detail.noSupplier')}
          </p>
        </div>
        <InboundInvoiceStatusBadge status={invoice.status} />
        {isEditable && dirty && (
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
            <Save className="mr-1 h-3.5 w-3.5" /> {t('detail.saveButton')}
          </Button>
        )}
        {isEditable && (
          <Button size="sm" variant="default" onClick={handleSubmit} disabled={submitMutation.isPending}>
            <Send className="mr-1 h-3.5 w-3.5" /> {t('detail.submitButton')}
          </Button>
        )}
        {myPendingApproval && (
          <>
            <Button size="sm" variant="default" onClick={() => setApproveDialogOpen(true)}
              disabled={approveMutation.isPending}
              title={isSubmitter ? t('detail.selfApproveTooltip') : undefined}
            >
              <Check className="mr-1 h-3.5 w-3.5" /> {t('detail.approveButton')}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setRejectDialogOpen(true)}
              disabled={rejectMutation.isPending}>
              <X className="mr-1 h-3.5 w-3.5" /> {t('detail.rejectButton')}
            </Button>
          </>
        )}
        {invoice.status === 'APPROVED' && (
          <Button size="sm" variant="outline" onClick={handleDatevExport}
            disabled={exportDatevMutation.isPending}>
            <Download className="mr-1 h-3.5 w-3.5" /> {t('detail.datevExportButton')}
          </Button>
        )}
      </div>

      {/* Content: PDF + Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* PDF Viewer */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {pdfUrl?.signedUrl ? (
            <iframe
              src={pdfUrl.signedUrl}
              className="h-full w-full border-0"
              title="Invoice PDF"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              {t('detail.noPdf')}
            </div>
          )}
        </div>

        {/* Sidebar toggle */}
        <button
          className="flex w-6 items-center justify-center border-l hover:bg-muted/50"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-96 shrink-0 overflow-y-auto border-l p-4 space-y-4">
            {/* Invoice Header */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{t('detail.invoiceDataTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">{t('detail.invoiceNumberLabel')}</Label>
                  <Input
                    value={form.invoiceNumber as string ?? ''}
                    onChange={(e) => handleFieldChange('invoiceNumber', e.target.value)}
                    disabled={!isEditable}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">{t('detail.invoiceDateLabel')}</Label>
                    <Input
                      type="date"
                      value={form.invoiceDate as string ?? ''}
                      onChange={(e) => handleFieldChange('invoiceDate', e.target.value)}
                      disabled={!isEditable}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t('detail.dueDateLabel')}</Label>
                    <Input
                      type="date"
                      value={form.dueDate as string ?? ''}
                      onChange={(e) => handleFieldChange('dueDate', e.target.value)}
                      disabled={!isEditable}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">{t('detail.netLabel')}</Label>
                    <Input
                      type="number" step="0.01"
                      value={form.totalNet as string ?? ''}
                      onChange={(e) => handleFieldChange('totalNet', e.target.value)}
                      disabled={!isEditable}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t('detail.vatLabel')}</Label>
                    <Input
                      type="number" step="0.01"
                      value={form.totalVat as string ?? ''}
                      onChange={(e) => handleFieldChange('totalVat', e.target.value)}
                      disabled={!isEditable}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t('detail.grossLabel')}</Label>
                    <Input
                      type="number" step="0.01"
                      value={form.totalGross as string ?? ''}
                      onChange={(e) => handleFieldChange('totalGross', e.target.value)}
                      disabled={!isEditable}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">{t('detail.paymentTermLabel')}</Label>
                  <Input
                    type="number"
                    value={form.paymentTermDays as string ?? ''}
                    onChange={(e) => handleFieldChange('paymentTermDays', e.target.value)}
                    disabled={!isEditable}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Supplier */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{t('detail.supplierTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                {supplier ? (
                  <div>
                    <p className="text-sm font-medium">{supplier.company}</p>
                    <p className="text-xs text-muted-foreground">{supplier.number}</p>
                  </div>
                ) : invoice.supplierStatus === 'unknown' ? (
                  <div className="space-y-2">
                    {invoice.sellerName && (
                      <p className="text-sm text-muted-foreground">
                        ZUGFeRD: {invoice.sellerName}
                        {invoice.sellerVatId ? ` (${invoice.sellerVatId})` : ''}
                      </p>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setSupplierDialogOpen(true)}>
                      {t('detail.assignSupplierButton')}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('detail.noSupplierAssigned')}</p>
                )}
              </CardContent>
            </Card>

            {/* Approval History */}
            {invoice.status !== 'DRAFT' && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">{t('detail.approvalHistoryTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <InboundApprovalTimeline invoiceId={id} />
                </CardContent>
              </Card>
            )}

            {/* ZUGFeRD Info */}
            {invoice.zugferdProfile && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">{t('detail.zugferdTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="blue">{invoice.zugferdProfile}</Badge>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('detail.zugferdSource', { source: invoice.source })}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{t('detail.notesTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  rows={3}
                  value={form.notes as string ?? ''}
                  onChange={(e) => handleFieldChange('notes', e.target.value)}
                  disabled={!isEditable}
                  placeholder={t('detail.notesPlaceholder')}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Line Items (below the split pane) */}
      <div className="border-t p-4">
        <h2 className="mb-3 text-sm font-semibold">{t('detail.positionsTitle')}</h2>
        <InboundInvoiceLineItems
          items={lineItems}
          onChange={(items) => { setLineItems(items); setDirty(true) }}
          readonly={!isEditable}
          headerTotalNet={form.totalNet !== '' ? Number(form.totalNet) : null}
        />
      </div>

      {/* Supplier Assignment Dialog */}
      <SupplierAssignmentDialog
        invoiceId={id}
        open={supplierDialogOpen}
        onOpenChange={setSupplierDialogOpen}
        sellerName={invoice.sellerName}
        sellerVatId={invoice.sellerVatId}
      />

      {/* Approve Dialog */}
      <ConfirmDialog
        open={approveDialogOpen}
        onOpenChange={(open: boolean) => setApproveDialogOpen(open)}
        title={t('detail.approveTitle')}
        description={t('detail.approveDescription', { number: invoice.number, invoiceNumber: invoice.invoiceNumber ?? '' })}
        isLoading={approveMutation.isPending}
        onConfirm={handleApprove}
      />

      {/* Reject Dialog */}
      {rejectDialogOpen && (
        <Dialog open={rejectDialogOpen} onOpenChange={(open: boolean) => { if (!open) { setRejectDialogOpen(false); setRejectionReason('') } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('detail.rejectTitle')}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{t('detail.rejectDescription')}</p>
            <Textarea
              placeholder={t('detail.rejectPlaceholder')}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setRejectDialogOpen(false); setRejectionReason('') }}>
                {t('detail.cancelButton')}
              </Button>
              <Button variant="destructive" onClick={handleReject}
                disabled={rejectMutation.isPending || !rejectionReason.trim()}>
                {t('detail.rejectButton')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
