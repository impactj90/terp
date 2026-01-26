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
