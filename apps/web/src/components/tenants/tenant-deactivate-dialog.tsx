'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useDeactivateTenant } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Tenant = components['schemas']['Tenant']

interface TenantDeactivateDialogProps {
  tenant: Tenant | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function TenantDeactivateDialog({
  tenant,
  open,
  onOpenChange,
  onSuccess,
}: TenantDeactivateDialogProps) {
  const t = useTranslations('adminTenants')
  const deactivateMutation = useDeactivateTenant()

  const handleConfirm = async () => {
    if (!tenant) return
    try {
      await deactivateMutation.mutateAsync({ path: { id: tenant.id } })
      onOpenChange(false)
      onSuccess?.()
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('deactivateTenant')}
      description={tenant ? t('deactivateDescription', { name: tenant.name }) : ''}
      confirmLabel={t('deactivateConfirm')}
      variant="destructive"
      isLoading={deactivateMutation.isPending}
      onConfirm={handleConfirm}
    />
  )
}
