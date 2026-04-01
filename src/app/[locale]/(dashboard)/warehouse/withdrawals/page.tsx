'use client'

import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { WithdrawalTerminal } from '@/components/warehouse/withdrawal-terminal'
import { WithdrawalHistory } from '@/components/warehouse/withdrawal-history'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PackageMinus, History } from 'lucide-react'

export default function WhWithdrawalsPage() {
  const t = useTranslations('warehouseWithdrawals')
  const { allowed: canAccess } = useHasPermission(['wh_stock.manage'])

  if (canAccess === false) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('noPermission')}
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('pageDescription')}</p>
      </div>
      <Tabs defaultValue="terminal">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="terminal" className="gap-2">
            <PackageMinus className="h-4 w-4" />
            {t('tabTerminal')}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            {t('tabHistory')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="terminal" className="mt-4 sm:mt-6">
          <WithdrawalTerminal />
        </TabsContent>
        <TabsContent value="history" className="mt-4 sm:mt-6">
          <WithdrawalHistory />
        </TabsContent>
      </Tabs>
    </div>
  )
}
