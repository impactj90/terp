'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useDeleteUser } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type User = components['schemas']['User']

interface UserDeleteDialogProps {
  user: User | null
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function UserDeleteDialog({ user, onOpenChange, onSuccess }: UserDeleteDialogProps) {
  const t = useTranslations('adminUsers')
  const tCommon = useTranslations('common')
  const deleteMutation = useDeleteUser()

  const handleConfirm = async () => {
    if (!user) return
    try {
      await deleteMutation.mutateAsync({ path: { id: user.id } })
      onSuccess?.()
      onOpenChange(false)
    } catch {
      // error handled by mutation
    }
  }

  return (
    <ConfirmDialog
      open={!!user}
      onOpenChange={onOpenChange}
      title={t('deleteUser')}
      description={
        user ? t('deleteDescription', { name: user.display_name, email: user.email }) : ''
      }
      confirmLabel={tCommon('delete')}
      cancelLabel={tCommon('cancel')}
      variant="destructive"
      isLoading={deleteMutation.isPending}
      onConfirm={handleConfirm}
    />
  )
}
