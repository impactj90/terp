'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { BankTransactionList } from '@/components/bank/bank-transaction-list'
import { BankTransactionDetailSheet } from '@/components/bank/bank-transaction-detail-sheet'
import { BankStatementUploadDialog } from '@/components/bank/bank-statement-upload-dialog'
import { BankStatementHistorySheet } from '@/components/bank/bank-statement-history-sheet'
import { useBankTransactionCounts } from '@/hooks/useBankTransactions'

type TabStatus = 'unmatched' | 'matched' | 'ignored'

export default function BankInboxPage() {
  const t = useTranslations('bankInbox')
  const [tab, setTab] = React.useState<TabStatus>('unmatched')
  const [selectedTxId, setSelectedTxId] = React.useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const { data: counts } = useBankTransactionCounts()

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('pageTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('pageSubtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setHistoryOpen(true)}>
            {t('imports.button')}
          </Button>
          <Button onClick={() => setUploadOpen(true)}>
            {t('upload.button')}
          </Button>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabStatus)}>
        <TabsList>
          <TabsTrigger value="unmatched" className="gap-2">
            {t('tabs.unmatched')}
            {counts?.unmatched != null && counts.unmatched > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-xs">
                {counts.unmatched}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="matched" className="gap-2">
            {t('tabs.matched')}
            {counts?.matched != null && counts.matched > 0 && (
              <Badge variant="outline" className="ml-1 h-5 min-w-[20px] px-1.5 text-xs">
                {counts.matched}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ignored" className="gap-2">
            {t('tabs.ignored')}
            {counts?.ignored != null && counts.ignored > 0 && (
              <Badge variant="outline" className="ml-1 h-5 min-w-[20px] px-1.5 text-xs">
                {counts.ignored}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unmatched">
          <BankTransactionList status="unmatched" onRowClick={setSelectedTxId} />
        </TabsContent>
        <TabsContent value="matched">
          <BankTransactionList status="matched" onRowClick={setSelectedTxId} />
        </TabsContent>
        <TabsContent value="ignored">
          <BankTransactionList status="ignored" onRowClick={setSelectedTxId} />
        </TabsContent>
      </Tabs>

      <BankTransactionDetailSheet
        transactionId={selectedTxId}
        onClose={() => setSelectedTxId(null)}
      />

      <BankStatementUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
      />

      <BankStatementHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  )
}
