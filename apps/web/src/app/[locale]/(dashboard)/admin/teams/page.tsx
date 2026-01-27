'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Users, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useTeams, useDeleteTeam, useDepartments } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  TeamDataTable,
  TeamFormSheet,
  TeamDetailSheet,
  MemberManagementSheet,
} from '@/components/teams'
import type { components } from '@/lib/api/types'

type Team = components['schemas']['Team']

export default function TeamsPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])
  const t = useTranslations('adminTeams')

  // Filters
  const [search, setSearch] = React.useState('')
  const [departmentFilter, setDepartmentFilter] = React.useState<string | undefined>(undefined)
  const [activeFilter, setActiveFilter] = React.useState<boolean | undefined>(undefined)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  // Dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editTeam, setEditTeam] = React.useState<Team | null>(null)
  const [viewTeam, setViewTeam] = React.useState<Team | null>(null)
  const [deleteTeam, setDeleteTeam] = React.useState<Team | null>(null)
  const [manageMembersTeam, setManageMembersTeam] = React.useState<Team | null>(null)

  // Fetch teams
  const { data, isLoading, isFetching } = useTeams({
    limit: 100, // Fetch a reasonable number of teams
    departmentId: departmentFilter,
    isActive: activeFilter,
    enabled: !authLoading && isAdmin,
  })

  // Fetch departments for filter
  const { data: departmentsData } = useDepartments({ enabled: !authLoading && isAdmin })
  const departments = departmentsData?.data ?? []

  // Delete mutation
  const deleteMutation = useDeleteTeam()

  // Clear selection when filters change
  React.useEffect(() => {
    setSelectedIds(new Set())
  }, [search, departmentFilter, activeFilter])

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  // Filter teams by search (client-side since API may not support text search)
  const allTeams = data?.items ?? []
  const teams = search
    ? allTeams.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.description?.toLowerCase().includes(search.toLowerCase())
      )
    : allTeams

  const handleView = (team: Team) => {
    setViewTeam(team)
  }

  const handleEdit = (team: Team) => {
    setEditTeam(team)
    setViewTeam(null)
  }

  const handleDelete = (team: Team) => {
    setDeleteTeam(team)
  }

  const handleManageMembers = (team: Team) => {
    setManageMembersTeam(team)
    setViewTeam(null)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTeam) return

    try {
      await deleteMutation.mutateAsync({
        path: { id: deleteTeam.id },
      })
      setDeleteTeam(null)
      if (selectedIds.has(deleteTeam.id)) {
        const newSet = new Set(selectedIds)
        newSet.delete(deleteTeam.id)
        setSelectedIds(newSet)
      }
    } catch {
      // Error handled by mutation
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditTeam(null)
  }

  // Check for any active filters
  const hasFilters = Boolean(search) || departmentFilter !== undefined || activeFilter !== undefined

  if (authLoading) {
    return <TeamsPageSkeleton />
  }

  if (!isAdmin) {
    return null // Will redirect
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
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newTeam')}
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('searchPlaceholder')}
          className="w-full sm:w-80"
          disabled={isFetching}
        />

        <Select
          value={departmentFilter ?? 'all'}
          onValueChange={(value) => {
            setDepartmentFilter(value === 'all' ? undefined : value)
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allDepartments')}</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={activeFilter === undefined ? 'all' : activeFilter ? 'active' : 'inactive'}
          onValueChange={(value) => {
            if (value === 'all') {
              setActiveFilter(undefined)
            } else {
              setActiveFilter(value === 'active')
            }
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
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
              setDepartmentFilter(undefined)
              setActiveFilter(undefined)
            }}
          >
            <X className="mr-2 h-4 w-4" />
            {t('clearFilters')}
          </Button>
        )}
      </div>

      {/* Data table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-96" />
            </div>
          ) : teams.length === 0 ? (
            <EmptyState
              hasFilters={hasFilters}
              onCreateClick={() => setCreateOpen(true)}
            />
          ) : (
            <TeamDataTable
              teams={teams}
              isLoading={isLoading}
              selectedIds={selectedIds}
              onSelectIds={setSelectedIds}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onManageMembers={handleManageMembers}
            />
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Form */}
      <TeamFormSheet
        open={createOpen || !!editTeam}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditTeam(null)
          }
        }}
        team={editTeam}
        onSuccess={handleFormSuccess}
      />

      {/* Detail View */}
      <TeamDetailSheet
        teamId={viewTeam?.id ?? null}
        open={!!viewTeam}
        onOpenChange={(open) => {
          if (!open) {
            setViewTeam(null)
          }
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onManageMembers={handleManageMembers}
      />

      {/* Member Management */}
      <MemberManagementSheet
        team={manageMembersTeam}
        open={!!manageMembersTeam}
        onOpenChange={(open) => {
          if (!open) {
            setManageMembersTeam(null)
          }
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTeam}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTeam(null)
          }
        }}
        title={t('deleteTeam')}
        description={
          deleteTeam
            ? t('deleteDescription', { name: deleteTeam.name })
            : ''
        }
        confirmLabel={t('delete')}
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
  const t = useTranslations('adminTeams')
  return (
    <div className="text-center py-12 px-6">
      <Users className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? t('emptyFilterHint')
          : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('createTeam')}
        </Button>
      )}
    </div>
  )
}

function TeamsPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-36" />
      </div>

      {/* Table */}
      <Skeleton className="h-96" />

      {/* Pagination */}
      <div className="flex justify-between">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-64" />
      </div>
    </div>
  )
}
