'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { useAdjustWhArticleStock } from '@/hooks'

interface ArticleStockAdjustDialogProps {
  articleId: string
  currentStock: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ArticleStockAdjustDialog({
  articleId,
  currentStock,
  open,
  onOpenChange,
}: ArticleStockAdjustDialogProps) {
  const t = useTranslations('warehouseArticles')
  const adjustStock = useAdjustWhArticleStock()
  const [quantity, setQuantity] = React.useState('')
  const [reason, setReason] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setQuantity('')
      setReason('')
    }
  }, [open])

  const delta = parseFloat(quantity) || 0
  const newStock = currentStock + delta

  function handleSubmit() {
    if (delta === 0) return
    adjustStock.mutate(
      { id: articleId, quantity: delta, reason: reason || undefined },
      {
        onSuccess: () => {
          toast.success(t('toastStockAdjusted'))
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('actionAdjustStock')}</DialogTitle>
          <DialogDescription>
            {t('currentStockDescription', { count: currentStock })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="quantity">{t('labelStockChange')}</Label>
            <Input
              id="quantity"
              type="number"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={t('stockChangePlaceholder')}
              autoFocus
            />
            {delta !== 0 && (
              <p className="text-sm text-muted-foreground">
                {t('newStockPreview', { count: newStock })}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">{t('labelReason')}</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder={t('reasonPlaceholder')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={delta === 0 || adjustStock.isPending}>
            {adjustStock.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('actionAdjustConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
