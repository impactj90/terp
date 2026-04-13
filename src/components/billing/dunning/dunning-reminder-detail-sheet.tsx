'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Loader2, Send, Mail, FileText, XCircle, Download } from 'lucide-react'
import {
  useDunningRun,
  useSendDunningReminder,
  useMarkDunningReminderSent,
  useCancelDunningReminder,
  useDunningPdfDownloadUrl,
  useDunningPdfPreview,
} from '@/hooks'
import { toast } from 'sonner'

interface DunningReminderDetailSheetProps {
  reminderId: string | null
  onOpenChange: (open: boolean) => void
}

type ReminderItem = {
  id: string
  invoiceNumber: string
  invoiceDate: Date | string
  dueDate: Date | string
  openAmountAtReminder: number
  daysOverdue: number
  interestAmount: number
  feeAmount: number
}

type Reminder = {
  id: string
  number: string
  level: number
  status: string
  sentAt: Date | string | null
  sendMethod: string | null
  pdfStoragePath: string | null
  totalOpenAmount: number
  totalInterest: number
  totalFees: number
  totalDue: number
  headerText: string
  footerText: string
  createdAt: Date | string
  customerAddress: { company: string | null; email: string | null } | null
  items: ReminderItem[]
}

function formatDate(date: Date | string | null | undefined): string {
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

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'outline' {
  if (status === 'SENT') return 'default'
  if (status === 'DRAFT') return 'secondary'
  return 'outline'
}

export function DunningReminderDetailSheet({
  reminderId,
  onOpenChange,
}: DunningReminderDetailSheetProps) {
  const t = useTranslations('billingDunning')
  const open = !!reminderId

  const { data: reminder, isLoading } = useDunningRun(reminderId ?? '', open)
  const sendMutation = useSendDunningReminder()
  const markSentMutation = useMarkDunningReminderSent()
  const cancelMutation = useCancelDunningReminder()
  const pdfUrlMutation = useDunningPdfDownloadUrl()
  const pdfPreviewMutation = useDunningPdfPreview()

  const [showSendConfirm, setShowSendConfirm] = React.useState(false)
  const [showLetterConfirm, setShowLetterConfirm] = React.useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setShowSendConfirm(false)
      setShowLetterConfirm(false)
      setShowCancelConfirm(false)
    }
  }, [open])

  const r = reminder as Reminder | undefined | null

  const handleSendEmail = async () => {
    if (!reminderId) return
    try {
      await sendMutation.mutateAsync({ id: reminderId })
      toast.success(t('detail.sentSuccess'))
      setShowSendConfirm(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('detail.sendError'))
    }
  }

  const handleMarkAsLetter = async () => {
    if (!reminderId) return
    try {
      await markSentMutation.mutateAsync({ id: reminderId, method: 'letter' })
      toast.success(t('detail.markedAsLetterSuccess'))
      setShowLetterConfirm(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('detail.markError'))
    }
  }

  const handleCancel = async () => {
    if (!reminderId) return
    try {
      await cancelMutation.mutateAsync({ id: reminderId })
      toast.success(t('detail.cancelledSuccess'))
      setShowCancelConfirm(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('detail.cancelError'))
    }
  }

  const handleOpenPdf = async () => {
    if (!reminderId) return
    try {
      const result = r?.pdfStoragePath
        ? await pdfUrlMutation.mutateAsync({ id: reminderId })
        : await pdfPreviewMutation.mutateAsync({ id: reminderId })
      const url = (result as { signedUrl?: string } | null)?.signedUrl
      if (url) {
        window.open(url, '_blank', 'noopener')
      } else {
        toast.error(t('detail.pdfError'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('detail.pdfError'))
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl flex flex-col overflow-hidden"
        >
          <SheetHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <SheetTitle className="truncate">
                  {r?.number ?? t('detail.title')}
                </SheetTitle>
                <SheetDescription>
                  {r?.customerAddress?.company ?? '-'}
                </SheetDescription>
              </div>
              {r && (
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline">
                    {t('runs.levelBadge', { level: r.level })}
                  </Badge>
                  <Badge
                    variant={statusBadgeVariant(r.status)}
                    data-testid="reminder-status-badge"
                  >
                    {r.status}
                  </Badge>
                </div>
              )}
            </div>
          </SheetHeader>

          {isLoading || !r ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('loading')}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
              <div className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">
                      {t('detail.createdAt')}
                    </div>
                    <div className="font-medium">{formatDate(r.createdAt)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">
                      {t('detail.sentAt')}
                    </div>
                    <div className="font-medium">{formatDate(r.sentAt)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">
                      {t('detail.sendMethod')}
                    </div>
                    <div className="font-medium">{r.sendMethod ?? '-'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">
                      {t('detail.email')}
                    </div>
                    <div className="font-medium truncate">
                      {r.customerAddress?.email ?? '-'}
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-sm font-semibold mb-2">
                    {t('detail.itemsTitle')}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('proposal.columnInvoiceNumber')}</TableHead>
                        <TableHead>{t('proposal.columnDueDate')}</TableHead>
                        <TableHead className="text-right">
                          {t('proposal.columnOpenAmount')}
                        </TableHead>
                        <TableHead className="text-right">
                          {t('proposal.columnDaysOverdue')}
                        </TableHead>
                        <TableHead className="text-right">
                          {t('proposal.columnInterest')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {r.items.map((it) => (
                        <TableRow key={it.id} data-testid="reminder-item-row">
                          <TableCell className="font-medium">
                            {it.invoiceNumber}
                          </TableCell>
                          <TableCell>{formatDate(it.dueDate)}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(it.openAmountAtReminder)}
                          </TableCell>
                          <TableCell className="text-right">
                            {it.daysOverdue}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(it.interestAmount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <Separator />

                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t('proposal.totalOpen')}
                    </span>
                    <span className="font-medium">
                      {formatCurrency(r.totalOpenAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t('proposal.totalInterest')}
                    </span>
                    <span className="font-medium">
                      {formatCurrency(r.totalInterest)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t('proposal.totalFees')}
                    </span>
                    <span className="font-medium">
                      {formatCurrency(r.totalFees)}
                    </span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between">
                    <span className="font-semibold">
                      {t('proposal.totalDueLabel')}
                    </span>
                    <span className="text-base font-bold">
                      {formatCurrency(r.totalDue)}
                    </span>
                  </div>
                </div>

                {(r.headerText || r.footerText) && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      {r.headerText && (
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                            {t('detail.headerText')}
                          </h4>
                          <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                            {r.headerText}
                          </div>
                        </div>
                      )}
                      {r.footerText && (
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                            {t('detail.footerText')}
                          </h4>
                          <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                            {r.footerText}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {r && (
            <div className="border-t pt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={handleOpenPdf}
                disabled={
                  pdfUrlMutation.isPending || pdfPreviewMutation.isPending
                }
              >
                {pdfUrlMutation.isPending || pdfPreviewMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : r.pdfStoragePath ? (
                  <Download className="h-4 w-4 mr-1" />
                ) : (
                  <FileText className="h-4 w-4 mr-1" />
                )}
                {r.pdfStoragePath ? t('detail.openPdf') : t('detail.previewPdf')}
              </Button>

              {r.status === 'DRAFT' && (
                <>
                  <Button
                    onClick={() => setShowSendConfirm(true)}
                    disabled={sendMutation.isPending}
                  >
                    <Send className="h-4 w-4 mr-1" />
                    {t('detail.send')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowLetterConfirm(true)}
                    disabled={markSentMutation.isPending}
                  >
                    <Mail className="h-4 w-4 mr-1" />
                    {t('detail.markAsLetter')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowCancelConfirm(true)}
                    disabled={cancelMutation.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    {t('detail.discard')}
                  </Button>
                </>
              )}

              {r.status === 'SENT' && (
                <Button
                  variant="outline"
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={cancelMutation.isPending}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  {t('detail.cancelSent')}
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={showSendConfirm}
        onOpenChange={setShowSendConfirm}
        title={t('detail.confirmSendTitle')}
        description={t('detail.confirmSendDescription', {
          number: r?.number ?? '',
          email: r?.customerAddress?.email ?? '',
        })}
        confirmLabel={t('detail.confirm')}
        cancelLabel={t('detail.cancel')}
        onConfirm={handleSendEmail}
        isLoading={sendMutation.isPending}
      />

      <ConfirmDialog
        open={showLetterConfirm}
        onOpenChange={setShowLetterConfirm}
        title={t('detail.confirmLetterTitle')}
        description={t('detail.confirmLetterDescription', {
          number: r?.number ?? '',
        })}
        confirmLabel={t('detail.confirm')}
        cancelLabel={t('detail.cancel')}
        onConfirm={handleMarkAsLetter}
        isLoading={markSentMutation.isPending}
      />

      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title={
          r?.status === 'SENT'
            ? t('detail.confirmCancelSentTitle')
            : t('detail.confirmDiscardTitle')
        }
        description={
          r?.status === 'SENT'
            ? t('detail.confirmCancelSentDescription', { number: r?.number ?? '' })
            : t('detail.confirmDiscardDescription', { number: r?.number ?? '' })
        }
        confirmLabel={t('detail.confirm')}
        cancelLabel={t('detail.cancel')}
        variant="destructive"
        onConfirm={handleCancel}
        isLoading={cancelMutation.isPending}
      />
    </>
  )
}
