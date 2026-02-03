'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  AlertTriangle,
  Edit,
  Key,
  Lock,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { useUpdateUser, useUserGroups, useUsers } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { UserFormSheet, UserDeleteDialog, ChangePasswordDialog } from '@/components/users'
import type { components } from '@/lib/api/types'

type User = components['schemas']['User']

type UserGroup = components['schemas']['UserGroup']

export default function AdminUsersPage() {
  const router = useRouter()
  const t = useTranslations('adminUsers')
  const tCommon = useTranslations('common')
  const { user: currentUser, isLoading: authLoading } = useAuth()
  const { allowed: canManageUsers, isLoading: permissionLoading } = useHasPermission([
    'users.manage',
  ])

  const [search, setSearch] = React.useState('')
  const [savingUserId, setSavingUserId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Dialog/sheet state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editUser, setEditUser] = React.useState<User | null>(null)
  const [deleteUser, setDeleteUser] = React.useState<User | null>(null)
  const [passwordUser, setPasswordUser] = React.useState<User | null>(null)

  const { data: usersData, isLoading } = useUsers({
    limit: 100,
    search: search || undefined,
    enabled: !authLoading && !permissionLoading && canManageUsers,
  })

  const { data: groupsData } = useUserGroups({
    enabled: !authLoading && !permissionLoading && canManageUsers,
  })

  const updateMutation = useUpdateUser()

  React.useEffect(() => {
    if (!authLoading && !permissionLoading && !canManageUsers) {
      router.push('/dashboard')
    }
  }, [authLoading, permissionLoading, canManageUsers, router])

  const users = usersData?.data ?? []
  const groups = groupsData?.data ?? []

  const groupOptions = React.useMemo(() => {
    return [...groups].sort((a, b) => {
      const activeA = a.is_active !== false
      const activeB = b.is_active !== false
      if (activeA !== activeB) return activeA ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [groups])

  const groupNameById = React.useMemo(() => {
    const map = new Map<string, UserGroup>()
    groups.forEach((group) => map.set(group.id, group))
    return map
  }, [groups])

  const handleGroupChange = async (user: User, value: string) => {
    setError(null)
    setSavingUserId(user.id)

    const selectedValue = value === 'none' ? '' : value

    try {
      await updateMutation.mutateAsync({
        path: { id: user.id },
        body: {
          user_group_id: selectedValue,
        },
      })
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('failedUpdate'))
    } finally {
      setSavingUserId(null)
    }
  }

  if (authLoading || permissionLoading) {
    return <AdminUsersPageSkeleton />
  }

  if (!canManageUsers) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newUser')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('searchPlaceholder')}
          className="w-full sm:w-72"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-64" />
            </div>
          ) : users.length === 0 ? (
            <EmptyState hasFilters={Boolean(search)} />
          ) : (
            <div className="divide-y">
              {users.map((user) => {
                const group = user.user_group_id ? groupNameById.get(user.user_group_id) : null
                const isSaving = savingUserId === user.id
                const isInactive = user.is_active === false
                const isLocked = user.is_locked === true
                return (
                  <div
                    key={user.id}
                    className={`flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between${isInactive ? ' opacity-60' : ''}`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {isLocked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                        <p className="text-sm font-medium">{user.display_name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                      {group?.is_admin && (
                        <div className="inline-flex items-center gap-1 text-xs text-primary">
                          <ShieldCheck className="h-3 w-3" />
                          {t('adminGroupBadge')}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-full sm:w-64">
                        <Select
                          value={user.user_group_id ?? 'none'}
                          onValueChange={(value) => handleGroupChange(user, value)}
                          disabled={isSaving}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('selectGroup')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t('noGroup')}</SelectItem>
                            {groupOptions.map((groupOption) => (
                              <SelectItem
                                key={groupOption.id}
                                value={groupOption.id}
                                disabled={groupOption.is_active === false}
                              >
                                {groupOption.is_active === false
                                  ? `${groupOption.name} (${tCommon('inactive')})`
                                  : groupOption.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {group?.is_system && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t('systemGroupHint')}
                          </p>
                        )}
                        {isSaving && (
                          <p className="mt-1 text-xs text-muted-foreground">{t('saving')}</p>
                        )}
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">{tCommon('actions')}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditUser(user)}>
                            <Edit className="mr-2 h-4 w-4" />
                            {tCommon('edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setPasswordUser(user)}>
                            <Key className="mr-2 h-4 w-4" />
                            {t('changePassword')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {currentUser?.id === user.id ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <DropdownMenuItem disabled>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    {tCommon('delete')}
                                  </DropdownMenuItem>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{t('cannotDeleteSelf')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleteUser(user)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {tCommon('delete')}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <UserFormSheet
        open={createOpen || !!editUser}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditUser(null)
          }
        }}
        user={editUser}
        onSuccess={() => {
          setCreateOpen(false)
          setEditUser(null)
        }}
      />

      <UserDeleteDialog
        user={deleteUser}
        onOpenChange={(open) => {
          if (!open) setDeleteUser(null)
        }}
        onSuccess={() => setDeleteUser(null)}
      />

      <ChangePasswordDialog
        user={passwordUser}
        isSelf={!!passwordUser && currentUser?.id === passwordUser.id}
        onOpenChange={(open) => {
          if (!open) setPasswordUser(null)
        }}
        onSuccess={() => setPasswordUser(null)}
      />
    </div>
  )
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  const t = useTranslations('adminUsers')
  return (
    <div className="text-center py-12 px-6">
      <Users className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters ? t('emptyFilterHint') : t('emptyGetStarted')}
      </p>
    </div>
  )
}

function AdminUsersPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      <Skeleton className="h-9 w-72" />

      <Skeleton className="h-[400px]" />
    </div>
  )
}
