'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Building2, X, TreePine, List } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useDepartments, useDepartmentTree, useDeleteDepartment } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DepartmentTreeView,
  DepartmentDataTable,
  DepartmentFormSheet,
  DepartmentDetailSheet,
} from '@/components/departments'
import type { components } from '@/lib/api/types'

type Department = components['schemas']['Department']
type DepartmentNode = components['schemas']['DepartmentNode']

export default function DepartmentsPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // View mode
  const [viewMode, setViewMode] = React.useState<'tree' | 'list'>('tree')

  // Filters
  const [search, setSearch] = React.useState('')
  const [activeFilter, setActiveFilter] = React.useState<boolean | undefined>(undefined)

  // Dialogs state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createParentId, setCreateParentId] = React.useState<string | null>(null)
  const [editDepartment, setEditDepartment] = React.useState<Department | null>(null)
  const [viewDepartment, setViewDepartment] = React.useState<Department | null>(null)
  const [deleteDepartment, setDeleteDepartment] = React.useState<Department | null>(null)

  // Fetch data
  const { data: treeData, isLoading: treeLoading } = useDepartmentTree({
    enabled: !authLoading && isAdmin && viewMode === 'tree',
  })

  const { data: listData, isLoading: listLoading } = useDepartments({
    enabled: !authLoading && isAdmin && viewMode === 'list',
    active: activeFilter,
  })

  // Delete mutation
  const deleteMutation = useDeleteDepartment()

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const tree = treeData ?? []
  const departments = listData?.data ?? []

  // Filter tree by search (client-side for simplicity)
  const filteredTree = React.useMemo(() => {
    if (!search.trim()) return tree

    const searchLower = search.toLowerCase()
    const filterNodes = (nodes: DepartmentNode[]): DepartmentNode[] => {
      return nodes
        .map((node) => {
          const matchesSelf =
            node.department.name.toLowerCase().includes(searchLower) ||
            node.department.code.toLowerCase().includes(searchLower)
          const filteredChildren = node.children ? filterNodes(node.children) : []

          if (matchesSelf || filteredChildren.length > 0) {
            return {
              ...node,
              children: filteredChildren,
            }
          }
          return null
        })
        .filter((n): n is NonNullable<typeof n> => n !== null)
    }
    return filterNodes(tree)
  }, [tree, search])

  // Filter list by search
  const filteredList = React.useMemo(() => {
    if (!search.trim()) return departments

    const searchLower = search.toLowerCase()
    return departments.filter(
      (d) =>
        d.name.toLowerCase().includes(searchLower) ||
        d.code.toLowerCase().includes(searchLower)
    )
  }, [departments, search])

  const handleView = (department: Department) => {
    setViewDepartment(department)
  }

  const handleEdit = (department: Department) => {
    setEditDepartment(department)
    setViewDepartment(null)
  }

  const handleDelete = (department: Department) => {
    setDeleteDepartment(department)
  }

  const handleAddChild = (parentId: string) => {
    setCreateParentId(parentId)
    setCreateOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deleteDepartment) return

    try {
      await deleteMutation.mutateAsync({
        path: { id: deleteDepartment.id },
      })
      setDeleteDepartment(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditDepartment(null)
    setCreateParentId(null)
  }

  const hasFilters = Boolean(search) || activeFilter !== undefined

  if (authLoading) {
    return <DepartmentsPageSkeleton />
  }

  if (!isAdmin) {
    return null
  }

  const isLoading = viewMode === 'tree' ? treeLoading : listLoading

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Departments</h1>
          <p className="text-muted-foreground">
            Manage organizational structure and department hierarchy
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Department
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name or code..."
          className="w-full sm:w-80"
        />

        {viewMode === 'list' && (
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
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        )}

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setActiveFilter(undefined)
            }}
          >
            <X className="mr-2 h-4 w-4" />
            Clear filters
          </Button>
        )}

        {/* View mode toggle */}
        <div className="ml-auto">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'tree' | 'list')}>
            <TabsList>
              <TabsTrigger value="tree">
                <TreePine className="mr-2 h-4 w-4" />
                Tree
              </TabsTrigger>
              <TabsTrigger value="list">
                <List className="mr-2 h-4 w-4" />
                List
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Content */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-96" />
            </div>
          ) : viewMode === 'tree' ? (
            filteredTree.length === 0 ? (
              <EmptyState hasFilters={hasFilters} onCreateClick={() => setCreateOpen(true)} />
            ) : (
              <div className="p-4">
                <DepartmentTreeView
                  data={filteredTree}
                  isLoading={false}
                  onView={handleView}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onAddChild={handleAddChild}
                />
              </div>
            )
          ) : filteredList.length === 0 ? (
            <EmptyState hasFilters={hasFilters} onCreateClick={() => setCreateOpen(true)} />
          ) : (
            <DepartmentDataTable
              departments={filteredList}
              isLoading={false}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Form */}
      <DepartmentFormSheet
        open={createOpen || !!editDepartment}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditDepartment(null)
            setCreateParentId(null)
          }
        }}
        department={editDepartment}
        parentId={createParentId}
        onSuccess={handleFormSuccess}
      />

      {/* Detail View */}
      <DepartmentDetailSheet
        departmentId={viewDepartment?.id ?? null}
        open={!!viewDepartment}
        onOpenChange={(open) => {
          if (!open) {
            setViewDepartment(null)
          }
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteDepartment}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDepartment(null)
          }
        }}
        title="Delete Department"
        description={
          deleteDepartment
            ? `Are you sure you want to delete "${deleteDepartment.name}"? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
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
  return (
    <div className="text-center py-12 px-6">
      <Building2 className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">No departments found</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? 'Try adjusting your search or filters'
          : 'Get started by creating your first department'}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          Add Department
        </Button>
      )}
    </div>
  )
}

function DepartmentsPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-9 w-40 ml-auto" />
      </div>

      {/* Content */}
      <Skeleton className="h-96" />
    </div>
  )
}
