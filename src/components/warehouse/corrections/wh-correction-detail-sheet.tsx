'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { WhCorrectionSeverityBadge } from './wh-correction-severity-badge'
import {
  useWhCorrectionMessageById,
  useResolveWhCorrection,
  useDismissWhCorrection,
} from '@/hooks'
import { useHasPermission } from '@/hooks'
import { ExternalLink, CheckCircle, XCircle } from 'lucide-react'

interface WhCorrectionDetailSheetProps {
  messageId: string | null
  open: boolean
  onClose: () => void
}

const statusKeys: Record<string, string> = {
  OPEN: 'statusOpen',
  RESOLVED: 'statusResolved',
  DISMISSED: 'statusDismissed',
  IGNORED: 'statusDismissed',
}

function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function WhCorrectionDetailSheet({ messageId, open, onClose }: WhCorrectionDetailSheetProps) {
  const t = useTranslations('warehouseCorrections')
  const { data: messageRaw, isLoading } = useWhCorrectionMessageById(messageId ?? '', open && !!messageId)
  const message = messageRaw as { id: string; severity: string; status: string; code: string; message: string; createdAt: string | Date; articleId?: string | null; documentId?: string | null; details?: unknown; resolvedAt?: string | Date | null; resolvedNote?: string | null } | undefined
  const resolveMutation = useResolveWhCorrection()
  const dismissMutation = useDismissWhCorrection()
  const { allowed: canManage } = useHasPermission(['wh_corrections.manage'])

  const [note, setNote] = React.useState('')

  // Reset note when sheet opens with new message
  React.useEffect(() => {
    setNote('')
  }, [messageId])

  function handleResolve() {
    if (!messageId) return
    resolveMutation.mutate(
      { id: messageId, note: note || undefined },
      { onSuccess: () => { setNote(''); onClose() } }
    )
  }

  function handleDismiss() {
    if (!messageId) return
    dismissMutation.mutate(
      { id: messageId, note: note || undefined },
      { onSuccess: () => { setNote(''); onClose() } }
    )
  }

  // Parse details as key-value pairs
  const details = message?.details as Record<string, unknown> | null | undefined

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('detailTitle')}</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">{t('loading')}</div>
        ) : !message ? (
          <div className="py-8 text-center text-muted-foreground">{t('detailNotFound')}</div>
        ) : (
          <div className="space-y-6 pt-4">
            {/* Severity + Status */}
            <div className="flex items-center gap-3">
              <WhCorrectionSeverityBadge severity={message.severity} />
              <Badge variant={message.status === 'OPEN' ? 'default' : 'outline'}>
                {t((statusKeys[message.status] ?? 'statusOpen') as Parameters<typeof t>[0])}
              </Badge>
            </div>

            {/* Code */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t('detailCode')}</p>
              <p className="font-mono text-sm">{message.code}</p>
            </div>

            {/* Message */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t('detailMessage')}</p>
              <p className="text-sm">{message.message}</p>
            </div>

            {/* Datum */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t('detailCreatedAt')}</p>
              <p className="text-sm">{formatDateTime(message.createdAt)}</p>
            </div>

            {/* Article Link */}
            {message.articleId && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('detailArticle')}</p>
                <Link
                  href={`/warehouse/articles/${message.articleId}`}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  {t('linkToArticle')} <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}

            {/* Document Link */}
            {message.documentId && message.code === 'OVERDUE_ORDER' && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('detailOrder')}</p>
                <Link
                  href={`/warehouse/purchase-orders/${message.documentId}`}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  {t('linkToOrder')} <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}

            {/* Details */}
            {details && Object.keys(details).length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">{t('detailDetails')}</p>
                <div className="rounded-md border bg-muted/50 p-3 space-y-1">
                  {Object.entries(details).map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{key}</span>
                      <span className="font-mono">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resolved Info */}
            {message.status !== 'OPEN' && (
              <div className="rounded-md border bg-muted/50 p-3 space-y-2">
                <p className="text-sm font-medium">
                  {t((statusKeys[message.status] ?? 'statusResolved') as Parameters<typeof t>[0])}
                </p>
                {message.resolvedAt && (
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(message.resolvedAt)}
                  </p>
                )}
                {message.resolvedNote && (
                  <p className="text-sm">{message.resolvedNote}</p>
                )}
              </div>
            )}

            {/* Actions */}
            {message.status === 'OPEN' && canManage && (
              <div className="space-y-3 border-t pt-4">
                <Textarea
                  placeholder={t('resolvedNote')}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleResolve}
                    disabled={resolveMutation.isPending || dismissMutation.isPending}
                    className="flex-1"
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    {t('actionResolve')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDismiss}
                    disabled={resolveMutation.isPending || dismissMutation.isPending}
                    className="flex-1"
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    {t('actionDismiss')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
