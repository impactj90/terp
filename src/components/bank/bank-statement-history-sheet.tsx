'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2, Trash2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useBankStatements, useDeleteBankStatement } from '@/hooks/useBankStatements'

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BankStatementHistorySheet({ open, onOpenChange }: Props) {
  const t = useTranslations('bankInbox')
  const { data, isLoading } = useBankStatements({ limit: 50 }, open)
  const deleteMutation = useDeleteBankStatement()
  const [confirmId, setConfirmId] = React.useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const confirmStatement = data?.items?.find((s: any) => s.id === confirmId)

  const handleDelete = async () => {
    if (!confirmId) return
    try {
      const result = await deleteMutation.mutateAsync({ statementId: confirmId })
      toast.success(
        t('imports.deleteSuccess', {
          transactions: result?.transactionsDeleted ?? 0,
          payments: result?.paymentsReversed ?? 0,
        }),
      )
      setConfirmId(null)
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error(t('imports.deleteError', { message: msg }))
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col overflow-hidden">
          <SheetHeader>
            <SheetTitle>{t('imports.title')}</SheetTitle>
            <SheetDescription>{t('imports.description')}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !data?.items?.length ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {t('imports.empty')}
              </p>
            ) : (
              <div className="space-y-2 py-4">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {data.items.map((stmt: any) => (
                  <div
                    key={stmt.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">
                        {stmt.fileName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(stmt.importedAt)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => setConfirmId(stmt.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!confirmId}
        onOpenChange={(o) => !o && setConfirmId(null)}
        title={t('imports.deleteConfirmTitle')}
        description={t('imports.deleteConfirmDescription', {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          count: (confirmStatement as any)?._count?.transactions ?? '?',
        })}
        confirmLabel={t('imports.deleteButton')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </>
  )
}
