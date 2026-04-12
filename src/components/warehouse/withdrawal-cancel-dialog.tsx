'use client'

import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useCancelWhWithdrawal } from '@/hooks/use-wh-withdrawals'

interface WithdrawalCancelDialogProps {
  movementId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function WithdrawalCancelDialog({
  movementId,
  open,
  onOpenChange,
  onSuccess,
}: WithdrawalCancelDialogProps) {
  const t = useTranslations('warehouseWithdrawals')
  const cancelMutation = useCancelWhWithdrawal()

  const handleConfirm = async () => {
    try {
      await cancelMutation.mutateAsync({ movementId })
      toast.success(t('toastCancelled'))
      onOpenChange(false)
      onSuccess?.()
    } catch {
      toast.error(t('toastCancelError'))
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('cancelDialogTitle')}
      description={t('cancelDialogDescription')}
      confirmLabel={t('cancelDialogConfirm')}
      cancelLabel={t('cancelDialogCancel')}
      variant="destructive"
      isLoading={cancelMutation.isPending}
      onConfirm={handleConfirm}
    />
  )
}
