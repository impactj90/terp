'use client'

import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { SupplierInvoiceDetail } from '@/components/warehouse/supplier-invoice-detail'

export default function WhSupplierInvoiceDetailPage() {
  const t = useTranslations('warehouseSupplierInvoices')
  const params = useParams<{ id: string }>()
  const { allowed: canAccess } = useHasPermission(['wh_supplier_invoices.view'])

  if (canAccess === false) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('noPermission')}
      </div>
    )
  }

  return <SupplierInvoiceDetail id={params.id} />
}
