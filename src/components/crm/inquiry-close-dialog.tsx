'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { useCloseCrmInquiry } from '@/hooks'
import { toast } from 'sonner'

interface InquiryCloseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  inquiryId: string
  inquiryTitle: string
  hasLinkedOrder: boolean
}

export function InquiryCloseDialog({
  open,
  onOpenChange,
  inquiryId,
  inquiryTitle,
  hasLinkedOrder,
}: InquiryCloseDialogProps) {
  const t = useTranslations('crmInquiries')

  const [closingReason, setClosingReason] = React.useState('')
  const [closingRemarks, setClosingRemarks] = React.useState('')
  const [closeLinkedOrder, setCloseLinkedOrder] = React.useState(false)

  const closeMutation = useCloseCrmInquiry()
  const isSubmitting = closeMutation.isPending

  React.useEffect(() => {
    if (open) {
      setClosingReason('')
      setClosingRemarks('')
      setCloseLinkedOrder(false)
    }
  }, [open])

  const handleSubmit = async () => {
    try {
      await closeMutation.mutateAsync({
        id: inquiryId,
        closingReason: closingReason || undefined,
        closingRemarks: closingRemarks.trim() || undefined,
        closeLinkedOrder,
      })
      toast.success(t('close'))
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error'
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('closeTitle')}</DialogTitle>
          <DialogDescription>
            {t('closeDescription', { title: inquiryTitle })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="closingReason">{t('closingReason')}</Label>
            <Select
              value={closingReason || '_none'}
              onValueChange={(v) => setClosingReason(v === '_none' ? '' : v)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="closingReason">
                <SelectValue placeholder={t('closingReason')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">—</SelectItem>
                <SelectItem value="Auftrag erteilt">{t('closingReasons.orderPlaced')}</SelectItem>
                <SelectItem value="Kein Bedarf">{t('closingReasons.noNeed')}</SelectItem>
                <SelectItem value="Konkurrenz">{t('closingReasons.competition')}</SelectItem>
                <SelectItem value="Sonstiges">{t('closingReasons.other')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="closingRemarks">{t('closingRemarks')}</Label>
            <Textarea
              id="closingRemarks"
              value={closingRemarks}
              onChange={(e) => setClosingRemarks(e.target.value)}
              disabled={isSubmitting}
              rows={3}
            />
          </div>

          {hasLinkedOrder && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="closeLinkedOrder"
                checked={closeLinkedOrder}
                onCheckedChange={(checked) => setCloseLinkedOrder(checked === true)}
                disabled={isSubmitting}
              />
              <Label htmlFor="closeLinkedOrder" className="text-sm font-normal">
                {t('closeLinkedOrder')}
              </Label>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
