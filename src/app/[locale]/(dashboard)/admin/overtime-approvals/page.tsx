'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Check, X } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useOvertimeRequests,
  useApproveOvertimeRequest,
  useRejectOvertimeRequest,
} from '@/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ApproveOvertimeDialog,
  RejectOvertimeDialog,
} from '@/components/overtime-requests/overtime-approval-dialogs'

type OvertimeRow = {
  id: string
  employeeId: string
  requestType: string
  requestDate: string | Date
  plannedMinutes: number
  reason: string
  status: string
  arbzgWarnings: string[]
  employee?: {
    firstName: string
    lastName: string
  } | null
}

function formatDate(value: string | Date): string {
  const iso =
    typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

export default function OvertimeApprovalsPage() {
  const router = useRouter()
  const t = useTranslations('overtime_requests')
  const tQueue = useTranslations('overtime_requests.approver.queue')
  const tToast = useTranslations('overtime_requests.toast')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission([
    'overtime.approve',
  ])

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const enabled = !authLoading && !permLoading && canAccess
  const { data, isLoading } = useOvertimeRequests({
    status: 'pending',
    enabled,
    pageSize: 200,
  })

  const approve = useApproveOvertimeRequest()
  const reject = useRejectOvertimeRequest()

  const [approveTarget, setApproveTarget] = React.useState<OvertimeRow | null>(
    null
  )
  const [rejectTarget, setRejectTarget] = React.useState<OvertimeRow | null>(
    null
  )

  const handleApprove = async (
    target: OvertimeRow,
    arbzgOverrideReason: string | undefined
  ) => {
    try {
      await approve.mutateAsync({
        id: target.id,
        arbzgOverrideReason,
      })
      toast.success(tToast('approved'))
      setApproveTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tToast('actionFailed'))
    }
  }

  const handleReject = async (target: OvertimeRow, reason: string) => {
    try {
      await reject.mutateAsync({ id: target.id, reason })
      toast.success(tToast('rejected'))
      setRejectTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tToast('actionFailed'))
    }
  }

  if (authLoading || permLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (!canAccess) return null

  const items = (data?.items ?? []) as unknown as OvertimeRow[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{tQueue('title')}</h1>
        <p className="text-muted-foreground">{tQueue('subtitle')}</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-32 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-6">
              <p className="text-sm text-muted-foreground">{tQueue('empty')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('detail.employee')}</TableHead>
                  <TableHead>{t('detail.date')}</TableHead>
                  <TableHead>{t('detail.type')}</TableHead>
                  <TableHead>{t('detail.plannedMinutes')}</TableHead>
                  <TableHead>{t('detail.reason')}</TableHead>
                  <TableHead>{t('detail.arbzgWarnings')}</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.employee
                        ? `${row.employee.firstName} ${row.employee.lastName}`
                        : '—'}
                    </TableCell>
                    <TableCell>{formatDate(row.requestDate)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(
                          `requestType.${row.requestType}` as 'requestType.PLANNED'
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.plannedMinutes}</TableCell>
                    <TableCell
                      className="max-w-xs truncate"
                      title={row.reason}
                    >
                      {row.reason}
                    </TableCell>
                    <TableCell>
                      {row.arbzgWarnings.length > 0 ? (
                        <Badge variant="destructive">
                          {row.arbzgWarnings.length}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setApproveTarget(row)}
                        >
                          <Check className="mr-1 h-3 w-3" />
                          {tQueue('approve')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRejectTarget(row)}
                        >
                          <X className="mr-1 h-3 w-3" />
                          {tQueue('reject')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ApproveOvertimeDialog
        open={!!approveTarget}
        onOpenChange={(open) => {
          if (!open) setApproveTarget(null)
        }}
        arbzgWarnings={approveTarget?.arbzgWarnings ?? []}
        isLoading={approve.isPending}
        onConfirm={(reason) => {
          if (approveTarget) void handleApprove(approveTarget, reason)
        }}
      />

      <RejectOvertimeDialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null)
        }}
        isLoading={reject.isPending}
        onConfirm={(reason) => {
          if (rejectTarget) void handleReject(rejectTarget, reason)
        }}
      />
    </div>
  )
}
