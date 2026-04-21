'use client'

import * as React from 'react'
import {
  ServiceObjectTreeNode,
  type ServiceObjectTreeNodeData,
} from './service-object-tree-node'

interface FlatNode {
  id: string
  number: string
  name: string
  kind: string
  status: string
  isActive: boolean
  parentId: string | null
}

interface Props {
  nodes: FlatNode[] | null | undefined
  autoExpandAll?: boolean
}

function buildTree(flat: FlatNode[]): ServiceObjectTreeNodeData[] {
  const byId = new Map<string, ServiceObjectTreeNodeData>()
  flat.forEach((n) =>
    byId.set(n.id, {
      id: n.id,
      number: n.number,
      name: n.name,
      kind: n.kind,
      status: n.status,
      isActive: n.isActive,
      children: [],
    })
  )
  const roots: ServiceObjectTreeNodeData[] = []
  flat.forEach((n) => {
    const node = byId.get(n.id)!
    if (n.parentId && byId.has(n.parentId)) {
      byId.get(n.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  const sortFn = (a: ServiceObjectTreeNodeData, b: ServiceObjectTreeNodeData) =>
    a.number.localeCompare(b.number)
  const sortRec = (arr: ServiceObjectTreeNodeData[]) => {
    arr.sort(sortFn)
    arr.forEach((c) => sortRec(c.children))
  }
  sortRec(roots)
  return roots
}

export function ServiceObjectTreeView({ nodes, autoExpandAll = true }: Props) {
  const tree = React.useMemo(() => buildTree(nodes ?? []), [nodes])
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    if (!autoExpandAll) return
    const all = new Set<string>()
    const walk = (arr: ServiceObjectTreeNodeData[]) => {
      arr.forEach((n) => {
        all.add(n.id)
        walk(n.children)
      })
    }
    walk(tree)
    setExpandedIds(all)
  }, [tree, autoExpandAll])

  const handleToggle = React.useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  if (!nodes || nodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Keine Serviceobjekte für diesen Kunden.
      </p>
    )
  }

  return (
    <div className="space-y-1">
      {tree.map((n) => (
        <ServiceObjectTreeNode
          key={n.id}
          node={n}
          expandedIds={expandedIds}
          onToggle={handleToggle}
        />
      ))}
    </div>
  )
}
