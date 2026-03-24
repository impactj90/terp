'use client'

import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { SupplierInvoiceList } from '@/components/warehouse/supplier-invoice-list'

export default function WhSupplierInvoicesPage() {
  const t = useTranslations('warehouseSupplierInvoices')
  const { allowed: canAccess } = useHasPermission(['wh_supplier_invoices.view'])

  if (canAccess === false) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('noPermission')}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-6">
      <SupplierInvoiceList />
    </div>
  )
}
