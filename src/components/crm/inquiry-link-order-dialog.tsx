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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { useLinkCrmInquiryOrder, useCreateCrmInquiryOrder, useOrders } from '@/hooks'
import { toast } from 'sonner'

interface InquiryLinkOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  inquiryId: string
  inquiryTitle: string
}

export function InquiryLinkOrderDialog({
  open,
  onOpenChange,
  inquiryId,
  inquiryTitle,
}: InquiryLinkOrderDialogProps) {
  const t = useTranslations('crmInquiries')

  const [tab, setTab] = React.useState<string>('link')
  const [selectedOrderId, setSelectedOrderId] = React.useState('')
  const [orderName, setOrderName] = React.useState('')

  const linkMutation = useLinkCrmInquiryOrder()
  const createMutation = useCreateCrmInquiryOrder()
  const isSubmitting = linkMutation.isPending || createMutation.isPending

  // Fetch active orders for linking
  const { data: ordersData } = useOrders({ enabled: open, isActive: true })
  const orders = (ordersData ?? []) as Array<{ id: string; code: string; name: string }>

  React.useEffect(() => {
    if (open) {
      setTab('link')
      setSelectedOrderId('')
      setOrderName(inquiryTitle)
    }
  }, [open, inquiryTitle])

  const handleLinkExisting = async () => {
    if (!selectedOrderId) return
    try {
      await linkMutation.mutateAsync({ id: inquiryId, orderId: selectedOrderId })
      toast.success(t('linkOrder'))
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error'
      toast.error(message)
    }
  }

  const handleCreateNew = async () => {
    try {
      await createMutation.mutateAsync({
        id: inquiryId,
        orderName: orderName.trim() || undefined,
      })
      toast.success(t('createOrder'))
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
          <DialogTitle>{t('linkOrder')}</DialogTitle>
          <DialogDescription>{''}</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="link">{t('linkExisting')}</TabsTrigger>
            <TabsTrigger value="create">{t('createNew')}</TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="orderSelect">{t('linkedOrder')}</Label>
              <Select
                value={selectedOrderId || '_none'}
                onValueChange={(v) => setSelectedOrderId(v === '_none' ? '' : v)}
                disabled={isSubmitting}
              >
                <SelectTrigger id="orderSelect">
                  <SelectValue placeholder={t('selectAddress')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">—</SelectItem>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.code} — {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                {t('cancel')}
              </Button>
              <Button onClick={handleLinkExisting} disabled={isSubmitting || !selectedOrderId}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('confirm')}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="create" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="orderName">{t('orderName')}</Label>
              <Input
                id="orderName"
                value={orderName}
                onChange={(e) => setOrderName(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                {t('cancel')}
              </Button>
              <Button onClick={handleCreateNew} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('createOrder')}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
