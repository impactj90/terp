'use client'

import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { InboundInvoiceDetail } from '@/components/invoices/inbound-invoice-detail'

export default function InboundInvoiceDetailPage() {
  const params = useParams<{ id: string }>()
  const t = useTranslations('inboundInvoices')
  const { allowed: canAccess } = useHasPermission(['inbound_invoices.view'])

  if (canAccess === false) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('common.noPermission')}
      </div>
    )
  }

  return <InboundInvoiceDetail id={params.id} />
}
