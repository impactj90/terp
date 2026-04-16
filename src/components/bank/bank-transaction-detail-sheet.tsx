'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  useBankTransactionById,
  useBankTransactionCandidates,
  useManualMatchBankTransaction,
  useIgnoreBankTransaction,
  useUnmatchBankTransaction,
} from '@/hooks/useBankTransactions'
import { BankTransactionIgnoreDialog } from './bank-transaction-ignore-dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

interface Props {
  transactionId: string | null
  onClose: () => void
}

interface AllocationEntry {
  id: string
  type: 'credit' | 'debit'
  amount: number
  label: string
}

export function BankTransactionDetailSheet({ transactionId, onClose }: Props) {
  const t = useTranslations('bankInbox')
  const open = !!transactionId
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tx, isLoading } = useBankTransactionById(transactionId) as { data: any; isLoading: boolean }
  const addressId = tx?.suggestedAddressId ?? undefined
  const { data: candidates } = useBankTransactionCandidates(
    tx?.status === 'unmatched' ? transactionId : null,
    addressId,
  )
  const matchMutation = useManualMatchBankTransaction()
  const ignoreMutation = useIgnoreBankTransaction()
  const unmatchMutation = useUnmatchBankTransaction()
  const [allocations, setAllocations] = React.useState<AllocationEntry[]>([])
  const [showIgnore, setShowIgnore] = React.useState(false)
  const [showUnmatch, setShowUnmatch] = React.useState(false)

  React.useEffect(() => {
    setAllocations([])
  }, [transactionId])

  const toggleCandidate = (
    id: string,
    type: 'credit' | 'debit',
    openAmount: number,
    label: string,
  ) => {
    setAllocations((prev) => {
      const exists = prev.find((a) => a.id === id)
      if (exists) return prev.filter((a) => a.id !== id)
      return [...prev, { id, type, amount: openAmount, label }]
    })
  }

  const updateAllocationAmount = (id: string, amount: number) => {
    setAllocations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, amount } : a)),
    )
  }

  const allocatedSum = Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100
  const txAmount = tx?.amount ?? 0
  const difference = Math.round((txAmount - allocatedSum) * 100) / 100
  const canConfirm = allocations.length > 0 && Math.abs(difference) <= 0.01

  const handleMatch = async () => {
    if (!transactionId || !canConfirm) return
    try {
      await matchMutation.mutateAsync({
        bankTransactionId: transactionId,
        allocations: allocations.map((a) => ({
          ...(a.type === 'credit'
            ? { billingDocumentId: a.id }
            : { inboundInvoiceId: a.id }),
          amount: a.amount,
        })),
      })
      toast.success(t('toast.matchSuccess'))
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error(t('toast.matchError', { message: msg }))
    }
  }

  const handleIgnore = async (reason?: string) => {
    if (!transactionId) return
    try {
      await ignoreMutation.mutateAsync({
        bankTransactionId: transactionId,
        reason,
      })
      toast.success(t('toast.ignoreSuccess'))
      setShowIgnore(false)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error(msg)
    }
  }

  const handleUnmatch = async () => {
    if (!transactionId) return
    try {
      await unmatchMutation.mutateAsync({ bankTransactionId: transactionId })
      toast.success(t('toast.unmatchSuccess'))
      setShowUnmatch(false)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error(t('toast.unmatchError', { message: msg }))
    }
  }

  const creditCandidates = candidates?.creditCandidates ?? []
  const debitCandidates = candidates?.debitCandidates ?? []
  const hasCandidates = creditCandidates.length > 0 || debitCandidates.length > 0

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl flex flex-col overflow-hidden"
        >
          <SheetHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <SheetTitle className="truncate">{t('detail.title')}</SheetTitle>
                <SheetDescription>
                  {tx?.counterpartyName ?? '-'} · {formatCurrency(tx?.amount)}
                </SheetDescription>
              </div>
              {tx && (
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline">
                    {t(`direction.${tx.direction === 'CREDIT' ? 'credit' : 'debit'}`)}
                  </Badge>
                  <Badge variant={tx.status === 'matched' ? 'default' : tx.status === 'ignored' ? 'secondary' : 'outline'}>
                    {t(`status.${tx.status as 'unmatched' | 'matched' | 'ignored'}`)}
                  </Badge>
                </div>
              )}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : tx ? (
              <div className="space-y-6 py-4">
                {/* Transaction info */}
                <div>
                  <h3 className="font-medium mb-3">{t('detail.transactionInfo')}</h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">{t('detail.bookingDate')}</dt>
                    <dd>{formatDate(tx.bookingDate)}</dd>
                    <dt className="text-muted-foreground">{t('detail.valueDate')}</dt>
                    <dd>{formatDate(tx.valueDate)}</dd>
                    <dt className="text-muted-foreground">{t('detail.counterpartyName')}</dt>
                    <dd>{tx.counterpartyName ?? '-'}</dd>
                    <dt className="text-muted-foreground">{t('detail.counterpartyIban')}</dt>
                    <dd className="font-mono text-xs">{tx.counterpartyIban ?? '-'}</dd>
                    {tx.remittanceInfo && (
                      <>
                        <dt className="text-muted-foreground">{t('detail.remittanceInfo')}</dt>
                        <dd className="col-span-1 break-words">{tx.remittanceInfo}</dd>
                      </>
                    )}
                    {tx.endToEndId && (
                      <>
                        <dt className="text-muted-foreground">{t('detail.endToEndId')}</dt>
                        <dd className="font-mono text-xs">{tx.endToEndId}</dd>
                      </>
                    )}
                  </dl>
                </div>

                {/* Suggested customer hint */}
                {tx.status === 'unmatched' && tx.suggestedAddress && (
                  <div className="rounded-md bg-muted/50 p-3 text-sm">
                    <span className="font-medium">{t('detail.suggestedCustomer')}: </span>
                    {t('detail.suggestedCustomerHint', {
                      name: tx.suggestedAddress.company,
                    })}
                  </div>
                )}

                {/* Matched allocations */}
                {tx.status === 'matched' && (
                  <div>
                    <h3 className="font-medium mb-3">{t('detail.allocations')}</h3>
                    <div className="space-y-2">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(tx.billingAllocations ?? []).map((a: any) => (
                        <div key={a.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                          <span>{a.billingDocument?.number} ({a.billingDocument?.type})</span>
                          <span className="font-medium">{formatCurrency(a.amount)}</span>
                        </div>
                      ))}
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(tx.inboundAllocations ?? []).map((a: any) => (
                        <div key={a.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                          <span>{a.inboundInvoice?.number} {a.inboundInvoice?.invoiceNumber ? `(${a.inboundInvoice.invoiceNumber})` : ''}</span>
                          <span className="font-medium">{formatCurrency(a.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ignored info */}
                {tx.status === 'ignored' && (
                  <div>
                    <h3 className="font-medium mb-3">{t('detail.ignoredInfo')}</h3>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <dt className="text-muted-foreground">{t('detail.ignoredAt')}</dt>
                      <dd>{formatDate(tx.ignoredAt)}</dd>
                      <dt className="text-muted-foreground">{t('detail.ignoredReason')}</dt>
                      <dd>{tx.ignoredReason || t('detail.noReason')}</dd>
                    </dl>
                  </div>
                )}

                {/* Candidates for unmatched */}
                {tx.status === 'unmatched' && (
                  <div>
                    <h3 className="font-medium mb-3">{t('detail.candidatesHeading')}</h3>
                    {!hasCandidates ? (
                      <p className="text-sm text-muted-foreground">{t('detail.candidatesEmpty')}</p>
                    ) : (
                      <div className="space-y-2">
                        {creditCandidates.map((doc) => {
                          const selected = allocations.find((a) => a.id === doc.id)
                          return (
                            <div
                              key={doc.id}
                              className="flex items-center gap-3 rounded-md border p-3"
                            >
                              <Checkbox
                                checked={!!selected}
                                onCheckedChange={() =>
                                  toggleCandidate(doc.id, 'credit', doc.openAmount, doc.number)
                                }
                              />
                              <div className="flex-1 min-w-0 text-sm">
                                <div className="font-medium">{doc.number}</div>
                                <div className="text-muted-foreground truncate">
                                  {doc.address?.company ?? '-'} · {formatCurrency(doc.openAmount)}
                                </div>
                              </div>
                              {selected && (
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  className="w-28 text-right"
                                  value={selected.amount}
                                  onChange={(e) =>
                                    updateAllocationAmount(doc.id, parseFloat(e.target.value) || 0)
                                  }
                                />
                              )}
                            </div>
                          )
                        })}
                        {debitCandidates.map((inv) => {
                          const selected = allocations.find((a) => a.id === inv.id)
                          return (
                            <div
                              key={inv.id}
                              className="flex items-center gap-3 rounded-md border p-3"
                            >
                              <Checkbox
                                checked={!!selected}
                                onCheckedChange={() =>
                                  toggleCandidate(inv.id, 'debit', inv.openAmount, inv.number)
                                }
                              />
                              <div className="flex-1 min-w-0 text-sm">
                                <div className="font-medium">
                                  {inv.number}
                                  {inv.invoiceNumber && (
                                    <span className="ml-1 text-muted-foreground">({inv.invoiceNumber})</span>
                                  )}
                                </div>
                                <div className="text-muted-foreground truncate">
                                  {inv.sellerName ?? inv.address?.company ?? '-'} · {formatCurrency(inv.openAmount)}
                                </div>
                              </div>
                              {selected && (
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  className="w-28 text-right"
                                  value={selected.amount}
                                  onChange={(e) =>
                                    updateAllocationAmount(inv.id, parseFloat(e.target.value) || 0)
                                  }
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Sticky footer for matched — unmatch action */}
          {tx?.status === 'matched' && (
            <div className="border-t pt-4">
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowUnmatch(true)}
                >
                  {t('unmatch.button')}
                </Button>
              </div>
            </div>
          )}

          {/* Sticky footer for unmatched */}
          {tx?.status === 'unmatched' && (
            <div className="border-t pt-4 space-y-3">
              {allocations.length > 0 && (
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t('footer.allocatedSum')}</span>
                    <div className="font-medium">{formatCurrency(allocatedSum)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('footer.transactionAmount')}</span>
                    <div className="font-medium">{formatCurrency(txAmount)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('footer.difference')}</span>
                    <div className={`font-medium ${Math.abs(difference) > 0.01 ? 'text-destructive' : 'text-green-600'}`}>
                      {formatCurrency(difference)}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowIgnore(true)}
                >
                  {t('footer.ignoreAction')}
                </Button>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  onClick={onClose}
                >
                  {t('footer.cancel')}
                </Button>
                <Button
                  onClick={handleMatch}
                  disabled={!canConfirm || matchMutation.isPending}
                >
                  {matchMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t('footer.confirmMatch')}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <BankTransactionIgnoreDialog
        open={showIgnore}
        onOpenChange={setShowIgnore}
        onConfirm={handleIgnore}
        isLoading={ignoreMutation.isPending}
      />

      <ConfirmDialog
        open={showUnmatch}
        onOpenChange={setShowUnmatch}
        title={t('unmatch.confirmTitle')}
        description={t('unmatch.confirmDescription')}
        confirmLabel={t('unmatch.confirm')}
        variant="destructive"
        isLoading={unmatchMutation.isPending}
        onConfirm={handleUnmatch}
      />
    </>
  )
}
