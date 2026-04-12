'use client'

import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { InboundPendingApprovals } from '@/components/invoices/inbound-pending-approvals'

export default function InboundApprovalsPage() {
  const t = useTranslations('inboundInvoices')
  const { allowed: canAccess } = useHasPermission(['inbound_invoices.approve'])

  if (canAccess === false) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('common.noApprovalPermission')}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">{t('approval.pageTitle')}</h1>
      <InboundPendingApprovals />
    </div>
  )
}
