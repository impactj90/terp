'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, ChevronLeft, ChevronRight, ArrowUpDown, Download } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission, useAccount, useAccountValueSummary } from '@/hooks'
import { formatMinutes } from '@/lib/time-utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type SortField = 'name' | 'hours'
type SortDir = 'asc' | 'desc'

export default function AccountPostingsPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const t = useTranslations('adminAccounts')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['accounts.manage'])

  const [year, setYear] = React.useState(() => new Date().getFullYear())
  const [month, setMonth] = React.useState(() => new Date().getMonth() + 1)
  const [departmentFilter, setDepartmentFilter] = React.useState('all')
  const [locationFilter, setLocationFilter] = React.useState('all')
  const [sortField, setSortField] = React.useState<SortField>('name')
  const [sortDir, setSortDir] = React.useState<SortDir>('asc')

  const accountId = params.id
  const { data: account, isLoading: accountLoading } = useAccount(accountId)
  const { data, isLoading: summaryLoading } = useAccountValueSummary(
    accountId, year, month, !authLoading && !permLoading && canAccess
  )

  // Redirect if no permission
  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  // Redirect if account not found
  React.useEffect(() => {
    if (!accountLoading && !account) {
      router.push('/admin/accounts')
    }
  }, [accountLoading, account, router])

  const monthLabel = new Intl.DateTimeFormat('de', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1)
  )

  function goMonth(delta: number) {
    let m = month + delta
    let y = year
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setMonth(m)
    setYear(y)
  }

  // Unique department/location values for filter dropdowns
  const departments = React.useMemo(() => {
    if (!data?.items) return []
    const names = [...new Set(data.items.map((i) => i.departmentName).filter(Boolean))]
    return names.sort((a, b) => a.localeCompare(b))
  }, [data?.items])

  const locations = React.useMemo(() => {
    if (!data?.items) return []
    const names = [...new Set(data.items.map((i) => i.locationName).filter(Boolean))]
    return names.sort((a, b) => a.localeCompare(b))
  }, [data?.items])

  // Filter + sort
  const filteredItems = React.useMemo(() => {
    if (!data?.items) return []
    let items = data.items

    if (departmentFilter !== 'all') {
      items = items.filter((i) => i.departmentName === departmentFilter)
    }
    if (locationFilter !== 'all') {
      items = items.filter((i) => i.locationName === locationFilter)
    }

    const sorted = [...items].sort((a, b) => {
      if (sortField === 'name') {
        const cmp = a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
        return sortDir === 'asc' ? cmp : -cmp
      }
      const cmp = a.totalMinutes - b.totalMinutes
      return sortDir === 'asc' ? cmp : -cmp
    })

    return sorted
  }, [data?.items, departmentFilter, locationFilter, sortField, sortDir])

  const filteredTotal = React.useMemo(
    () => filteredItems.reduce((sum, i) => sum + i.totalMinutes, 0),
    [filteredItems]
  )

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function exportCsv() {
    const header = [
      t('postingsPersonnelNumber'),
      t('postingsEmployee'),
      t('postingsDepartment'),
      t('postingsLocation'),
      t('postingsHours'),
    ]
    const rows = filteredItems.map((row) => [
      row.personnelNumber,
      `${row.lastName}, ${row.firstName}`,
      row.departmentName,
      row.locationName,
      formatMinutes(row.totalMinutes),
    ])
    rows.push(['', t('postingsTotal'), '', '', formatMinutes(filteredTotal)])

    const csvContent = [header, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(';'))
      .join('\n')

    const bom = '\uFEFF'
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${account?.code ?? 'account'}_${year}-${String(month).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (authLoading || permLoading || accountLoading) {
    return <PostingsPageSkeleton />
  }

  if (!canAccess || !account) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-1"
            onClick={() => router.push('/admin/accounts')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('postingsBackToAccounts')}
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="font-mono">{account.code}</span>
            {' — '}
            {account.name}
          </h1>
          <p className="text-muted-foreground">{t('postingsPageTitle')}</p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={!filteredItems.length}>
          <Download className="mr-2 h-4 w-4" />
          {t('postingsExportCsv')}
        </Button>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Month navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => goMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[160px] text-center">{monthLabel}</span>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => goMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Department filter */}
        {departments.length > 0 && (
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('postingsDepartment')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('postingsAllDepartments')}</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Location filter */}
        {locations.length > 0 && (
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('postingsLocation')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('postingsAllLocations')}</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {summaryLoading ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-lg p-8 text-center">
              <p className="text-sm text-muted-foreground">{t('postingsNone')}</p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">{t('postingsPersonnelNumber')}</TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggleSort('name')}
                      >
                        {t('postingsEmployee')}
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead>{t('postingsDepartment')}</TableHead>
                    <TableHead>{t('postingsLocation')}</TableHead>
                    <TableHead className="text-right w-[100px]">
                      <button
                        type="button"
                        className="ml-auto flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggleSort('hours')}
                      >
                        {t('postingsHours')}
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((row) => (
                    <TableRow key={row.employeeId}>
                      <TableCell className="font-mono text-xs">{row.personnelNumber}</TableCell>
                      <TableCell>{row.lastName}, {row.firstName}</TableCell>
                      <TableCell className="text-muted-foreground">{row.departmentName || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{row.locationName || '-'}</TableCell>
                      <TableCell className="text-right font-mono">{formatMinutes(row.totalMinutes)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell />
                    <TableCell className="font-semibold">{t('postingsTotal')}</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="text-right font-mono font-semibold">
                      {formatMinutes(filteredTotal)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function PostingsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-44" />
      </div>
      <Skeleton className="h-[300px]" />
    </div>
  )
}
