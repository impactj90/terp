'use client'

import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CorrespondenceTypeBadge, CorrespondenceDirectionBadge } from './correspondence-type-badge'
import { CorrespondenceAttachmentList } from './correspondence-attachment-list'

interface CorrespondenceDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: Record<string, unknown> | null
}

export function CorrespondenceDetailDialog({
  open,
  onOpenChange,
  item,
}: CorrespondenceDetailDialogProps) {
  const t = useTranslations('crmCorrespondence')

  if (!item) return null

  const formatDate = (dateStr: string | Date) => {
    const d = new Date(dateStr as string)
    return d.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const contact = item.contact as Record<string, string> | null
  const contactName = contact
    ? `${contact.firstName} ${contact.lastName}`
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item.subject as string}</DialogTitle>
          <DialogDescription>
            <span className="flex items-center gap-2 mt-2">
              <CorrespondenceDirectionBadge direction={item.direction as string} />
              <CorrespondenceTypeBadge type={item.type as string} />
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">{t('date')}</span>
              <p className="font-medium">{formatDate(item.date as string)}</p>
            </div>
            {contactName && (
              <div>
                <span className="text-muted-foreground">{t('contact')}</span>
                <p className="font-medium">{contactName}</p>
              </div>
            )}
          </div>

          {(Boolean(item.fromUser) || Boolean(item.toUser)) && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              {Boolean(item.fromUser) && (
                <div>
                  <span className="text-muted-foreground">{t('fromUser')}</span>
                  <p className="font-medium">{String(item.fromUser)}</p>
                </div>
              )}
              {Boolean(item.toUser) && (
                <div>
                  <span className="text-muted-foreground">{t('toUser')}</span>
                  <p className="font-medium">{String(item.toUser)}</p>
                </div>
              )}
            </div>
          )}

          {Boolean(item.content) && (
            <div className="text-sm">
              <span className="text-muted-foreground">{t('content')}</span>
              <p className="mt-1 whitespace-pre-wrap">{String(item.content)}</p>
            </div>
          )}

          {typeof item.id === 'string' && (
            <div className="text-sm">
              <span className="text-muted-foreground">{t('attachments')}</span>
              <div className="mt-1">
                <CorrespondenceAttachmentList
                  correspondenceId={item.id}
                  readOnly
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
