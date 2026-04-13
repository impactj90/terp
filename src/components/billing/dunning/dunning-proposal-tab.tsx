'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  useDunningProposal,
  useCreateDunningRun,
  useDunningSettings,
} from '@/hooks'
import { toast } from 'sonner'

function feeForLevel(feeAmounts: number[], level: number): number {
  if (level < 1 || level > feeAmounts.length) return 0
  return feeAmounts[level - 1] ?? 0
}

type ProposalGroup = {
  customerAddressId: string
  customerName: string
  customerEmail: string | null
  groupTargetLevel: number
  invoices: Array<{
    billingDocumentId: string
    invoiceNumber: string
    invoiceDate: Date | string
    dueDate: Date | string
    daysOverdue: number
    openAmount: number
    interestAmount: number
    targetLevel: number
  }>
  totalOpenAmount: number
  totalInterest: number
  totalFees: number
  totalDue: number
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

interface DunningProposalTabProps {
  onAfterCreateRun?: () => void
}

export function DunningProposalTab({ onAfterCreateRun }: DunningProposalTabProps) {
  const t = useTranslations('billingDunning')
  const { data: proposal, isLoading } = useDunningProposal()
  const { data: settings } = useDunningSettings()
  const createRunMutation = useCreateDunningRun()

  // Selected groups (default: all groups selected when proposal loads)
  const [selectedGroups, setSelectedGroups] = React.useState<Set<string>>(new Set())
  // Selected invoices per group (default: all invoices selected within selected groups)
  const [selectedInvoices, setSelectedInvoices] = React.useState<
    Map<string, Set<string>>
  >(new Map())
  // Expanded groups (UI-only)
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set())

  // When proposal loads, default-select every group + every invoice.
  React.useEffect(() => {
    if (!proposal) return
    const groups = proposal as ProposalGroup[]
    setSelectedGroups(new Set(groups.map((g) => g.customerAddressId)))
    const invMap = new Map<string, Set<string>>()
    for (const g of groups) {
      invMap.set(
        g.customerAddressId,
        new Set(g.invoices.map((i) => i.billingDocumentId))
      )
    }
    setSelectedInvoices(invMap)
    setExpandedGroups(new Set())
  }, [proposal])

  const groups = (proposal as ProposalGroup[] | undefined) ?? []

  const toggleGroup = (id: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleInvoice = (groupId: string, invoiceId: string) => {
    setSelectedInvoices((prev) => {
      const next = new Map(prev)
      const set = new Set(next.get(groupId) ?? [])
      if (set.has(invoiceId)) set.delete(invoiceId)
      else set.add(invoiceId)
      next.set(groupId, set)
      return next
    })
  }

  const toggleExpanded = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Compute live group totals based on currently-selected invoices.
  function computeGroupTotals(group: ProposalGroup) {
    const invIds = selectedInvoices.get(group.customerAddressId) ?? new Set<string>()
    const selectedInvs = group.invoices.filter((i) => invIds.has(i.billingDocumentId))
    const totalOpen = selectedInvs.reduce((s, i) => s + i.openAmount, 0)
    const totalInterest = selectedInvs.reduce((s, i) => s + i.interestAmount, 0)
    const targetLevel = selectedInvs.reduce(
      (max, i) => Math.max(max, i.targetLevel),
      1
    )
    const fee = settings && selectedInvs.length > 0
      ? feeForLevel(settings.feeAmounts, targetLevel)
      : 0
    return {
      totalOpen: round2(totalOpen),
      totalInterest: round2(totalInterest),
      totalFees: round2(fee),
      totalDue: round2(totalOpen + totalInterest + fee),
      selectedCount: selectedInvs.length,
      targetLevel,
    }
  }

  function round2(v: number): number {
    return Math.round(v * 100) / 100
  }

  const totalSelectedInvoices = React.useMemo(() => {
    let count = 0
    for (const g of groups) {
      if (!selectedGroups.has(g.customerAddressId)) continue
      const set = selectedInvoices.get(g.customerAddressId)
      count += set?.size ?? 0
    }
    return count
  }, [groups, selectedGroups, selectedInvoices])

  const handleCreateRun = async () => {
    const payload = {
      groups: groups
        .filter((g) => selectedGroups.has(g.customerAddressId))
        .map((g) => {
          const invIds = Array.from(
            selectedInvoices.get(g.customerAddressId) ?? new Set<string>()
          )
          return { customerAddressId: g.customerAddressId, billingDocumentIds: invIds }
        })
        .filter((g) => g.billingDocumentIds.length > 0),
    }

    if (payload.groups.length === 0) {
      toast.error(t('proposal.noSelection'))
      return
    }

    try {
      const result = await createRunMutation.mutateAsync(payload)
      const created = result?.reminderIds?.length ?? 0
      const skipped = result?.skippedInvoices?.length ?? 0
      toast.success(t('proposal.createdSuccess', { created, skipped }))
      onAfterCreateRun?.()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('proposal.createError')
      )
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        {t('loading')}
      </div>
    )
  }

  if (!groups.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t('proposal.empty')}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {t('proposal.summary', { groups: groups.length, invoices: totalSelectedInvoices })}
        </p>
        <Button
          onClick={handleCreateRun}
          disabled={createRunMutation.isPending || totalSelectedInvoices === 0}
        >
          {createRunMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-1" />
          )}
          {t('proposal.createRun')}
        </Button>
      </div>

      <div className="space-y-2">
        {groups.map((group) => {
          const isExpanded = expandedGroups.has(group.customerAddressId)
          const isSelected = selectedGroups.has(group.customerAddressId)
          const totals = computeGroupTotals(group)
          const groupInvSet = selectedInvoices.get(group.customerAddressId) ?? new Set()

          return (
            <Card key={group.customerAddressId} data-testid="proposal-group-row">
              <Collapsible
                open={isExpanded}
                onOpenChange={() => toggleExpanded(group.customerAddressId)}
              >
                <CardContent className="py-3">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleGroup(group.customerAddressId)}
                      aria-label={t('proposal.selectGroup')}
                    />
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={t('proposal.toggleDetails')}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {group.customerName}
                        </span>
                        <Badge variant="outline">
                          {t('proposal.levelBadge', { level: totals.targetLevel })}
                        </Badge>
                        <Badge variant="secondary">
                          {t('proposal.invoiceCount', { count: totals.selectedCount })}
                        </Badge>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">
                        {t('proposal.totalDueLabel')}
                      </div>
                      <div
                        className="text-base font-semibold"
                        data-testid="group-total-due"
                      >
                        {formatCurrency(totals.totalDue)}
                      </div>
                    </div>
                  </div>

                  <CollapsibleContent>
                    <div className="mt-3 border-t pt-3 space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <div>
                          {t('proposal.totalOpen')}: {formatCurrency(totals.totalOpen)}
                        </div>
                        <div>
                          {t('proposal.totalInterest')}: {formatCurrency(totals.totalInterest)}
                        </div>
                        <div>
                          {t('proposal.totalFees')}: {formatCurrency(totals.totalFees)}
                        </div>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40px]"></TableHead>
                            <TableHead>{t('proposal.columnInvoiceNumber')}</TableHead>
                            <TableHead>{t('proposal.columnInvoiceDate')}</TableHead>
                            <TableHead>{t('proposal.columnDueDate')}</TableHead>
                            <TableHead className="text-right">
                              {t('proposal.columnOpenAmount')}
                            </TableHead>
                            <TableHead className="text-right">
                              {t('proposal.columnDaysOverdue')}
                            </TableHead>
                            <TableHead className="text-right">
                              {t('proposal.columnInterest')}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.invoices.map((inv) => (
                            <TableRow
                              key={inv.billingDocumentId}
                              data-testid="proposal-invoice-row"
                            >
                              <TableCell>
                                <Checkbox
                                  checked={groupInvSet.has(inv.billingDocumentId)}
                                  onCheckedChange={() =>
                                    toggleInvoice(
                                      group.customerAddressId,
                                      inv.billingDocumentId
                                    )
                                  }
                                  aria-label={t('proposal.selectInvoice')}
                                />
                              </TableCell>
                              <TableCell className="font-medium">
                                {inv.invoiceNumber}
                              </TableCell>
                              <TableCell>{formatDate(inv.invoiceDate)}</TableCell>
                              <TableCell>{formatDate(inv.dueDate)}</TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(inv.openAmount)}
                              </TableCell>
                              <TableCell className="text-right">
                                {inv.daysOverdue}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(inv.interestAmount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </CardContent>
              </Collapsible>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
