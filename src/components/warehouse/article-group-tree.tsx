'use client'

import * as React from 'react'
import { ChevronRight, ChevronDown, FolderOpen, Folder, Plus, Edit, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import {
  useWhArticleGroups,
  useCreateWhArticleGroup,
  useUpdateWhArticleGroup,
  useDeleteWhArticleGroup,
} from '@/hooks'

type GroupTreeNode = {
  group: {
    id: string
    tenantId: string
    parentId: string | null
    name: string
    sortOrder: number
  }
  children: GroupTreeNode[]
}

interface ArticleGroupTreeProps {
  selectedGroupId: string | null
  onSelect: (groupId: string | null) => void
  canManage?: boolean
}

function TreeNode({
  node,
  selectedGroupId,
  onSelect,
  canManage,
  onEdit,
  onDelete,
  onAddChild,
}: {
  node: GroupTreeNode
  selectedGroupId: string | null
  onSelect: (groupId: string | null) => void
  canManage: boolean
  onEdit: (group: GroupTreeNode['group']) => void
  onDelete: (group: GroupTreeNode['group']) => void
  onAddChild: (parentId: string) => void
}) {
  const [expanded, setExpanded] = React.useState(true)
  const isSelected = selectedGroupId === node.group.id
  const hasChildren = node.children.length > 0

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer text-sm hover:bg-accent ${
          isSelected ? 'bg-accent font-medium' : ''
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(!expanded)
          }}
          className="p-0.5"
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
          ) : (
            <span className="w-3" />
          )}
        </button>
        <button
          onClick={() => onSelect(isSelected ? null : node.group.id)}
          className="flex items-center gap-1.5 flex-1 min-w-0"
        >
          {expanded && hasChildren ? (
            <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="truncate">{node.group.name}</span>
        </button>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100">
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onAddChild(node.group.id)}>
                <Plus className="h-4 w-4 mr-2" />
                Untergruppe
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(node.group)}>
                <Edit className="h-4 w-4 mr-2" />
                Bearbeiten
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(node.group)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Entfernen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {expanded && hasChildren && (
        <div className="ml-4">
          {node.children.map((child) => (
            <TreeNode
              key={child.group.id}
              node={child}
              selectedGroupId={selectedGroupId}
              onSelect={onSelect}
              canManage={canManage}
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

export function ArticleGroupTree({
  selectedGroupId,
  onSelect,
  canManage = false,
}: ArticleGroupTreeProps) {
  const { data: groups, isLoading } = useWhArticleGroups()
  const createGroup = useCreateWhArticleGroup()
  const updateGroup = useUpdateWhArticleGroup()
  const deleteGroup = useDeleteWhArticleGroup()

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [dialogMode, setDialogMode] = React.useState<'create' | 'edit'>('create')
  const [dialogParentId, setDialogParentId] = React.useState<string | undefined>(undefined)
  const [editGroupId, setEditGroupId] = React.useState<string | null>(null)
  const [groupName, setGroupName] = React.useState('')

  function handleAddRoot() {
    setDialogMode('create')
    setDialogParentId(undefined)
    setGroupName('')
    setDialogOpen(true)
  }

  function handleAddChild(parentId: string) {
    setDialogMode('create')
    setDialogParentId(parentId)
    setGroupName('')
    setDialogOpen(true)
  }

  function handleEdit(group: GroupTreeNode['group']) {
    setDialogMode('edit')
    setEditGroupId(group.id)
    setGroupName(group.name)
    setDialogOpen(true)
  }

  function handleDelete(group: GroupTreeNode['group']) {
    deleteGroup.mutate(
      { id: group.id },
      {
        onSuccess: () => {
          toast.success('Gruppe entfernt')
          if (selectedGroupId === group.id) {
            onSelect(null)
          }
        },
        onError: (err) => {
          toast.error(err.message)
        },
      }
    )
  }

  function handleSubmit() {
    if (!groupName.trim()) return

    if (dialogMode === 'create') {
      createGroup.mutate(
        { name: groupName.trim(), parentId: dialogParentId },
        {
          onSuccess: () => {
            toast.success('Gruppe erstellt')
            setDialogOpen(false)
          },
          onError: (err) => toast.error(err.message),
        }
      )
    } else if (editGroupId) {
      updateGroup.mutate(
        { id: editGroupId, name: groupName.trim() },
        {
          onSuccess: () => {
            toast.success('Gruppe aktualisiert')
            setDialogOpen(false)
          },
          onError: (err) => toast.error(err.message),
        }
      )
    }
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Laden...</div>
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-semibold uppercase text-muted-foreground">Gruppen</span>
        {canManage && (
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleAddRoot}>
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>

      <button
        onClick={() => onSelect(null)}
        className={`w-full text-left px-2 py-1 rounded-md text-sm hover:bg-accent ${
          selectedGroupId === null ? 'bg-accent font-medium' : ''
        }`}
      >
        Alle Artikel
      </button>

      {groups?.map((node) => (
        <TreeNode
          key={node.group.id}
          node={node}
          selectedGroupId={selectedGroupId}
          onSelect={onSelect}
          canManage={canManage}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onAddChild={handleAddChild}
        />
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'create' ? 'Neue Artikelgruppe' : 'Gruppe bearbeiten'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Gruppenname"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSubmit} disabled={!groupName.trim()}>
              {dialogMode === 'create' ? 'Erstellen' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
