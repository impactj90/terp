'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Play } from 'lucide-react'
import { BankTransactionList } from '@/components/bank/bank-transaction-list'
import { BankTransactionDetailSheet } from '@/components/bank/bank-transaction-detail-sheet'
import { BankStatementUploadDialog } from '@/components/bank/bank-statement-upload-dialog'
import { BankStatementHistorySheet } from '@/components/bank/bank-statement-history-sheet'
import { useBankTransactionCounts } from '@/hooks/useBankTransactions'
import { useAutoMatchBatch, useLastUnmatchedStatement } from '@/hooks/useBankStatements'
import { useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/trpc'

type TabStatus = 'unmatched' | 'matched' | 'ignored'

export default function BankInboxPage() {
  const t = useTranslations('bankInbox')
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [tab, setTab] = React.useState<TabStatus>('unmatched')
  const [selectedTxId, setSelectedTxId] = React.useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const { data: counts } = useBankTransactionCounts()
  const { data: lastUnmatched } = useLastUnmatchedStatement()

  const autoMatchBatch = useAutoMatchBatch()
  const cancelledRef = React.useRef(false)
  const [isMatching, setIsMatching] = React.useState(false)

  const invalidateAll = React.useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: trpc.bankStatements.bankTransactions.list.queryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.bankStatements.bankTransactions.counts.queryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.billing.payments.openItems.list.queryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.billing.payments.openItems.summary.queryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.bankStatements.lastUnmatched.queryKey(),
    })
  }, [queryClient, trpc])

  const runMatchLoop = React.useCallback(
    async (statementId: string, total: number) => {
      cancelledRef.current = false
      setIsMatching(true)
      const toastId = `match-${statementId}`
      let processed = 0
      let totalMatched = 0

      toast.loading(`${t('upload.matchingProgress')}  0/${total}`, {
        id: toastId,
        duration: Infinity,
        action: {
          label: t('upload.cancel'),
          onClick: () => { cancelledRef.current = true },
        },
      })

      while (!cancelledRef.current) {
        try {
          const result = await autoMatchBatch.mutateAsync({
            statementId,
            batchSize: 20,
          })

          processed += result.processed
          totalMatched += result.autoMatched
          const pct = total > 0 ? Math.round((processed / total) * 100) : 0

          if (result.remaining === 0 || result.processed === 0) {
            toast.success(
              t('upload.matchingDone', { matched: totalMatched, total }),
              { id: toastId, action: undefined },
            )
            break
          }

          toast.loading(`${t('upload.matchingProgress')}  ${processed}/${total}  (${pct}%)`, {
            id: toastId,
            duration: Infinity,
            action: {
              label: t('upload.cancel'),
              onClick: () => { cancelledRef.current = true },
            },
          })
        } catch {
          toast.error(t('upload.matchingError'), { id: toastId, action: undefined })
          break
        }
      }

      if (cancelledRef.current) {
        toast.info(
          `${t('upload.matchingCancelled')}  ${processed}/${total}`,
          { id: toastId, action: undefined },
        )
      }

      setIsMatching(false)
      invalidateAll()
    },
    [autoMatchBatch, invalidateAll, t],
  )

  const handleImportComplete = React.useCallback(
    (statementId: string, total: number) => {
      runMatchLoop(statementId, total)
    },
    [runMatchLoop],
  )

  const handleResume = React.useCallback(() => {
    if (!lastUnmatched) return
    runMatchLoop(lastUnmatched.statementId, lastUnmatched.pending)
  }, [lastUnmatched, runMatchLoop])

  const showResumeButton = !isMatching && lastUnmatched && lastUnmatched.pending > 0

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('pageTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('pageSubtitle')}</p>
        </div>
        <div className="flex gap-2">
          {showResumeButton && (
            <Button variant="outline" onClick={handleResume}>
              <Play className="mr-2 h-4 w-4" />
              {t('upload.matchingResume', { count: lastUnmatched.pending })}
            </Button>
          )}
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
        onImportComplete={handleImportComplete}
      />

      <BankStatementHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  )
}
