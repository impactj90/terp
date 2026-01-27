# Implementation Plan: NOK-226 - Build Department Management with Hierarchy Tree View

**Date**: 2026-01-26
**Ticket**: NOK-226
**Status**: Planning Complete

---

## Overview

Build a department management page with hierarchical tree visualization and CRUD operations. The page will support:
- Tree view showing department hierarchy (parent/child relationships)
- List view for flat table display
- Create, edit, and delete departments
- Parent department selection with circular reference prevention
- Status (active/inactive) management

The backend API already exists and includes a `/departments/tree` endpoint for hierarchy data. The main work is frontend implementation.

---

## Prerequisites

Before starting implementation:

1. **Add `/departments/tree` to OpenAPI spec** - Currently exists in backend but not in the spec
2. **Regenerate TypeScript types** - Run `pnpm run generate:api` after spec update
3. **Backend is running** - Verify with `make dev`

---

## Phase 1: OpenAPI Spec Update and Type Generation

### Goal
Add the tree endpoint to the API spec and regenerate TypeScript types.

### Tasks

#### 1.1 Update OpenAPI Spec

**File**: `/home/tolga/projects/terp/api/paths/departments.yaml`

Add the following endpoint after the existing endpoints:

```yaml
/departments/tree:
  get:
    tags:
      - Departments
    summary: Get department tree
    description: |
      Returns all departments as a hierarchical tree structure.
      Each node contains the department and its children recursively.
    operationId: getDepartmentTree
    responses:
      200:
        description: Department tree structure
        schema:
          type: array
          items:
            $ref: '../schemas/departments.yaml#/DepartmentNode'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
```

#### 1.2 Add DepartmentNode Schema

**File**: `/home/tolga/projects/terp/api/schemas/departments.yaml`

Add after existing schemas:

```yaml
DepartmentNode:
  type: object
  required:
    - department
  properties:
    department:
      $ref: '#/Department'
    children:
      type: array
      items:
        $ref: '#/DepartmentNode'
```

#### 1.3 Bundle and Generate

```bash
cd /home/tolga/projects/terp
make swagger-bundle
cd apps/web && pnpm run generate:api
```

### Verification
- Run `make swagger-bundle` without errors
- Run `pnpm run generate:api` without errors
- Check `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts` contains `DepartmentNode` type

---

## Phase 2: Extend Department Hooks

### Goal
Add missing CRUD hooks and the tree endpoint hook to the departments hook file.

### Tasks

#### 2.1 Extend use-departments.ts

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-departments.ts`

Add the following hooks:

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseDepartmentsOptions {
  enabled?: boolean
  active?: boolean
  parentId?: string
}

/**
 * Hook to fetch list of departments.
 */
export function useDepartments(options: UseDepartmentsOptions = {}) {
  const { enabled = true, active, parentId } = options

  return useApiQuery('/departments', {
    params: {
      active,
      parent_id: parentId,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single department by ID.
 */
export function useDepartment(id: string, enabled = true) {
  return useApiQuery('/departments/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to fetch department tree structure.
 */
export function useDepartmentTree(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options

  return useApiQuery('/departments/tree', {
    enabled,
  })
}

/**
 * Hook to create a new department.
 */
export function useCreateDepartment() {
  return useApiMutation('/departments', 'post', {
    invalidateKeys: [['/departments'], ['/departments/tree']],
  })
}

/**
 * Hook to update an existing department.
 */
export function useUpdateDepartment() {
  return useApiMutation('/departments/{id}', 'patch', {
    invalidateKeys: [['/departments'], ['/departments/tree']],
  })
}

/**
 * Hook to delete a department.
 */
export function useDeleteDepartment() {
  return useApiMutation('/departments/{id}', 'delete', {
    invalidateKeys: [['/departments'], ['/departments/tree']],
  })
}
```

#### 2.2 Update Hooks Index

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`

Update the departments export:

```typescript
// Departments
export {
  useDepartments,
  useDepartment,
  useDepartmentTree,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
} from './use-departments'
```

### Verification
- No TypeScript errors in hook files
- Import hooks in a test file to verify they compile

---

## Phase 3: Create Tree View Component

### Goal
Create a reusable tree view component for displaying hierarchical department data.

### Tasks

#### 3.1 Create DepartmentTreeNode Component

**File**: `/home/tolga/projects/terp/apps/web/src/components/departments/department-tree-node.tsx`

This component renders a single node in the tree with expand/collapse functionality:

```typescript
'use client'

