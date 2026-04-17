'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission, useDepartments } from '@/hooks'
import {
  useOvertimePayouts,
  useApproveOvertimePayout,
  useRejectOvertimePayout,
  useBatchApproveOvertimePayouts,
} from '@/hooks'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { TimeDisplay } from '@/components/timesheet'
import { ChevronLeft, ChevronRight, Check, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function OvertimePayoutsPage() {
  const router = useRouter()
  const t = useTranslations('overtimePayouts')
  const locale = useLocale()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['overtime_payouts.manage'])

  const [year, setYear] = React.useState(() => new Date().getFullYear())
  const [month, setMonth] = React.useState(() => new Date().getMonth() + 1)
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [departmentId, setDepartmentId] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')

  const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false)
  const [rejectPayoutId, setRejectPayoutId] = React.useState<string | null>(null)
  const [rejectReason, setRejectReason] = React.useState('')

  const [batchConfirmOpen, setBatchConfirmOpen] = React.useState(false)

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const enabled = !authLoading && !permLoading && canAccess

  const { data, isLoading } = useOvertimePayouts({
    year,
    month,
    status: statusFilter !== 'all' ? (statusFilter as 'pending' | 'approved' | 'rejected') : undefined,
    departmentId: departmentId ?? undefined,
    enabled,
  })

  const { data: departmentsData } = useDepartments({ enabled })
  const departments = (departmentsData?.data ?? []).map((d: { id: string; name: string }) => ({
    id: d.id,
    name: d.name,
  }))

  const approveMutation = useApproveOvertimePayout()
  const rejectMutation = useRejectOvertimePayout()
  const batchApproveMutation = useBatchApproveOvertimePayouts()

  const items = data?.data ?? []

  const filteredItems = React.useMemo(() => {
    if (!search) return items
    const s = search.toLowerCase()
    return items.filter((item) => {
      const emp = item.employee
      if (!emp) return false
      const name = `${emp.lastName}, ${emp.firstName}`.toLowerCase()
      return name.includes(s) || (emp.personnelNumber ?? '').toLowerCase().includes(s)
    })
  }, [items, search])

  const pendingItems = React.useMemo(() => filteredItems.filter(i => i.status === 'pending'), [filteredItems])

  const monthLabel = React.useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    return formatter.format(new Date(year, month - 1, 1))
  }, [year, month, locale])

  const navigateMonth = (delta: number) => {
    let newMonth = month + delta
    let newYear = year
    if (newMonth > 12) { newMonth = 1; newYear++ }
    if (newMonth < 1) { newMonth = 12; newYear-- }
    setMonth(newMonth)
    setYear(newYear)
  }

  const handleApprove = async (id: string) => {
    try {
      await approveMutation.mutateAsync({ id })
      toast.success(t('status.approved'))
    } catch {
      toast.error('Fehler')
    }
  }

  const handleRejectSubmit = async () => {
    if (!rejectPayoutId || rejectReason.length < 10) return
    try {
      await rejectMutation.mutateAsync({ id: rejectPayoutId, reason: rejectReason })
      toast.success(t('status.rejected'))
      setRejectDialogOpen(false)
      setRejectPayoutId(null)
      setRejectReason('')
    } catch {
      toast.error('Fehler')
    }
  }

  const handleBatchApprove = async () => {
    const ids = pendingItems.map(i => i.id)
    if (ids.length === 0) return
    try {
      const result = await batchApproveMutation.mutateAsync({ ids })
      toast.success(t('batchResult.approved', { count: result.approvedCount }))
      if (result.errors.length > 0) {
        toast.error(t('batchResult.errors', { count: result.errors.length }))
      }
    } catch {
      toast.error('Fehler')
    }
    setBatchConfirmOpen(false)
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-400">{t('status.pending')}</Badge>
      case 'approved':
        return <Badge variant="default" className="bg-green-600 hover:bg-green-700">{t('status.approved')}</Badge>
      case 'rejected':
        return <Badge variant="secondary">{t('status.rejected')}</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  if (authLoading || permLoading) {
    return (
      <div className="container mx-auto py-6">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-72 mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('page.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('page.subtitle')}</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[140px] text-center">{monthLabel}</span>
              <Button variant="outline" size="icon" onClick={() => navigateMonth(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Select
              value={statusFilter}
              onValueChange={setStatusFilter}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('toolbar.allStatuses')}</SelectItem>
                <SelectItem value="pending">{t('status.pending')}</SelectItem>
                <SelectItem value="approved">{t('status.approved')}</SelectItem>
                <SelectItem value="rejected">{t('status.rejected')}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={departmentId ?? 'all'}
              onValueChange={(v) => setDepartmentId(v === 'all' ? null : v)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('toolbar.allDepartments')}</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              placeholder={t('toolbar.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[200px]"
            />

            {pendingItems.length > 0 && (
              <Button
                variant="default"
                size="sm"
                className="ml-auto"
                onClick={() => setBatchConfirmOpen(true)}
              >
                <Check className="h-4 w-4 mr-1" />
                {t('actions.approveAll')} ({pendingItems.length})
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-lg font-medium">{t('empty.title')}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t('empty.description')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('table.employee')}</TableHead>
                  <TableHead className="w-24">{t('table.personnelNumber')}</TableHead>
                  <TableHead className="w-28">{t('table.period')}</TableHead>
                  <TableHead className="w-24 text-right">{t('table.payoutHours')}</TableHead>
                  <TableHead className="w-28 text-right">{t('table.sourceBalance')}</TableHead>
                  <TableHead className="w-28">{t('table.status')}</TableHead>
                  <TableHead className="w-32">{t('table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.employee
                        ? `${item.employee.lastName}, ${item.employee.firstName}`
                        : item.employeeId}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {item.employee?.personnelNumber ?? ''}
                    </TableCell>
                    <TableCell>
                      {String(item.month).padStart(2, '0')}/{item.year}
                    </TableCell>
                    <TableCell className="text-right">
                      <TimeDisplay value={item.payoutMinutes} format="duration" />
                    </TableCell>
                    <TableCell className="text-right">
                      <TimeDisplay value={item.sourceFlextimeEnd} format="duration" />
                    </TableCell>
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                    <TableCell>
                      {item.status === 'pending' && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleApprove(item.id)}
                            disabled={approveMutation.isPending}
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRejectPayoutId(item.id)
                              setRejectReason('')
                              setRejectDialogOpen(true)
                            }}
                          >
                            <X className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('reject.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t('reject.reasonLabel')}</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('reject.reasonPlaceholder')}
              rows={3}
            />
            {rejectReason.length < 10 && (
              <p className="text-xs text-muted-foreground">{t('reject.reasonMinChars')}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectSubmit}
              disabled={rejectReason.length < 10 || rejectMutation.isPending}
            >
              {rejectMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t('reject.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={batchConfirmOpen} onOpenChange={setBatchConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('actions.approveAll')}</DialogTitle>
            <DialogDescription>{t('actions.approveAllConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchConfirmOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button
              onClick={handleBatchApprove}
              disabled={batchApproveMutation.isPending}
            >
              {batchApproveMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t('actions.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
