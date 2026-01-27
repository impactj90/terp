'use client'

import * as React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('adminDepartments')
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
          {t('expandAll')}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleCollapseAll}>
          <ChevronRight className="mr-1 h-4 w-4" />
          {t('collapseAll')}
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