import * as React from 'react'
import { ChevronRight, ChevronDown, Building2, MoreHorizontal, Edit, Trash2, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { components } from '@/lib/api/types'

type Department = components['schemas']['Department']
type DepartmentNode = components['schemas']['DepartmentNode']

interface DepartmentTreeNodeProps {
  node: DepartmentNode
  depth: number
  expandedIds: Set<string>
  onToggle: (id: string) => void
  onView: (department: Department) => void
  onEdit: (department: Department) => void
  onDelete: (department: Department) => void
  onAddChild: (parentId: string) => void
}

export function DepartmentTreeNode({
  node,
  depth,
  expandedIds,
  onToggle,
  onView,
  onEdit,
  onDelete,
  onAddChild,
}: DepartmentTreeNodeProps) {
  const { department, children = [] } = node
  const hasChildren = children.length > 0
  const isExpanded = expandedIds.has(department.id)

  return (
    <div>
      {/* Node row */}
      <div
        className={cn(
          'flex items-center gap-2 py-2 px-2 rounded-md hover:bg-muted/50 group cursor-pointer',
          depth > 0 && 'ml-6'
        )}
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
        onClick={() => onView(department)}
      >
        {/* Expand/collapse button */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-6 w-6 shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) onToggle(department.id)
          }}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : (
            <span className="w-4" />
          )}
        </Button>

        {/* Department icon */}
        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />

        {/* Department info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{department.name}</span>
            <span className="text-xs text-muted-foreground font-mono">({department.code})</span>
          </div>
        </div>

        {/* Status badge */}
        <Badge variant={department.is_active ? 'default' : 'secondary'} className="shrink-0">
          {department.is_active ? 'Active' : 'Inactive'}
        </Badge>

        {/* Children count */}
        {hasChildren && (
          <span className="text-xs text-muted-foreground shrink-0">
            {children.length} {children.length === 1 ? 'child' : 'children'}
          </span>
        )}

        {/* Actions dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(department)}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(department)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddChild(department.id)}>
              <Building2 className="mr-2 h-4 w-4" />
              Add Child Department
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDelete(department)}
              disabled={hasChildren}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {children.map((child) => (
            <DepartmentTreeNode
              key={child.department.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

#### 3.2 Create DepartmentTreeView Component

**File**: `/home/tolga/projects/terp/apps/web/src/components/departments/department-tree-view.tsx`

This component manages the tree state and renders all root nodes:

```typescript
'use client'

import * as React from 'react'
import { Building2, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DepartmentTreeNode } from './department-tree-node'
import type { components } from '@/lib/api/types'

type Department = components['schemas']['Department']
type DepartmentNode = components['schemas']['DepartmentNode']

interface DepartmentTreeViewProps {
  data: DepartmentNode[]
  isLoading: boolean
  onView: (department: Department) => void
  onEdit: (department: Department) => void
  onDelete: (department: Department) => void
  onAddChild: (parentId: string) => void
}

export function DepartmentTreeView({
  data,
  isLoading,
  onView,
  onEdit,
  onDelete,
  onAddChild,
}: DepartmentTreeViewProps) {
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())

  // Auto-expand all on initial load
  React.useEffect(() => {
    if (data.length > 0 && expandedIds.size === 0) {
      const allIds = new Set<string>()
      const collectIds = (nodes: DepartmentNode[]) => {
        nodes.forEach((node) => {
          allIds.add(node.department.id)
          if (node.children) {
            collectIds(node.children)
          }
        })
      }
      collectIds(data)
      setExpandedIds(allIds)
    }
  }, [data, expandedIds.size])

  const handleToggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleExpandAll = () => {
    const allIds = new Set<string>()
    const collectIds = (nodes: DepartmentNode[]) => {
      nodes.forEach((node) => {
        allIds.add(node.department.id)
        if (node.children) {
          collectIds(node.children)
        }
      })
    }
    collectIds(data)
    setExpandedIds(allIds)
  }

  const handleCollapseAll = () => {
    setExpandedIds(new Set())
  }

  if (isLoading) {
    return <DepartmentTreeSkeleton />
  }

  if (data.length === 0) {
    return null // Let parent handle empty state
  }

  return (
    <div className="space-y-2">
      {/* Expand/Collapse controls */}
      <div className="flex gap-2 px-2">
        <Button variant="ghost" size="sm" onClick={handleExpandAll}>
          <ChevronDown className="mr-1 h-4 w-4" />
          Expand All
        </Button>
        <Button variant="ghost" size="sm" onClick={handleCollapseAll}>
          <ChevronRight className="mr-1 h-4 w-4" />
          Collapse All
        </Button>
      </div>

      {/* Tree nodes */}
      <div className="space-y-1">
        {data.map((node) => (
          <DepartmentTreeNode
            key={node.department.id}
            node={node}
            depth={0}
            expandedIds={expandedIds}
            onToggle={handleToggle}
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
            onAddChild={onAddChild}
          />
        ))}
      </div>
    </div>
  )
}

