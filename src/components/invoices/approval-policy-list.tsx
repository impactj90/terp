'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Plus, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ApprovalPolicySheet } from './approval-policy-sheet'
import {
  useApprovalPolicies,
  useRemoveApprovalPolicy,
} from '@/hooks/useApprovalPolicies'

interface ApprovalPolicy {
  id: string
  amountMin: number
  amountMax: number | null
  stepOrder: number
  approverType: 'group' | 'user'
  approverGroupId: string | null
  approverUserId: string | null
  approverGroupName?: string | null
  approverUserName?: string | null
  isActive: boolean
}

const formatCurrency = (v: number | null | undefined) => {
  if (v == null) return '\u221E'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v)
}

export function ApprovalPolicyList() {
  const t = useTranslations('inboundInvoices')
  const { data: policies, isLoading } = useApprovalPolicies()
  const removeMutation = useRemoveApprovalPolicy()

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editData, setEditData] = React.useState<ApprovalPolicy | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<ApprovalPolicy | null>(null)

  function handleNewRule() {
    setEditData(null)
    setSheetOpen(true)
  }

  function handleEdit(policy: ApprovalPolicy) {
    setEditData(policy)
    setSheetOpen(true)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await removeMutation.mutateAsync({ id: deleteTarget.id })
      toast.success(t('policy.deleteSuccess'))
      setDeleteTarget(null)
    } catch {
      toast.error(t('policy.deleteError'))
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const items = (policies ?? []) as unknown as ApprovalPolicy[]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleNewRule} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          {t('policy.newRule')}
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {t('policy.emptyState')}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('policy.colAmountRange')}</TableHead>
                <TableHead>{t('policy.colStepOrder')}</TableHead>
                <TableHead>{t('policy.colApprover')}</TableHead>
                <TableHead>{t('policy.colActive')}</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((policy) => (
                <TableRow key={policy.id}>
                  <TableCell>
                    {formatCurrency(policy.amountMin)} {' \u2013 '} {formatCurrency(policy.amountMax)}
                  </TableCell>
                  <TableCell>{policy.stepOrder}</TableCell>
                  <TableCell>
                    {policy.approverType === 'group'
                      ? policy.approverGroupName ?? '—'
                      : policy.approverUserName ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={policy.isActive ? 'default' : 'secondary'}>
                      {policy.isActive ? t('policy.active') : t('policy.inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(policy)}>
                          {t('policy.editButton')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteTarget(policy)}
                        >
                          {t('policy.deleteButton')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ApprovalPolicySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editData={editData}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('policy.deleteTitle')}
        description={t('policy.deleteDescription')}
        confirmLabel={t('policy.deleteConfirm')}
        cancelLabel={t('policy.cancelButton')}
        variant="destructive"
        isLoading={removeMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
