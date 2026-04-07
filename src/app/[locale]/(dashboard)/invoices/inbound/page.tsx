'use client'

import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { InboundInvoiceList } from '@/components/invoices/inbound-invoice-list'

export default function InboundInvoicesPage() {
  const t = useTranslations('inboundInvoices')
  const { allowed: canAccess } = useHasPermission(['inbound_invoices.view'])

  if (canAccess === false) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('common.noPermission')}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <InboundInvoiceList />
    </div>
  )
}
