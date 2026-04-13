'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  usePaymentRunProposal,
  useCreatePaymentRun,
} from '@/hooks/usePaymentRuns'

type DataSource = 'CRM' | 'INVOICE'

interface Resolution {
  ibanSource: DataSource
  addressSource: DataSource
}

const formatDate = (d: string | Date | null | undefined) => {
  if (!d) return '—'
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(d))
}

const formatCents = (cents: number | null | undefined) => {
  if (cents == null) return '—'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

function maskIban(iban: string | null | undefined): string {
  if (!iban) return '—'
  const clean = iban.replace(/\s+/g, '')
  if (clean.length < 8) return clean
  return `${clean.slice(0, 4)} **** **** ${clean.slice(-4)}`
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function inNDaysIso(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function ProposalSection() {
  const t = useTranslations('paymentRuns.proposal')
  const tStatus = useTranslations('paymentRuns.proposal.badge')
  const tBlocker = useTranslations('paymentRuns.proposal.blocker')
  const tConflict = useTranslations('paymentRuns.proposal.conflict')
  const tFooter = useTranslations('paymentRuns.proposal.footer')
  const router = useRouter()

  const [fromDueDate, setFromDueDate] = React.useState(todayIso())
  const [toDueDate, setToDueDate] = React.useState(inNDaysIso(7))
  const [executionDate, setExecutionDate] = React.useState(inNDaysIso(1))
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    () => new Set()
  )
  const [resolutions, setResolutions] = React.useState<
    Map<string, Resolution>
  >(() => new Map())

  const { data: rows, isLoading } = usePaymentRunProposal({
    fromDueDate,
    toDueDate,
  })

  const createMutation = useCreatePaymentRun()

  const effectiveResolution = React.useCallback(
    (row: NonNullable<typeof rows>[number]): Resolution | null => {
      const override = resolutions.get(row.invoiceId)
      if (override) return override
      // GREEN rows: infer from the resolver's chosen source
      const ibanSource =
        row.iban.source === 'INVOICE' ? 'INVOICE' : 'CRM'
      const addressSource =
        row.address.source === 'INVOICE' ? 'INVOICE' : 'CRM'
      if (row.status === 'GREEN') return { ibanSource, addressSource }
      return null
    },
    [resolutions]
  )

  const toggleSelect = (invoiceId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(invoiceId)) next.delete(invoiceId)
      else next.add(invoiceId)
      return next
    })
  }

  const setResolution = (
    invoiceId: string,
    kind: 'iban' | 'address',
    value: DataSource
  ) => {
    setResolutions((prev) => {
      const next = new Map(prev)
      const existing =
        next.get(invoiceId) ??
        ({ ibanSource: 'CRM', addressSource: 'CRM' } as Resolution)
      next.set(invoiceId, {
        ...existing,
        ...(kind === 'iban' ? { ibanSource: value } : { addressSource: value }),
      })
      return next
    })
  }

  const selectedRows = React.useMemo(
    () =>
      (rows ?? []).filter((r) => selectedIds.has(r.invoiceId)),
    [rows, selectedIds]
  )

  const totalCents = selectedRows.reduce((acc, r) => acc + r.amountCents, 0)

  const canCreate = selectedRows.length > 0 && selectedRows.every((r) => {
    if (r.status === 'GREEN') return true
    if (r.status === 'YELLOW') {
      const choice = resolutions.get(r.invoiceId)
      if (!choice) return false
      // Both an IBAN source and an address source must be chosen if
      // either of those conflicts is present.
      const ibanConflict = r.blockers.some((b) => b.type === 'IBAN_CONFLICT')
      const addressConflict = r.blockers.some(
        (b) => b.type === 'ADDRESS_CONFLICT'
      )
      if (ibanConflict && !choice.ibanSource) return false
      if (addressConflict && !choice.addressSource) return false
      return true
    }
    return false
  })

  const handleSubmit = async () => {
    if (!canCreate) return
    try {
      const items = selectedRows.map((r) => {
        const res = effectiveResolution(r)
        if (!res) {
          throw new Error(`Missing resolution for ${r.invoiceId}`)
        }
        return {
          invoiceId: r.invoiceId,
          ibanSource: res.ibanSource,
          addressSource: res.addressSource,
        }
      })
      const run = await createMutation.mutateAsync({
        executionDate,
        items,
      })
      toast.success(`${run.number}`)
      router.push(`/invoices/inbound/payment-runs/${run.id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('sectionTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter toolbar */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              {t('filters.dateRange')}
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={fromDueDate}
                onChange={(e) => setFromDueDate(e.target.value)}
                className="w-40"
              />
              <span>–</span>
              <Input
                type="date"
                value={toDueDate}
                onChange={(e) => setToDueDate(e.target.value)}
                className="w-40"
              />
            </div>
          </div>
        </div>

        {/* Proposal table */}
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !rows || rows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {t('emptyState')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>{t('columns.supplier')}</TableHead>
                <TableHead>{t('columns.number')}</TableHead>
                <TableHead>{t('columns.dueDate')}</TableHead>
                <TableHead className="text-right">
                  {t('columns.amount')}
                </TableHead>
                <TableHead>{t('columns.iban')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isSelected = selectedIds.has(row.invoiceId)
                const isRed = row.status === 'RED'
                const isYellow = row.status === 'YELLOW'
                const isGreen = row.status === 'GREEN'
                const ibanConflict = row.blockers.some(
                  (b) => b.type === 'IBAN_CONFLICT'
                )
                const addressConflict = row.blockers.some(
                  (b) => b.type === 'ADDRESS_CONFLICT'
                )
                const resolved = effectiveResolution(row)
                const checkboxEnabled =
                  isGreen || (isYellow && resolved !== null)

                return (
                  <React.Fragment key={row.invoiceId}>
                    <TableRow data-invoice-id={row.invoiceId}>
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          disabled={!checkboxEnabled}
                          onCheckedChange={() => toggleSelect(row.invoiceId)}
                          aria-label={`select-${row.invoiceId}`}
                        />
                      </TableCell>
                      <TableCell>{row.supplierName ?? '—'}</TableCell>
                      <TableCell>{row.invoiceNumber ?? '—'}</TableCell>
                      <TableCell>{formatDate(row.dueDate)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCents(row.amountCents)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {maskIban(row.iban.iban)}
                      </TableCell>
                      <TableCell>
                        {isGreen && (
                          <Badge className="bg-green-100 text-green-900 hover:bg-green-100">
                            {tStatus('green')}
                          </Badge>
                        )}
                        {isYellow && (
                          <Badge className="bg-yellow-100 text-yellow-900 hover:bg-yellow-100">
                            {tStatus('yellow')}
                          </Badge>
                        )}
                        {isRed && (
                          <Badge className="bg-red-100 text-red-900 hover:bg-red-100">
                            {tStatus('red')}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>

                    {isRed && (
                      <TableRow>
                        <TableCell />
                        <TableCell colSpan={6} className="pb-4 text-sm">
                          <div className="space-y-1">
                            {row.blockers.map((b, idx) => (
                              <p
                                key={`${row.invoiceId}-blk-${idx}`}
                                className="text-red-700"
                              >
                                {b.type === 'IBAN_INVALID'
                                  ? tBlocker('IBAN_INVALID', {
                                      value: b.value,
                                    })
                                  : b.type === 'NO_IBAN'
                                    ? tBlocker('NO_IBAN', {
                                        name: row.supplierName ?? '',
                                      })
                                    : b.type === 'NO_ADDRESS'
                                      ? tBlocker('NO_ADDRESS', {
                                          name: row.supplierName ?? '',
                                        })
                                      : b.type === 'NO_SUPPLIER'
                                        ? tBlocker('NO_SUPPLIER')
                                        : b.type === 'NOT_APPROVED'
                                          ? tBlocker('NOT_APPROVED')
                                          : b.type === 'ALREADY_IN_ACTIVE_RUN'
                                            ? tBlocker('ALREADY_IN_ACTIVE_RUN')
                                            : String(b.type)}
                              </p>
                            ))}
                            {row.supplierId && (
                              <Link
                                className="text-primary underline"
                                href={`/crm/addresses/${row.supplierId}`}
                              >
                                {tBlocker('openSupplier')}
                              </Link>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}

                    {isYellow && (
                      <TableRow>
                        <TableCell />
                        <TableCell colSpan={6} className="pb-4">
                          <div className="space-y-3 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm">
                            {ibanConflict && (
                              <div className="space-y-2">
                                <p className="font-medium">
                                  {tBlocker('IBAN_CONFLICT')}
                                </p>
                                <RadioGroup
                                  value={
                                    resolutions.get(row.invoiceId)?.ibanSource
                                  }
                                  onValueChange={(v) =>
                                    setResolution(
                                      row.invoiceId,
                                      'iban',
                                      v as DataSource
                                    )
                                  }
                                >
                                  <div className="flex items-center gap-2">
                                    <RadioGroupItem
                                      value="CRM"
                                      id={`${row.invoiceId}-iban-crm`}
                                    />
                                    <Label
                                      htmlFor={`${row.invoiceId}-iban-crm`}
                                      className="font-mono text-xs"
                                    >
                                      {tConflict('useCrm')} —{' '}
                                      {maskIban(row.iban.conflict?.crm?.iban)}
                                    </Label>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <RadioGroupItem
                                      value="INVOICE"
                                      id={`${row.invoiceId}-iban-inv`}
                                    />
                                    <Label
                                      htmlFor={`${row.invoiceId}-iban-inv`}
                                      className="font-mono text-xs"
                                    >
                                      {tConflict('useInvoice')} —{' '}
                                      {maskIban(
                                        row.iban.conflict?.invoice?.iban
                                      )}
                                    </Label>
                                  </div>
                                </RadioGroup>
                              </div>
                            )}
                            {addressConflict && (
                              <div className="space-y-2">
                                <p className="font-medium">
                                  {tBlocker('ADDRESS_CONFLICT')}
                                </p>
                                <RadioGroup
                                  value={
                                    resolutions.get(row.invoiceId)
                                      ?.addressSource
                                  }
                                  onValueChange={(v) =>
                                    setResolution(
                                      row.invoiceId,
                                      'address',
                                      v as DataSource
                                    )
                                  }
                                >
                                  <div className="flex items-center gap-2">
                                    <RadioGroupItem
                                      value="CRM"
                                      id={`${row.invoiceId}-addr-crm`}
                                    />
                                    <Label
                                      htmlFor={`${row.invoiceId}-addr-crm`}
                                    >
                                      {tConflict('useCrm')} —{' '}
                                      {row.address.conflict?.crm?.city}{' '}
                                      ({row.address.conflict?.crm?.country})
                                    </Label>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <RadioGroupItem
                                      value="INVOICE"
                                      id={`${row.invoiceId}-addr-inv`}
                                    />
                                    <Label
                                      htmlFor={`${row.invoiceId}-addr-inv`}
                                    >
                                      {tConflict('useInvoice')} —{' '}
                                      {row.address.conflict?.invoice?.city}{' '}
                                      ({row.address.conflict?.invoice?.country}
                                      )
                                    </Label>
                                  </div>
                                </RadioGroup>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                )
              })}
            </TableBody>
          </Table>
        )}

        {/* Footer action bar */}
        {selectedIds.size > 0 && (
          <div className="sticky bottom-0 flex flex-wrap items-end gap-3 border-t bg-card pt-3">
            <div className="text-sm">
              <span className="font-medium">
                {tFooter('selected', { count: selectedRows.length })}
              </span>
              <span className="ml-3 text-muted-foreground">
                {tFooter('totalAmount', {
                  amount: formatCents(totalCents),
                })}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                {tFooter('executionDate')}
              </label>
              <Input
                type="date"
                value={executionDate}
                onChange={(e) => setExecutionDate(e.target.value)}
                className="w-40"
              />
            </div>
            <Button
              className="ml-auto"
              disabled={!canCreate || createMutation.isPending}
              onClick={handleSubmit}
            >
              {tFooter('createButton')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
