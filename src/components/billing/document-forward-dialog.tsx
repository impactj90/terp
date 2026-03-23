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
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useForwardBillingDocument } from '@/hooks'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

const FORWARDING_RULES: Record<string, { type: string; key: string }[]> = {
  OFFER: [{ type: 'ORDER_CONFIRMATION', key: 'typeOrderConfirmation' }],
  ORDER_CONFIRMATION: [
    { type: 'DELIVERY_NOTE', key: 'typeDeliveryNote' },
    { type: 'SERVICE_NOTE', key: 'typeServiceNote' },
  ],
  DELIVERY_NOTE: [{ type: 'INVOICE', key: 'typeInvoice' }],
  SERVICE_NOTE: [{ type: 'INVOICE', key: 'typeInvoice' }],
  RETURN_DELIVERY: [{ type: 'CREDIT_NOTE', key: 'typeCreditNote' }],
  INVOICE: [],
  CREDIT_NOTE: [],
}

interface DocumentForwardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentId: string
  documentType: string
  documentNumber: string
}

export function DocumentForwardDialog({
  open,
  onOpenChange,
  documentId,
  documentType,
  documentNumber,
}: DocumentForwardDialogProps) {
  const t = useTranslations('billingDocuments')
  const router = useRouter()
  const forwardMutation = useForwardBillingDocument()
  const allowedTargets = FORWARDING_RULES[documentType] ?? []
  const [selectedType, setSelectedType] = React.useState(allowedTargets[0]?.type ?? '')

  const handleForward = async () => {
    if (!selectedType) return
    try {
      const result = await forwardMutation.mutateAsync({
        id: documentId,
        targetType: selectedType as "ORDER_CONFIRMATION" | "DELIVERY_NOTE" | "SERVICE_NOTE" | "INVOICE" | "CREDIT_NOTE",
      })
      toast.success(t('documentForwarded'))
      onOpenChange(false)
      if (result?.id) {
        router.push(`/orders/documents/${result.id}`)
      }
    } catch {
      toast.error(t('forwardError'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('forwardDocument')}</DialogTitle>
          <DialogDescription>
            {t('forwardDescription', { number: documentNumber })}
          </DialogDescription>
        </DialogHeader>
        {allowedTargets.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('cannotForward')}</p>
        ) : (
          <RadioGroup value={selectedType} onValueChange={setSelectedType}>
            {allowedTargets.map((target) => (
              <div key={target.type} className="flex items-center space-x-2">
                <RadioGroupItem value={target.type} id={target.type} />
                <Label htmlFor={target.type}>{t(target.key as any)}</Label>
              </div>
            ))}
          </RadioGroup>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleForward}
            disabled={!selectedType || forwardMutation.isPending}
          >
            {forwardMutation.isPending ? t('forwarding') : t('forwardButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
