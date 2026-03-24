'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useSendWhPurchaseOrder } from '@/hooks/use-wh-purchase-orders'

type OrderMethod = 'PHONE' | 'EMAIL' | 'FAX' | 'PRINT'

interface PurchaseOrderSendDialogProps {
  purchaseOrderId: string
  orderNumber: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PurchaseOrderSendDialog({
  purchaseOrderId,
  orderNumber: _orderNumber,
  open,
  onOpenChange,
}: PurchaseOrderSendDialogProps) {
  const t = useTranslations('warehousePurchaseOrders')
  const sendMutation = useSendWhPurchaseOrder()

  const [method, setMethod] = React.useState<OrderMethod | ''>('')
  const [methodNote, setMethodNote] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setMethod('')
      setMethodNote('')
    }
  }, [open])

  const handleSend = async () => {
    if (!method) return
    try {
      await sendMutation.mutateAsync({
        id: purchaseOrderId,
        method,
        methodNote: methodNote || undefined,
      })
      toast.success(t('toastSent'))
      onOpenChange(false)
    } catch {
      toast.error('Error')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('sendDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('sendDialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t('sendDialogMethod')}</Label>
            <Select
              value={method}
              onValueChange={(v) => setMethod(v as OrderMethod)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('sendDialogMethod')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PHONE">{t('methodPhone')}</SelectItem>
                <SelectItem value="EMAIL">{t('methodEmail')}</SelectItem>
                <SelectItem value="FAX">{t('methodFax')}</SelectItem>
                <SelectItem value="PRINT">{t('methodPrint')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('sendDialogMethodNote')}</Label>
            <Textarea
              value={methodNote}
              onChange={(e) => setMethodNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleSend}
            disabled={!method || sendMutation.isPending}
          >
            {sendMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('sendDialogConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
