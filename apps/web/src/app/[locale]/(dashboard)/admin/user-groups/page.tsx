'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  ChevronDown,
  ChevronUp,
  Lock,
  Plus,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useDeleteUserGroup,
  useUpdateUserGroup,
  useUserGroups,
  useUsers,
} from '@/hooks/api'
import { UserGroupFormSheet } from '@/components/user-groups'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SearchInput } from '@/components/ui/search-input'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '@/components/ui/avatar'
import type { components } from '@/lib/api/types'

type UserGroup = components['schemas']['UserGroup']

type User = components['schemas']['User']

type Permission = components['schemas']['Permission']

type PermissionCategory = {
  id: string
  label: string
  permissions: Permission[]
}

const CATEGORY_DEFINITIONS = [
  { id: 'employees', labelKey: 'categoryEmployees', resources: ['employees'] },
  { id: 'timeTracking', labelKey: 'categoryTimeTracking', resources: ['time_tracking'] },
  { id: 'absences', labelKey: 'categoryAbsences', resources: ['absences'] },
  {
    id: 'configuration',
    labelKey: 'categoryConfiguration',
    resources: ['day_plans', 'week_plans', 'tariffs'],
  },
  { id: 'admin', labelKey: 'categoryAdmin', resources: ['users', 'tenants', 'settings'] },
] as const

const toTitleCase = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const getInitials = (name: string | null | undefined) => {
  if (!name) return '??'
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length === 0) return '??'
  const first = parts[0] ?? ''
  if (parts.length === 1) return first.slice(0, 2).toUpperCase() || '??'
  const last = parts[parts.length - 1] ?? ''
  const firstInitial = first[0] ?? '?'
  const lastInitial = last[0] ?? firstInitial
  return `${firstInitial}${lastInitial}`.toUpperCase()
}

