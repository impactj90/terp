'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, Wallet, X, FolderOpen } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useAccounts,
  useAccountUsage,
  useDeleteAccount,
  useUpdateAccount,
  useAccountGroups,
  useDeleteAccountGroup,
} from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AccountDataTable,
  AccountFormSheet,
  AccountDetailSheet,
} from '@/components/accounts'
import {
  AccountGroupDataTable,
  AccountGroupFormSheet,
} from '@/components/account-groups'
import type { components } from '@/lib/api/types'

type Account = components['schemas']['Account']
type AccountGroup = components['schemas']['AccountGroup']

const TYPE_OPTIONS = [
  { value: 'all', labelKey: 'allTypes' },
  { value: 'bonus', labelKey: 'typeBonus' },
  { value: 'tracking', labelKey: 'typeTracking' },
  { value: 'balance', labelKey: 'typeBalance' },
] as const

const STATUS_OPTIONS = [
  { value: 'all', labelKey: 'allStatuses' },
  { value: 'active', labelKey: 'active' },
  { value: 'inactive', labelKey: 'inactive' },
] as const

export default function AccountsPage() {
  const router = useRouter()
  const t = useTranslations('adminAccounts')
  const tGroups = useTranslations('adminAccountGroups')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['accounts.manage'])

  // Tab state
  const [activeTab, setActiveTab] = React.useState<'accounts' | 'groups'>('accounts')

  // Accounts filters
  const [search, setSearch] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<string>('all')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [showSystem, setShowSystem] = React.useState(true)

  // Accounts dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<Account | null>(null)
  const [viewItem, setViewItem] = React.useState<Account | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<Account | null>(null)

  // Groups state
  const [groupSearch, setGroupSearch] = React.useState('')
  const [createGroupOpen, setCreateGroupOpen] = React.useState(false)
  const [editGroupItem, setEditGroupItem] = React.useState<AccountGroup | null>(null)
  const [deleteGroupItem, setDeleteGroupItem] = React.useState<AccountGroup | null>(null)

  // Fetch accounts (include system accounts for admin view)
  const { data: accountsData, isLoading } = useAccounts({
    includeSystem: true,
    enabled: !authLoading && !permLoading && canAccess,
  })

  // Fetch account groups
  const { data: groupsData, isLoading: groupsLoading } = useAccountGroups({
    enabled: !authLoading && !permLoading && canAccess,
  })

  // Mutations
  const deleteMutation = useDeleteAccount()
  const updateMutation = useUpdateAccount()
  const deleteGroupMutation = useDeleteAccountGroup()

  const { data: deleteUsageData } = useAccountUsage(deleteItem?.id ?? '', !!deleteItem)

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  // Extract accounts from wrapped response
  const accounts = (accountsData as { data?: Account[] })?.data ?? []

  // Extract groups
  const accountGroupsList = (groupsData as { data?: AccountGroup[] })?.data ?? []

  // Client-side filtering for accounts
  const filteredAccounts = React.useMemo(() => {
    return accounts.filter((a) => {
      if (search) {
        const s = search.toLowerCase()
        if (
          !a.code?.toLowerCase().includes(s) &&
          !a.name?.toLowerCase().includes(s)
        ) {
          return false
        }
      }
      if (typeFilter !== 'all') {
        const accountType = (a as Record<string, unknown>).account_type as string
        if (accountType !== typeFilter) {
          return false
        }
      }
      if (statusFilter === 'active' && !a.is_active) return false
      if (statusFilter === 'inactive' && a.is_active) return false
      if (!showSystem && a.is_system) return false
      return true
    })
  }, [accounts, search, typeFilter, statusFilter, showSystem])

  // Client-side filtering for groups
  const filteredGroups = React.useMemo(() => {
    if (!groupSearch) return accountGroupsList
    const s = groupSearch.toLowerCase()
    return accountGroupsList.filter(
      (g) => g.code?.toLowerCase().includes(s) || g.name?.toLowerCase().includes(s)
    )
  }, [accountGroupsList, groupSearch])

  const handleView = (account: Account) => {
    setViewItem(account)
  }

  const handleEdit = (account: Account) => {
    setEditItem(account)
    setViewItem(null)
  }

  const handleDelete = (account: Account) => {
    setDeleteItem(account)
  }

  const handleConfirmDelete = async () => {
    if (!deleteItem) return

    try {
      await deleteMutation.mutateAsync({
        path: { id: deleteItem.id },
      })
      setDeleteItem(null)
      setViewItem(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleToggleActive = async (account: Account, isActive: boolean) => {
    try {
      const unit = (account as Record<string, unknown>).unit as 'minutes' | 'hours' | 'days' | undefined
      const yearCarryover = (account as Record<string, unknown>).year_carryover as boolean | undefined
      await updateMutation.mutateAsync({
        path: { id: account.id },
        body: {
          name: account.name,
          description: account.description ?? undefined,
          is_payroll_relevant: account.is_payroll_relevant ?? false,
          payroll_code: account.payroll_code ?? undefined,
          sort_order: account.sort_order ?? 0,
          unit: unit ?? 'minutes',
          year_carryover: yearCarryover ?? true,
          is_active: isActive,
        },
      })
    } catch {
      // Error handled by mutation
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditItem(null)
  }

  const handleGroupFormSuccess = () => {
    setCreateGroupOpen(false)
    setEditGroupItem(null)
  }

  const handleConfirmDeleteGroup = async () => {
    if (!deleteGroupItem) return

    try {
      await deleteGroupMutation.mutateAsync({
        path: { id: deleteGroupItem.id },
      })
      setDeleteGroupItem(null)
    } catch {
      // Error handled by mutation
    }
  }

  const hasFilters = Boolean(search || typeFilter !== 'all' || statusFilter !== 'all' || !showSystem)

  const groupedAccounts = React.useMemo(() => {
    const groups: Record<string, Account[]> = {
      bonus: [],
      tracking: [],
      balance: [],
    }
    filteredAccounts.forEach((account) => {
      const accountType = (account as Record<string, unknown>).account_type as string || 'tracking'
      if (!groups[accountType]) groups[accountType] = []
      groups[accountType].push(account)
    })
    return groups
  }, [filteredAccounts])

  const accountTypeGroups = [
    { key: 'bonus', label: t('typeBonus') },
    { key: 'tracking', label: t('typeTracking') },
    { key: 'balance', label: t('typeBalance') },
  ]

  const clearFilters = () => {
    setSearch('')
    setTypeFilter('all')
    setStatusFilter('all')
    setShowSystem(true)
  }

  if (authLoading || permLoading) {
    return <AccountsPageSkeleton />
  }

  if (!canAccess) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <Button onClick={() => activeTab === 'groups' ? setCreateGroupOpen(true) : setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {activeTab === 'groups' ? tGroups('newGroup') : t('newAccount')}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'accounts' | 'groups')}>
        <TabsList>
          <TabsTrigger value="accounts">{t('tabAccounts')}</TabsTrigger>
          <TabsTrigger value="groups">{t('tabGroups')}</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-6">
          {/* Filters bar */}
          <div className="flex flex-wrap items-center gap-4">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('searchPlaceholder')}
              className="w-full sm:w-64"
            />

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey as Parameters<typeof t>[0])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey as Parameters<typeof t>[0])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center space-x-2">
              <Switch
                id="show-system"
                checked={showSystem}
                onCheckedChange={setShowSystem}
              />
              <Label htmlFor="show-system" className="text-sm">
                {t('showSystemAccounts')}
              </Label>
            </div>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-2 h-4 w-4" />
                {t('clearFilters')}
              </Button>
            )}
          </div>

          {/* Count display */}
          <div className="text-sm text-muted-foreground">
            {filteredAccounts.length === 1
              ? t('accountCount', { count: filteredAccounts.length })
              : t('accountsCount', { count: filteredAccounts.length })}
          </div>

          {/* Content */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6">
                  <Skeleton className="h-64" />
                </div>
              ) : filteredAccounts.length === 0 ? (
                <EmptyState
                  hasFilters={hasFilters}
                  onCreateClick={() => setCreateOpen(true)}
                />
              ) : (
                <div className="divide-y">
                  {accountTypeGroups.map((group) => {
                    const accts = groupedAccounts[group.key] ?? []
                    if (accts.length === 0) return null
                    return (
                      <div key={group.key} className="p-6 pt-4">
                        <div className="mb-3 text-sm font-medium text-muted-foreground">
                          {group.label} ({accts.length})
                        </div>
                        <AccountDataTable
                          accounts={accts}
                          isLoading={false}
                          onView={handleView}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          onToggleActive={handleToggleActive}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="groups" className="space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4">
            <SearchInput
              value={groupSearch}
              onChange={setGroupSearch}
              placeholder={tGroups('searchPlaceholder')}
              className="w-full sm:w-64"
            />
            {groupSearch && (
              <Button variant="ghost" size="sm" onClick={() => setGroupSearch('')}>
                <X className="mr-2 h-4 w-4" />
                {tGroups('clearFilters')}
              </Button>
            )}
          </div>

          {/* Count */}
          <div className="text-sm text-muted-foreground">
            {filteredGroups.length === 1
              ? tGroups('groupCount', { count: filteredGroups.length })
              : tGroups('groupsCount', { count: filteredGroups.length })}
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {groupsLoading ? (
                <div className="p-6"><Skeleton className="h-64" /></div>
              ) : filteredGroups.length === 0 ? (
                <GroupEmptyState hasFilters={!!groupSearch} onCreateClick={() => setCreateGroupOpen(true)} />
              ) : (
                <AccountGroupDataTable
                  groups={filteredGroups}
                  isLoading={false}
                  onEdit={(g) => setEditGroupItem(g)}
                  onDelete={(g) => setDeleteGroupItem(g)}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Account Create/Edit Form */}
      <AccountFormSheet
        open={createOpen || !!editItem}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditItem(null)
          }
        }}
        account={editItem}
        onSuccess={handleFormSuccess}
      />

      {/* Account Detail View */}
      <AccountDetailSheet
        accountId={viewItem?.id ?? null}
        open={!!viewItem}
        onOpenChange={(open) => {
          if (!open) {
            setViewItem(null)
          }
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Account Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteItem}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteItem(null)
          }
        }}
        title={t('deleteAccount')}
        description={
          deleteItem
            ? [
                t('deleteDescription', { name: deleteItem.name, code: deleteItem.code }),
                (deleteUsageData as { usage_count?: number; day_plans?: Array<{ code: string }> } | undefined)?.usage_count
                  ? t('deleteUsageWarning', {
                      count: (deleteUsageData as { usage_count?: number } | undefined)?.usage_count ?? 0,
                      plans: ((deleteUsageData as { day_plans?: Array<{ code: string }> } | undefined)?.day_plans ?? [])
                        .map((plan) => plan.code)
                        .join(', '),
                    })
                  : '',
              ]
                .filter(Boolean)
                .join(' ')
            : ''
        }
        confirmLabel={t('delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />

      {/* Group Create/Edit Form */}
      <AccountGroupFormSheet
        open={createGroupOpen || !!editGroupItem}
        onOpenChange={(open) => {
          if (!open) {
            setCreateGroupOpen(false)
            setEditGroupItem(null)
          }
        }}
        group={editGroupItem}
        onSuccess={handleGroupFormSuccess}
      />

      {/* Group Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteGroupItem}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteGroupItem(null)
          }
        }}
        title={tGroups('deleteGroup')}
        description={
          deleteGroupItem
            ? tGroups('deleteDescription', { name: deleteGroupItem.name, code: deleteGroupItem.code })
            : ''
        }
        confirmLabel={tGroups('delete')}
        variant="destructive"
        isLoading={deleteGroupMutation.isPending}
        onConfirm={handleConfirmDeleteGroup}
      />
    </div>
  )
}

function EmptyState({
  hasFilters = false,
  onCreateClick,
}: {
  hasFilters?: boolean
  onCreateClick: () => void
}) {
  const t = useTranslations('adminAccounts')
  return (
    <div className="text-center py-12 px-6">
      <Wallet className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? t('emptyFilterHint')
          : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addAccount')}
        </Button>
      )}
    </div>
  )
}

function GroupEmptyState({
  hasFilters = false,
  onCreateClick,
}: {
  hasFilters?: boolean
  onCreateClick: () => void
}) {
  const t = useTranslations('adminAccountGroups')
  return (
    <div className="text-center py-12 px-6">
      <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? t('emptyFilterHint')
          : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addGroup')}
        </Button>
      )}
    </div>
  )
}

function AccountsPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-40" />
      </div>

      {/* Content */}
      <Skeleton className="h-[400px]" />
    </div>
  )
}