function DepartmentTreeSkeleton() {
  return (
    <div className="space-y-2 p-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6" />
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-5 w-16" />
          </div>
          {i === 1 && (
            <div className="ml-8 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-6" />
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-5 w-16" />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

### Verification
- Components render without TypeScript errors
- Tree nodes expand/collapse on click
- Actions dropdown shows all options

---

## Phase 4: Create Form and Detail Sheets

### Goal
Create the form sheet for create/edit and detail sheet for viewing department information.

### Tasks

#### 4.1 Create DepartmentFormSheet

**File**: `/home/tolga/projects/terp/apps/web/src/components/departments/department-form-sheet.tsx`

Follow pattern from `/home/tolga/projects/terp/apps/web/src/components/employees/employee-form-sheet.tsx`:

```typescript
'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useCreateDepartment,
  useUpdateDepartment,
  useDepartments,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Department = components['schemas']['Department']

interface DepartmentFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  department?: Department | null
  parentId?: string | null
  onSuccess?: () => void
}

interface FormState {
  name: string
  code: string
  description: string
  parentId: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  name: '',
  code: '',
  description: '',
  parentId: '',
  isActive: true,
}

function validateForm(form: FormState): string[] {
  const errors: string[] = []

  if (!form.name.trim()) {
    errors.push('Name is required')
  }

  if (!form.code.trim()) {
    errors.push('Code is required')
  } else if (form.code.length > 20) {
    errors.push('Code must be 20 characters or less')
  }

  return errors
}

export function DepartmentFormSheet({
  open,
  onOpenChange,
  department,
  parentId,
  onSuccess,
}: DepartmentFormSheetProps) {
  const isEdit = !!department
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  // Mutations
  const createMutation = useCreateDepartment()
  const updateMutation = useUpdateDepartment()

  // Fetch departments for parent selection
  const { data: departmentsData, isLoading: loadingDepartments } = useDepartments({
    enabled: open,
    active: true,
  })
  const departments = departmentsData?.data ?? []

  // Filter out self and descendants for parent selection (prevent circular reference)
  const availableParents = React.useMemo(() => {
    if (!isEdit) return departments
    // Simple filter: exclude self (backend will catch circular references)
    return departments.filter((d) => d.id !== department?.id)
  }, [departments, department, isEdit])

  // Reset form when opening/closing or department changes
  React.useEffect(() => {
    if (open) {
      if (department) {
        setForm({
          name: department.name,
          code: department.code,
          description: department.description || '',
          parentId: department.parent_id || '',
          isActive: department.is_active,
        })
      } else {
        setForm({
          ...INITIAL_STATE,
          parentId: parentId || '',
        })
      }
      setError(null)
    }
  }, [open, department, parentId])

  const handleSubmit = async () => {
    setError(null)

    const errors = validateForm(form)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && department) {
        await updateMutation.mutateAsync({
          path: { id: department.id },
          body: {
            name: form.name.trim(),
            code: form.code.trim(),
            description: form.description.trim() || undefined,
            parent_id: form.parentId || undefined,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            name: form.name.trim(),
            code: form.code.trim(),
            description: form.description.trim() || undefined,
            parent_id: form.parentId || undefined,
          },
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? `Failed to ${isEdit ? 'update' : 'create'} department`
      )
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Department' : 'New Department'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update department information and hierarchy.'
              : 'Create a new department in your organization.'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Basic Information</h3>

              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder="Engineering"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                  }
                  disabled={isSubmitting}
                  placeholder="ENG"
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground">
                  Short unique identifier (max 20 characters)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder="Department description..."
                  rows={3}
                />
              </div>
            </div>

            {/* Hierarchy */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Hierarchy</h3>

              <div className="space-y-2">
                <Label>Parent Department</Label>
                <Select
                  value={form.parentId || '__none__'}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, parentId: value === '__none__' ? '' : value }))
                  }
                  disabled={isSubmitting || loadingDepartments}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select parent department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No Parent (Root Level)</SelectItem>
                    {availableParents.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name} ({dept.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status (only for edit) */}
            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">Status</h3>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">Active</Label>
                    <p className="text-xs text-muted-foreground">
                      Inactive departments are hidden from selection lists
                    </p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={form.isActive}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, isActive: checked }))
                    }
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Department'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

#### 4.2 Create DepartmentDetailSheet

**File**: `/home/tolga/projects/terp/apps/web/src/components/departments/department-detail-sheet.tsx`

Follow pattern from `/home/tolga/projects/terp/apps/web/src/components/employees/employee-detail-sheet.tsx`:

```typescript
'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { Edit, Trash2, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useDepartment } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Department = components['schemas']['Department']

interface DepartmentDetailSheetProps {
  departmentId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (department: Department) => void
  onDelete: (department: Department) => void
}

interface DetailRowProps {
  label: string
  value: React.ReactNode
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex justify-between py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '-'}</span>
    </div>
  )
}

export function DepartmentDetailSheet({
  departmentId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: DepartmentDetailSheetProps) {
  const { data: department, isLoading } = useDepartment(departmentId || '', open && !!departmentId)

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy HH:mm')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>Department Details</SheetTitle>
          <SheetDescription>View department information and hierarchy</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 space-y-4 py-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : department ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Header with icon and status */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <Building2 className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{department.name}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{department.code}</p>
                </div>
                <Badge variant={department.is_active ? 'default' : 'secondary'}>
                  {department.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              {/* Basic Information */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Basic Information</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label="Name" value={department.name} />
                  <DetailRow label="Code" value={department.code} />
                  <DetailRow label="Description" value={department.description} />
                </div>
              </div>

              {/* Hierarchy */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Hierarchy</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow
                    label="Parent Department"
                    value={department.parent?.name || 'None (Root Level)'}
                  />
                  <DetailRow
                    label="Child Departments"
                    value={
                      department.children && department.children.length > 0
                        ? department.children.map((c) => c.name).join(', ')
                        : 'None'
                    }
                  />
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Timestamps</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label="Created" value={formatDate(department.created_at)} />
                  <DetailRow label="Last Updated" value={formatDate(department.updated_at)} />
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Close
          </Button>
          {department && (
            <>
              <Button variant="outline" onClick={() => onEdit(department)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="destructive"
                onClick={() => onDelete(department)}
                disabled={department.children && department.children.length > 0}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

#### 4.3 Create Index File

**File**: `/home/tolga/projects/terp/apps/web/src/components/departments/index.ts`

```typescript
export { DepartmentTreeView } from './department-tree-view'
export { DepartmentTreeNode } from './department-tree-node'
export { DepartmentFormSheet } from './department-form-sheet'
export { DepartmentDetailSheet } from './department-detail-sheet'
```

### Verification
- Form submits without errors
- Detail sheet displays all department information
- Parent selection excludes self in edit mode

---

## Phase 5: Create Department Page

### Goal
Build the main department management page with tree/list toggle, filters, and all CRUD functionality.

### Tasks

#### 5.1 Create Department Data Table (Optional List View)

**File**: `/home/tolga/projects/terp/apps/web/src/components/departments/department-data-table.tsx`

Similar to employee data table but for flat department list:

```typescript
'use client'

import * as React from 'react'
import { MoreHorizontal, Eye, Edit, Building2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import type { components } from '@/lib/api/types'

type Department = components['schemas']['Department']

interface DepartmentDataTableProps {
  departments: Department[]
  isLoading: boolean
  onView: (department: Department) => void
  onEdit: (department: Department) => void
  onDelete: (department: Department) => void
}

export function DepartmentDataTable({
  departments,
  isLoading,
  onView,
  onEdit,
  onDelete,
}: DepartmentDataTableProps) {
  if (isLoading) {
    return <DepartmentDataTableSkeleton />
  }

  if (departments.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">Code</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Parent</TableHead>
          <TableHead className="w-24">Status</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {departments.map((department) => (
          <TableRow
            key={department.id}
            className="cursor-pointer"
            onClick={() => onView(department)}
          >
            <TableCell className="font-mono text-sm">{department.code}</TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                  <Building2 className="h-4 w-4" />
                </div>
                <span className="font-medium">{department.name}</span>
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {department.parent?.name || '-'}
            </TableCell>
            <TableCell>
              <Badge variant={department.is_active ? 'default' : 'secondary'}>
                {department.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(department)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(department)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(department)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function DepartmentDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-4 w-32" />
              </div>
            </TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

#### 5.2 Create Department Page

**File**: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/departments/page.tsx`

Follow pattern from `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/employees/page.tsx`:

```typescript
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
    const filterNodes = (nodes: typeof tree): typeof tree => {
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
```

#### 5.3 Update Component Index

**File**: `/home/tolga/projects/terp/apps/web/src/components/departments/index.ts`

Update to include data table:

```typescript
export { DepartmentTreeView } from './department-tree-view'
export { DepartmentTreeNode } from './department-tree-node'
export { DepartmentDataTable } from './department-data-table'
export { DepartmentFormSheet } from './department-form-sheet'
export { DepartmentDetailSheet } from './department-detail-sheet'
```

### Verification
- Page loads without errors at `/admin/departments`
- Tree view shows hierarchy correctly
- List view shows flat table
- Toggle between views works
- Search filters both views
- Create department form opens and submits
- Edit department populates form correctly
- Delete confirmation shows and works
- "Add Child Department" creates with parent pre-selected

---

## Success Criteria

1. **Tree View**: Departments display hierarchically with expand/collapse
2. **List View**: Departments display in flat table format
3. **View Toggle**: Can switch between tree and list views
4. **CRUD Operations**:
   - Create new department (with optional parent)
   - Edit department (change name, code, parent, status)
   - Delete department (blocked if has children)
   - View department details
5. **Search**: Filter departments by name or code
6. **Status Filter**: Filter by active/inactive (list view)
7. **Hierarchy Validation**: Cannot create circular references
8. **Navigation**: Accessible from admin sidebar at `/admin/departments`

---

## Manual Testing Checklist

### Tree View
- [ ] Page loads and displays tree structure
- [ ] Root departments show at top level
- [ ] Child departments show indented under parents
- [ ] Expand/collapse chevron works
- [ ] "Expand All" expands all nodes
- [ ] "Collapse All" collapses all nodes
- [ ] Clicking a row opens detail sheet
- [ ] Actions dropdown appears on hover
- [ ] "Add Child Department" opens form with parent pre-selected

### List View
- [ ] Toggle to list view shows flat table
- [ ] Parent column shows parent name or "-"
- [ ] Status badges show correctly
- [ ] Row actions dropdown works
- [ ] Status filter shows active/inactive/all

### Create Department
- [ ] Form opens from "New Department" button
- [ ] Form opens from "Add Child Department" action
- [ ] Parent selection shows available departments
- [ ] Validation prevents empty name/code
- [ ] Submit creates department
- [ ] Tree/list updates after creation
- [ ] Form closes on success

### Edit Department
- [ ] Form opens from edit action
- [ ] Form populates with current values
- [ ] Parent selection excludes self
- [ ] Active/inactive toggle works
- [ ] Submit updates department
- [ ] Tree/list updates after update
- [ ] Form closes on success

### Delete Department
- [ ] Confirmation dialog appears
- [ ] Cannot delete department with children (button disabled)
- [ ] Delete removes department
- [ ] Tree/list updates after deletion

### Search
- [ ] Search filters tree by name/code
- [ ] Search filters list by name/code
- [ ] Clear filters button works

### Error Handling
- [ ] Duplicate code shows error message
- [ ] Circular reference shows error message
- [ ] Network errors show appropriate message

---

## Files to Create/Modify

### New Files
- `/home/tolga/projects/terp/apps/web/src/components/departments/department-tree-node.tsx`
- `/home/tolga/projects/terp/apps/web/src/components/departments/department-tree-view.tsx`
- `/home/tolga/projects/terp/apps/web/src/components/departments/department-data-table.tsx`
- `/home/tolga/projects/terp/apps/web/src/components/departments/department-form-sheet.tsx`
- `/home/tolga/projects/terp/apps/web/src/components/departments/department-detail-sheet.tsx`
- `/home/tolga/projects/terp/apps/web/src/components/departments/index.ts`
- `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/departments/page.tsx`

### Modified Files
- `/home/tolga/projects/terp/api/paths/departments.yaml` - Add tree endpoint
- `/home/tolga/projects/terp/api/schemas/departments.yaml` - Add DepartmentNode schema
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-departments.ts` - Add CRUD hooks
- `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts` - Export new hooks

---

## Estimated Effort

| Phase | Effort | Description |
|-------|--------|-------------|
| Phase 1 | 15 min | OpenAPI spec update and type generation |
| Phase 2 | 20 min | Hook extensions |
| Phase 3 | 45 min | Tree view components |
| Phase 4 | 45 min | Form and detail sheets |
| Phase 5 | 60 min | Main page and data table |
| **Total** | **~3 hours** | Full implementation |

---

## Notes

- The backend already fully supports the tree endpoint - no backend changes needed
- Follow existing employee management patterns for consistency
- Tree view uses client-side filtering for simplicity (acceptable given typical department count)
- Consider adding drag-and-drop reordering in future enhancement
