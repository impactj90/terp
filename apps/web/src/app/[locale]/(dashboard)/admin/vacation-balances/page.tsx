'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Palmtree } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { useVacationBalances, useDepartments } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { components } from '@/lib/api/types'

import {
  VacationBalanceDataTable,
  VacationBalanceDataTableSkeleton,
} from '@/components/vacation-balances/vacation-balance-data-table'
import { VacationBalanceFormSheet } from '@/components/vacation-balances/vacation-balance-form-sheet'
import { VacationBalanceDetailSheet } from '@/components/vacation-balances/vacation-balance-detail-sheet'
import { VacationBalanceToolbar } from '@/components/vacation-balances/vacation-balance-toolbar'
import { InitializeYearDialog } from '@/components/vacation-balances/initialize-year-dialog'

type VacationBalance = components['schemas']['VacationBalance']

export default function AdminVacationBalancesPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['absences.manage'])
  const t = useTranslations('adminVacationBalances')

  // Filter state
  const [year, setYear] = React.useState(new Date().getFullYear())
  const [departmentId, setDepartmentId] = React.useState<string | undefined>(undefined)
  const [search, setSearch] = React.useState('')

  // Sheet/dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editBalance, setEditBalance] = React.useState<VacationBalance | null>(null)
  const [viewBalance, setViewBalance] = React.useState<VacationBalance | null>(null)
  const [initializeOpen, setInitializeOpen] = React.useState(false)

  // Auth redirect
  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  // Data fetching
  const { data: balancesData, isLoading } = useVacationBalances({
    year,
    departmentId,
    enabled: !authLoading && !permLoading && canAccess,
  })
  const balances = balancesData?.data ?? []

  // Client-side search filter on employee name
  const filteredBalances = React.useMemo(() => {
    if (!search) return balances
    const q = search.toLowerCase()
    return balances.filter((b) => {
      const name = `${b.employee?.first_name ?? ''} ${b.employee?.last_name ?? ''} ${b.employee?.personnel_number ?? ''}`.toLowerCase()
      return name.includes(q)
    })
  }, [balances, search])

  const { data: departmentsData } = useDepartments({
    active: true,
    enabled: !authLoading && !permLoading && canAccess,
  })
  const departments = (departmentsData?.data ?? []).map((d) => ({ id: d.id, name: d.name }))

  if (authLoading || permLoading) return <VacationBalancesPageSkeleton />
  if (!canAccess) return null

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Toolbar */}
      <VacationBalanceToolbar
        year={year}
        onYearChange={setYear}
        departmentId={departmentId}
        onDepartmentChange={setDepartmentId}
        departments={departments}
        search={search}
        onSearchChange={setSearch}
        onInitializeYear={() => setInitializeOpen(true)}
        onCreateBalance={() => setCreateOpen(true)}
      />

      {/* Data table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <VacationBalanceDataTableSkeleton />
          ) : filteredBalances.length === 0 ? (
            <EmptyState year={year} onInitialize={() => setInitializeOpen(true)} />
          ) : (
            <VacationBalanceDataTable
              balances={filteredBalances}
              isLoading={false}
              onView={setViewBalance}
              onEdit={setEditBalance}
            />
          )}
        </CardContent>
      </Card>

      {/* Form sheet */}
      <VacationBalanceFormSheet
        open={createOpen || !!editBalance}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditBalance(null)
          }
        }}
        balance={editBalance}
        onSuccess={() => {
          setCreateOpen(false)
          setEditBalance(null)
        }}
      />

      {/* Detail sheet */}
      <VacationBalanceDetailSheet
        balance={viewBalance}
        open={!!viewBalance}
        onOpenChange={(open) => {
          if (!open) setViewBalance(null)
        }}
        onEdit={(b) => {
          setViewBalance(null)
          setEditBalance(b)
        }}
      />

      {/* Initialize dialog */}
      <InitializeYearDialog
        open={initializeOpen}
        onOpenChange={setInitializeOpen}
      />
    </div>
  )
}

function EmptyState({ year, onInitialize }: { year: number; onInitialize: () => void }) {
  const t = useTranslations('adminVacationBalances')
  return (
    <div className="text-center py-12 px-6">
      <Palmtree className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {t('emptyDescription', { year })}
      </p>
      <Button className="mt-4" onClick={onInitialize}>
        {t('initializeYearButton')}
      </Button>
    </div>
  )
}

function VacationBalancesPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Skeleton className="h-9 w-32" />
        <div className="flex-1" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
      </div>
      <Skeleton className="h-[400px]" />
    </div>
  )
}
