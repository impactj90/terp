'use client'

import * as React from 'react'
import { Plus, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDemoTenants } from '@/hooks'
import { DemoTenantsTable, type DemoTenantRow } from './demo-tenants-table'
import { DemoCreateSheet } from './demo-create-sheet'
import { DemoConvertDialog } from './demo-convert-dialog'

/**
 * Self-contained panel rendered above the regular tenant table in /admin/tenants.
 * Owns its own create sheet + convert dialog state.
 */
export function DemoTenantsPanel() {
  const t = useTranslations('adminTenants')
  const { data: demos, isLoading } = useDemoTenants()
  const [createOpen, setCreateOpen] = React.useState(false)
  const [convertItem, setConvertItem] = React.useState<DemoTenantRow | null>(null)

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">{t('demo.panelTitle')}</CardTitle>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('demo.newDemoButton')}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-32" />
            </div>
          ) : !demos || demos.length === 0 ? (
            <div className="py-10 px-6 text-center">
              <p className="text-sm text-muted-foreground">
                {t('demo.emptyState')}
              </p>
            </div>
          ) : (
            <DemoTenantsTable
              items={demos as DemoTenantRow[]}
              onConvert={(item) => setConvertItem(item)}
            />
          )}
        </CardContent>
      </Card>

      <DemoCreateSheet open={createOpen} onOpenChange={setCreateOpen} />

      <DemoConvertDialog
        demo={convertItem}
        open={!!convertItem}
        onOpenChange={(open) => {
          if (!open) setConvertItem(null)
        }}
      />
    </>
  )
}