export default function UserGroupsPage() {
  const router = useRouter()
  const t = useTranslations('adminUserGroups')
  const tCommon = useTranslations('common')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canManageUsers, isLoading: permissionLoading } = useHasPermission([
    'users.manage',
  ])

  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'inactive'>('all')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editGroup, setEditGroup] = React.useState<UserGroup | null>(null)
  const [deleteGroup, setDeleteGroup] = React.useState<UserGroup | null>(null)
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set())
  const [togglingId, setTogglingId] = React.useState<string | null>(null)

  const { data: groupsData, isLoading } = useUserGroups({
    active: statusFilter === 'all' ? undefined : statusFilter === 'active',
    enabled: !authLoading && !permissionLoading && canManageUsers,
  })

  const { data: usersData } = useUsers({
    limit: 100,
    enabled: !authLoading && !permissionLoading && canManageUsers,
  })

  const updateMutation = useUpdateUserGroup()
  const deleteMutation = useDeleteUserGroup()

  React.useEffect(() => {
    if (!authLoading && !permissionLoading && !canManageUsers) {
      router.push('/dashboard')
    }
  }, [authLoading, permissionLoading, canManageUsers, router])

  const resourceLabels = React.useMemo<Record<string, string>>(
    () => ({
      employees: t('resourceEmployees'),
      time_tracking: t('resourceTimeTracking'),
      absences: t('resourceAbsences'),
      day_plans: t('resourceDayPlans'),
      week_plans: t('resourceWeekPlans'),
      tariffs: t('resourceTariffs'),
      users: t('resourceUsers'),
      tenants: t('resourceTenants'),
      settings: t('resourceSettings'),
    }),
    [t]
  )

  const actionLabels = React.useMemo<Record<string, string>>(
    () => ({
      read: t('actionView'),
      create: t('actionCreate'),
      update: t('actionEdit'),
      delete: t('actionDelete'),
      manage: t('actionManage'),
      view_own: t('actionViewOwn'),
      view_all: t('actionViewAll'),
      approve: t('actionApprove'),
      request: t('actionRequest'),
    }),
    [t]
  )

  const formatPermissionTitle = React.useCallback(
    (permission: Permission) => {
      const actionKey = permission.action ?? ''
      const resourceKey = permission.resource ?? ''
      const actionLabel = actionLabels[actionKey] ?? toTitleCase(actionKey)
      const resourceLabel = resourceLabels[resourceKey] ?? toTitleCase(resourceKey)
      return `${actionLabel} ${resourceLabel}`
    },
    [actionLabels, resourceLabels]
  )

  const groups = groupsData?.data ?? []
  const users = usersData?.data ?? []

  const membersByGroup = React.useMemo(() => {
    const map = new Map<string, User[]>()
    users.forEach((user) => {
      if (!user.user_group_id) return
      const groupMembers = map.get(user.user_group_id) ?? []
      groupMembers.push(user)
      map.set(user.user_group_id, groupMembers)
    })
    return map
  }, [users])

  const filteredGroups = React.useMemo(() => {
    if (!search) return groups
    const query = search.toLowerCase()
    return groups.filter((group) => {
      return (
        group.name?.toLowerCase().includes(query) ||
        group.code?.toLowerCase().includes(query) ||
        group.description?.toLowerCase().includes(query)
      )
    })
  }, [groups, search])

  const handleToggleActive = async (group: UserGroup, isActive: boolean) => {
    if (group.is_system) return
    setTogglingId(group.id)
    try {
      await updateMutation.mutateAsync({
        path: { id: group.id },
        body: {
          is_active: isActive,
          is_admin: group.is_admin ?? false,
        },
      })
    } catch {
      // errors handled by mutation
    } finally {
      setTogglingId(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteGroup) return

    try {
      await deleteMutation.mutateAsync({
        path: { id: deleteGroup.id },
      })
      setDeleteGroup(null)
    } catch {
      // error handled by mutation
    }
  }

  const togglePermissions = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  const permissionGroupsByGroup = React.useMemo(() => {
    const resourceToCategory = new Map<string, string>(
      CATEGORY_DEFINITIONS.flatMap((category) =>
        category.resources.map((resource) => [resource, category.id] as [string, string])
      )
    )

    const groupsMap = new Map<string, PermissionCategory[]>()

    groups.forEach((group) => {
      const categories = CATEGORY_DEFINITIONS.map((category) => ({
        id: category.id,
        label: t(category.labelKey as Parameters<typeof t>[0]),
        permissions: [] as Permission[],
      }))

      ;(group.permissions ?? []).forEach((permission) => {
        const categoryId = resourceToCategory.get(permission.resource)
        const target = categories.find((cat) => cat.id === categoryId)
        if (target) {
          target.permissions.push(permission)
        }
      })

      groupsMap.set(
        group.id,
        categories.filter((category) => category.permissions.length > 0)
      )
    })

    return groupsMap
  }, [groups, t])

  const hasFilters = Boolean(search) || statusFilter !== 'all'

  if (authLoading || permissionLoading) {
    return <UserGroupsPageSkeleton />
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
          {t('newGroup')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('searchPlaceholder')}
          className="w-full sm:w-72"
        />

        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as 'all' | 'active' | 'inactive')}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t('statusFilter')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allStatus')}</SelectItem>
            <SelectItem value="active">{t('active')}</SelectItem>
            <SelectItem value="inactive">{t('inactive')}</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setStatusFilter('all')
            }}
          >
            {t('clearFilters')}
          </Button>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        {filteredGroups.length === 1
          ? t('groupCount', { count: filteredGroups.length })
          : t('groupsCount', { count: filteredGroups.length })}
      </div>

      {isLoading ? (
        <UserGroupsGridSkeleton />
      ) : filteredGroups.length === 0 ? (
        <EmptyState hasFilters={hasFilters} onCreateClick={() => setCreateOpen(true)} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredGroups.map((group) => {
            const members = membersByGroup.get(group.id) ?? []
            const previewMembers = members.slice(0, 4)
            const extraCount = Math.max(0, members.length - previewMembers.length)
            const isExpanded = expandedGroups.has(group.id)
            const permissionGroups = permissionGroupsByGroup.get(group.id) ?? []

            return (
              <Card key={group.id} className="flex h-full flex-col">
                <CardHeader className="border-b">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{group.name}</CardTitle>
                      <CardDescription>
                        {group.description || t('noDescription')}
                      </CardDescription>
                      <p className="text-xs text-muted-foreground">
                        {t('codeLabel', { code: group.code })}
                      </p>
                    </div>
                    <CardAction>
                      <div className="flex flex-wrap items-center gap-2">
                        {group.is_system && (
                          <Badge variant="outline">
                            <Lock className="mr-1 h-3 w-3" />
                            {t('systemBadge')}
                          </Badge>
                        )}
                        {group.is_admin && (
                          <Badge>
                            <ShieldCheck className="mr-1 h-3 w-3" />
                            {t('adminBadge')}
                          </Badge>
                        )}
                        <Badge variant={group.is_active ? 'secondary' : 'outline'}>
                          {group.is_active ? t('active') : t('inactive')}
                        </Badge>
                      </div>
                    </CardAction>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{t('membersLabel')}</p>
                      <p className="text-xs text-muted-foreground">
                        {members.length === 1
                          ? t('memberCount', { count: members.length })
                          : t('memberCountPlural', { count: members.length })}
                      </p>
                    </div>
                    {members.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t('noMembers')}</p>
                    ) : (
                      <AvatarGroup>
                        {previewMembers.map((member) => (
                          <Avatar key={member.id} size="sm">
                            <AvatarImage
                              src={member.avatar_url ?? undefined}
                              alt={member.display_name}
                            />
                            <AvatarFallback>{getInitials(member.display_name)}</AvatarFallback>
                          </Avatar>
                        ))}
                        {extraCount > 0 && <AvatarGroupCount>+{extraCount}</AvatarGroupCount>}
                      </AvatarGroup>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{t('activeToggleLabel')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('activeToggleDescription')}
                      </p>
                    </div>
                    <Switch
                      checked={group.is_active ?? true}
                      onCheckedChange={(checked) => handleToggleActive(group, checked)}
                      disabled={group.is_system || togglingId === group.id}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{t('permissionsLabel')}</p>
                      <p className="text-xs text-muted-foreground">
                        {permissionGroups.length === 0
                          ? t('permissionsEmpty')
                          : t('permissionCount', { count: group.permissions?.length ?? 0 })}
                      </p>
                    </div>
                    {permissionGroups.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => togglePermissions(group.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="mr-1 h-4 w-4" />
                        ) : (
                          <ChevronDown className="mr-1 h-4 w-4" />
                        )}
                        {isExpanded ? t('hidePermissions') : t('showPermissions')}
                      </Button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="space-y-3">
                      {permissionGroups.map((category) => (
                        <div key={category.id} className="rounded-lg border p-3">
                          <p className="text-xs font-semibold uppercase text-muted-foreground">
                            {category.label}
                          </p>
                          <ul className="mt-2 space-y-2 text-sm">
                            {category.permissions.map((permission) => (
                              <li key={permission.id} className="space-y-1">
                                <p className="font-medium">
                                  {formatPermissionTitle(permission)}
                                </p>
                                {permission.description && (
                                  <p className="text-xs text-muted-foreground">
                                    {permission.description}
                                  </p>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>

                <CardFooter className="mt-auto border-t">
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditGroup(group)}
                      disabled={group.is_system}
                    >
                      {tCommon('edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteGroup(group)}
                      disabled={group.is_system}
                    >
                      {tCommon('delete')}
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      <UserGroupFormSheet
        open={createOpen || !!editGroup}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditGroup(null)
          }
        }}
        group={editGroup}
        onSuccess={() => {
          setCreateOpen(false)
          setEditGroup(null)
        }}
      />

      <ConfirmDialog
        open={!!deleteGroup}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteGroup(null)
          }
        }}
        title={t('deleteGroup')}
        description={
          deleteGroup
            ? t('deleteDescription', { name: deleteGroup.name })
            : ''
        }
        confirmLabel={tCommon('delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

function EmptyState({
  hasFilters,
  onCreateClick,
}: {
  hasFilters: boolean
  onCreateClick: () => void
}) {
  const t = useTranslations('adminUserGroups')
  return (
    <div className="text-center py-12 px-6">
      <Users className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters ? t('emptyFilterHint') : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('createGroup')}
        </Button>
      )}
    </div>
  )
}

function UserGroupsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      <div className="flex gap-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-9 w-40" />
      </div>

      <Skeleton className="h-4 w-32" />
      <UserGroupsGridSkeleton />
    </div>
  )
}

function UserGroupsGridSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="flex h-full flex-col">
          <CardHeader className="border-b">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-3 w-24" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
          <CardFooter className="mt-auto border-t">
            <div className="ml-auto flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-16" />
            </div>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
