'use client'

import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { ScannerTerminal } from '@/components/warehouse/scanner-terminal'

export default function WhScannerPage() {
  const t = useTranslations('warehouseScanner')
  const { allowed: canAccess } = useHasPermission(['wh_qr.scan'])

  if (canAccess === false) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('noPermission')}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <ScannerTerminal />
    </div>
  )
}
