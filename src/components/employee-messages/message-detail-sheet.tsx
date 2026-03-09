'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { Send, Mail } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useEmployeeMessage } from '@/hooks'
import type { components } from '@/types/legacy-api-types'

type EmployeeMessageRecipient = components['schemas']['EmployeeMessageRecipient']

interface MessageDetailSheetProps {
  messageId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSend?: (messageId: string, subject: string, recipientCount: number) => void
}

interface DetailRowProps {
  label: string
  value: React.ReactNode
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex justify-between py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '-'}</span>
    </div>
  )
}

function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'sent') return 'default'
  if (status === 'failed') return 'destructive'
  return 'secondary'
}

export function MessageDetailSheet({
  messageId,
  open,
  onOpenChange,
  onSend,
}: MessageDetailSheetProps) {
  const t = useTranslations('adminEmployeeMessages')
  const { data: message, isLoading } = useEmployeeMessage(messageId || '', open && !!messageId)

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy HH:mm')
  }

  const recipients = message?.recipients ?? []
  const pendingCount = recipients.filter((r: EmployeeMessageRecipient) => r.status === 'pending').length
  const sentCount = recipients.filter((r: EmployeeMessageRecipient) => r.status === 'sent').length
  const failedCount = recipients.filter((r: EmployeeMessageRecipient) => r.status === 'failed').length

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('detailTitle')}</SheetTitle>
          <SheetDescription>{t('detailDescription')}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 space-y-4 py-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : message ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Header with icon */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <Mail className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{message.subject}</h3>
                  <p className="text-sm text-muted-foreground">
                    {recipients.length} {t('columnRecipients').toLowerCase()}
                  </p>
                </div>
              </div>

              {/* Message Content */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('sectionContent')}</h4>
                <div className="rounded-lg border p-4">
                  <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                </div>
              </div>

              {/* Message Info */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('sectionInfo')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('fieldCreated')} value={formatDate(message.created_at)} />
                  <DetailRow label={t('fieldUpdated')} value={formatDate(message.updated_at)} />
                </div>
              </div>

              {/* Status Summary */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('columnStatus')}</h4>
                <div className="flex flex-wrap gap-2">
                  {sentCount > 0 && (
                    <Badge variant="default">{sentCount} {t('statusSent').toLowerCase()}</Badge>
                  )}
                  {pendingCount > 0 && (
                    <Badge variant="secondary">{pendingCount} {t('statusPending').toLowerCase()}</Badge>
                  )}
                  {failedCount > 0 && (
                    <Badge variant="destructive">{failedCount} {t('statusFailed').toLowerCase()}</Badge>
                  )}
                </div>
              </div>

              {/* Recipients Table */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('sectionRecipientStatus')}</h4>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('recipientEmployee')}</TableHead>
                        <TableHead className="w-24">{t('recipientStatus')}</TableHead>
                        <TableHead className="w-36">{t('recipientSentAt')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recipients.map((recipient: EmployeeMessageRecipient) => (
                        <TableRow key={recipient.id}>
                          <TableCell className="font-mono text-xs">
                            {recipient.employee_id.slice(0, 8)}...
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusVariant(recipient.status)}>
                              {recipient.status === 'sent'
                                ? t('statusSent')
                                : recipient.status === 'failed'
                                  ? t('statusFailed')
                                  : t('statusPending')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDate(recipient.sent_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {recipients.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                            -
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Show error messages for failed recipients */}
                {failedCount > 0 && (
                  <div className="space-y-1 mt-2">
                    {recipients
                      .filter((r: EmployeeMessageRecipient) => r.status === 'failed' && r.error_message)
                      .map((r: EmployeeMessageRecipient) => (
                        <p key={r.id} className="text-xs text-destructive">
                          {r.employee_id.slice(0, 8)}: {r.error_message}
                        </p>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('close')}
          </Button>
          {message && pendingCount > 0 && onSend && (
            <Button
              onClick={() => onSend(message.id, message.subject, pendingCount)}
            >
              <Send className="mr-2 h-4 w-4" />
              {t('sendMessage')}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
