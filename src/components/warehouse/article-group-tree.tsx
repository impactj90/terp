'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  const t = useTranslations('warehouseArticles')
  const [expanded, setExpanded] = React.useState(true)
  const isSelected = selectedGroupId === node.group.id
  const hasChildren = node.children.length > 0

  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors hover:bg-accent ${
          isSelected ? 'bg-accent font-medium' : ''
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(!expanded)
          }}
          className="p-0.5 shrink-0"
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )
          ) : (
            <span className="w-3.5" />
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
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation()
                onAddChild(node.group.id)
              }}
              title={t('groupAddChild')}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onAddChild(node.group.id)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('groupAddChild')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onEdit(node.group)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  {t('groupRename')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(node.group)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('groupRemove')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      {expanded && hasChildren && (
        <div className="ml-3 border-l border-border/40 pl-1">
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
  const t = useTranslations('warehouseArticles')
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
          toast.success(t('toastGroupRemoved'))
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
            toast.success(t('toastGroupCreated'))
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
            toast.success(t('toastGroupUpdated'))
            setDialogOpen(false)
          },
          onError: (err) => toast.error(err.message),
        }
      )
    }
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">{t('loading')}</div>
  }

  return (
    <div className="space-y-0.5">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('groupsHeader')}
        </span>
      </div>

      {/* "Alle Artikel" with hover action for root group */}
      <div
        className={`group flex items-center justify-between px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors hover:bg-accent ${
          selectedGroupId === null ? 'bg-accent font-medium' : ''
        }`}
      >
        <button
          onClick={() => onSelect(null)}
          className="flex-1 text-left"
        >
          {t('allArticles')}
        </button>
        {canManage && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              handleAddRoot()
            }}
            title={t('groupAddRoot')}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Group tree */}
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

      {/* Persistent add-group link at bottom */}
      {canManage && (
        <button
          onClick={handleAddRoot}
          className="flex items-center gap-1.5 w-full px-2 py-1.5 mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent"
        >
          <Plus className="h-3 w-3" />
          {t('groupNew')}
        </button>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'create' ? t('groupDialogTitleCreate') : t('groupDialogTitleEdit')}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder={t('groupNamePlaceholder')}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={!groupName.trim()}>
              {dialogMode === 'create' ? t('create') : t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
