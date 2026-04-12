'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, Play, Pencil, Power, PowerOff, Trash2 } from 'lucide-react'
import {
  useBillingRecurringInvoice,
  useBillingRecurringInvoicePreview,
  useActivateBillingRecurringInvoice,
  useDeactivateBillingRecurringInvoice,
  useDeleteBillingRecurringInvoice,
} from '@/hooks'
import { RecurringGenerateDialog } from './recurring-generate-dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

const INTERVAL_KEYS: Record<string, string> = {
  MONTHLY: 'intervalMonthly',
  QUARTERLY: 'intervalQuarterly',
  SEMI_ANNUALLY: 'intervalSemiAnnually',
  ANNUALLY: 'intervalAnnually',
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

interface DetailRowProps {
  label: string
  value: React.ReactNode
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

interface RecurringDetailProps {
  id: string
}

export function RecurringDetail({ id }: RecurringDetailProps) {
  const t = useTranslations('billingRecurring')
  const tc = useTranslations('common')
  const tDoc = useTranslations('billingDocuments')
  const router = useRouter()
  const { data: rec, isLoading, refetch } = useBillingRecurringInvoice(id)
  const { data: previewData } = useBillingRecurringInvoicePreview(id, !!rec)
  const activateMutation = useActivateBillingRecurringInvoice()
  const deactivateMutation = useDeactivateBillingRecurringInvoice()
  const deleteMutation = useDeleteBillingRecurringInvoice()

  const [showGenerateDialog, setShowGenerateDialog] = React.useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false)

  if (isLoading) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">{t('loading')}</div>
  }

  if (!rec) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">{t('templateNotFound')}</div>
  }

  const handleActivate = async () => {
    try {
      await activateMutation.mutateAsync({ id })
      toast.success(t('templateActivated'))
      refetch()
    } catch {
      toast.error(t('activateError'))
    }
  }

  const handleDeactivate = async () => {
    try {
      await deactivateMutation.mutateAsync({ id })
      toast.success(t('templateDeactivated'))
      refetch()
    } catch {
      toast.error(t('deactivateError'))
    }
  }

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ id })
      toast.success(t('templateDeleted'))
      setShowDeleteDialog(false)
      router.push('/orders/recurring')
    } catch {
      toast.error(t('deleteError'))
    }
  }

  const recWithPositions = rec as { positionTemplate?: unknown }
  const positions = Array.isArray(recWithPositions.positionTemplate)
    ? (recWithPositions.positionTemplate as Array<{
        type?: string
        description?: string
        quantity?: number
        unit?: string
        unitPrice?: number
        flatCosts?: number
        vatRate?: number
      }>)
    : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => router.push('/orders/recurring')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{tc('goBack')}</TooltipContent>
          </Tooltip>
          <div>
            <h2 className="text-2xl font-bold">{rec.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={rec.isActive ? 'default' : 'secondary'}>
                {rec.isActive ? t('active') : t('inactive')}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {INTERVAL_KEYS[rec.interval] ? t(INTERVAL_KEYS[rec.interval] as Parameters<typeof t>[0]) : rec.interval}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rec.isActive && (
            <Button onClick={() => setShowGenerateDialog(true)}>
              <Play className="h-4 w-4 mr-1" />
              {t('generateInvoice')}
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push(`/orders/recurring/new?edit=${id}`)}>
            <Pencil className="h-4 w-4 mr-1" />
            {t('edit')}
          </Button>
          {rec.isActive ? (
            <Button variant="outline" onClick={handleDeactivate}>
              <PowerOff className="h-4 w-4 mr-1" />
              {t('deactivate')}
            </Button>
          ) : (
            <Button variant="outline" onClick={handleActivate}>
              <Power className="h-4 w-4 mr-1" />
              {t('activate')}
            </Button>
          )}
          <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="h-4 w-4 mr-1" />
            {t('delete')}
          </Button>
        </div>
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('details')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <DetailRow label={t('customer')} value={(rec.address as { company?: string })?.company ?? '-'} />
              <DetailRow label={t('contact')} value={rec.contact ? `${(rec.contact as { firstName?: string }).firstName ?? ''} ${(rec.contact as { lastName?: string }).lastName ?? ''}`.trim() : '-'} />
              <DetailRow label={t('interval')} value={INTERVAL_KEYS[rec.interval] ? t(INTERVAL_KEYS[rec.interval] as Parameters<typeof t>[0]) : rec.interval} />
              <DetailRow label={t('startDate')} value={formatDate(rec.startDate)} />
              <DetailRow label={t('endDate')} value={formatDate(rec.endDate)} />
            </div>
            <div>
              <DetailRow label={t('nextDue')} value={formatDate(rec.nextDueDate)} />
              <DetailRow label={t('lastGenerated')} value={formatDate(rec.lastGeneratedAt)} />
              <DetailRow label={t('autoGenerate')} value={rec.autoGenerate ? t('yes') : t('no')} />
              <DetailRow label={t('paymentTerm')} value={rec.paymentTermDays ? `${rec.paymentTermDays} ${t('days')}` : '-'} />
              <DetailRow label={t('discount')} value={rec.discountPercent ? `${rec.discountPercent}% / ${rec.discountDays ?? '-'} ${t('days')}` : '-'} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="positions">
        <TabsList>
          <TabsTrigger value="positions">{t('positions')}</TabsTrigger>
          <TabsTrigger value="preview">{t('preview')}</TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('columnHash')}</TableHead>
                    <TableHead>{t('columnType')}</TableHead>
                    <TableHead>{t('columnDescription')}</TableHead>
                    <TableHead className="text-right">{t('columnQuantity')}</TableHead>
                    <TableHead>{t('columnUnit')}</TableHead>
                    <TableHead className="text-right">{t('columnUnitPrice')}</TableHead>
                    <TableHead className="text-right">{t('columnVatPercent')}</TableHead>
                    <TableHead className="text-right">{t('columnTotal')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        {t('noPositions')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    positions.map((pos, i) => {
                      const qty = pos.quantity ?? 0
                      const price = pos.unitPrice ?? 0
                      const flat = pos.flatCosts ?? 0
                      const total = qty === 0 && price === 0 && flat === 0 ? null : Math.round((qty * price + flat) * 100) / 100
                      return (
                        <TableRow key={i}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell>{pos.type === 'ARTICLE' ? tDoc('posTypeArticle') : pos.type === 'TEXT' ? tDoc('posTypeText') : tDoc('posTypeFreeText')}</TableCell>
                          <TableCell>{pos.description ?? '-'}</TableCell>
                          <TableCell className="text-right">{pos.quantity ?? '-'}</TableCell>
                          <TableCell>{pos.unit ?? '-'}</TableCell>
                          <TableCell className="text-right">{formatCurrency(pos.unitPrice)}</TableCell>
                          <TableCell className="text-right">{pos.vatRate != null ? `${pos.vatRate}%` : '-'}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(total)}</TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('nextInvoicePreview')}</CardTitle>
            </CardHeader>
            <CardContent>
              {previewData ? (
                <div className="space-y-4">
                  <DetailRow label={t('invoiceDate')} value={formatDate(previewData.nextInvoiceDate)} />
                  <div className="border-t pt-4 space-y-1">
                    <DetailRow label={t('net')} value={formatCurrency(previewData.subtotalNet)} />
                    <DetailRow label={t('vat')} value={formatCurrency(previewData.totalVat)} />
                    <div className="border-t pt-1">
                      <DetailRow label={t('gross')} value={<span className="font-bold">{formatCurrency(previewData.totalGross)}</span>} />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">{t('previewLoading')}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <RecurringGenerateDialog
        templateId={id}
        templateName={rec.name}
        open={showGenerateDialog}
        onOpenChange={setShowGenerateDialog}
        onSuccess={() => refetch()}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t('deleteTemplate')}
        description={t('deleteTemplateDescription', { name: rec.name })}
        confirmLabel={t('delete')}
        cancelLabel={t('deleteCancel')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
