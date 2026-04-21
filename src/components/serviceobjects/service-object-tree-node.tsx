'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { kindLabel } from './labels'

export interface ServiceObjectTreeNodeData {
  id: string
  number: string
  name: string
  kind: string
  status: string
  isActive: boolean
  children: ServiceObjectTreeNodeData[]
}

interface Props {
  node: ServiceObjectTreeNodeData
  depth?: number
  expandedIds: Set<string>
  onToggle: (id: string) => void
}

export function ServiceObjectTreeNode({
  node,
  depth = 0,
  expandedIds,
  onToggle,
}: Props) {
  const hasChildren = node.children.length > 0
  const expanded = expandedIds.has(node.id)

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1"
        style={{ paddingLeft: `${depth * 20}px` }}
      >
        {hasChildren ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => onToggle(node.id)}
            aria-label={expanded ? 'Einklappen' : 'Ausklappen'}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <span className="inline-block w-6" />
        )}
        <Wrench className="h-4 w-4 text-muted-foreground" />
        <Link
          href={`/serviceobjects/${node.id}`}
          className="font-medium hover:underline"
        >
          {node.number} — {node.name}
        </Link>
        <Badge variant="outline" className="text-xs">
          {kindLabel(node.kind)}
        </Badge>
        {!node.isActive && (
          <Badge variant="secondary" className="text-xs">
            inaktiv
          </Badge>
        )}
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((c) => (
            <ServiceObjectTreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}
