'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import {
  Plus,
  Search,
  Paperclip,
  Lock,
  AlertTriangle,
  Calendar,
  Trash2,
  Edit,
  MoreHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  useHrPersonnelFileEntries,
  useHrPersonnelFileCategories,
  useDeleteHrPersonnelFileEntry,
} from '@/hooks'
import { PersonnelFileEntryDialog } from './personnel-file-entry-dialog'

interface PersonnelFileTabProps {
  employeeId: string
}

export function PersonnelFileTab({ employeeId }: PersonnelFileTabProps) {
  const t = useTranslations('hrPersonnelFile')
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | undefined>()
  const [search, setSearch] = React.useState('')
  const [entryDialogOpen, setEntryDialogOpen] = React.useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editEntry, setEditEntry] = React.useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deleteEntry, setDeleteEntry] = React.useState<any>(null)

  const { data: categoriesData } = useHrPersonnelFileCategories()
  const { data: entriesData, isLoading } = useHrPersonnelFileEntries(
    employeeId,
    selectedCategoryId
  )
  const deleteMutation = useDeleteHrPersonnelFileEntry()

  const categories = categoriesData ?? []
  const entries = entriesData?.items ?? []

  // Filter entries by search term (client-side for immediate feedback)
  const filteredEntries = search.trim()
    ? entries.filter(
        (e) =>
          e.title.toLowerCase().includes(search.toLowerCase()) ||
          (e.description && e.description.toLowerCase().includes(search.toLowerCase()))
      )
    : entries

  function isExpiringSoon(expiresAt: string | Date | null | undefined): boolean {
    if (!expiresAt) return false
    const date = new Date(expiresAt)
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    return date <= thirtyDaysFromNow && date >= new Date()
  }

  function isExpired(expiresAt: string | Date | null | undefined): boolean {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }

  const handleDelete = async () => {
    if (!deleteEntry) return
    try {
      await deleteMutation.mutateAsync({ id: deleteEntry.id })
      setDeleteEntry(null)
    } catch {
      // Error handled by mutation
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header: Category filters + Search + New Entry button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={!selectedCategoryId ? 'default' : 'outline'}
            onClick={() => setSelectedCategoryId(undefined)}
          >
            {t('allCategories')}
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat.id}
              size="sm"
              variant={selectedCategoryId === cat.id ? 'default' : 'outline'}
              onClick={() =>
                setSelectedCategoryId(selectedCategoryId === cat.id ? undefined : cat.id)
              }
            >
              {cat.color && (
                <span
                  className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
              )}
              {cat.name}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 w-48"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={() => { setEditEntry(null); setEntryDialogOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" />
            {t('newEntry')}
          </Button>
        </div>
      </div>

      {/* Entry List */}
      {filteredEntries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('noEntries')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredEntries.map((entry) => (
            <Card key={entry.id} className="hover:bg-muted/50 transition-colors">
              <CardContent className="flex items-center gap-4 py-3 px-4">
                {/* Category color dot */}
                {entry.category?.color && (
                  <span
                    className="inline-block h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: entry.category.color }}
                  />
                )}

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{entry.title}</p>
                    {entry.isConfidential && (
                      <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {entry.category?.name}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(entry.entryDate), 'dd.MM.yyyy')}
                    </span>
                  </div>
                </div>

                {/* Expiry badge */}
                {entry.expiresAt && (
                  <div className="shrink-0">
                    {isExpired(entry.expiresAt) ? (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        {t('expired')}
                      </Badge>
                    ) : isExpiringSoon(entry.expiresAt) ? (
                      <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-600">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        {t('expiringSoon')}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t('expiresOn', { date: format(new Date(entry.expiresAt), 'dd.MM.yyyy') })}
                      </span>
                    )}
                  </div>
                )}

                {/* Attachment count */}
                {entry.attachments && entry.attachments.length > 0 && (
                  <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                    <Paperclip className="h-3.5 w-3.5" />
                    <span className="text-xs">{entry.attachments.length}</span>
                  </div>
                )}

                {/* Actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setEditEntry(entry)
                        setEntryDialogOpen(true)
                      }}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      {t('editEntry')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setDeleteEntry(entry)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('deleteEntry')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Total count */}
      {entriesData && entriesData.total > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {t('totalEntries', { count: entriesData.total })}
        </p>
      )}

      {/* Entry Form Dialog */}
      <PersonnelFileEntryDialog
        open={entryDialogOpen}
        onOpenChange={setEntryDialogOpen}
        employeeId={employeeId}
        entry={editEntry}
        onSuccess={() => {
          setEntryDialogOpen(false)
          setEditEntry(null)
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteEntry}
        onOpenChange={(open) => { if (!open) setDeleteEntry(null) }}
        title={t('deleteConfirmTitle')}
        description={t('deleteConfirmDescription', { title: deleteEntry?.title ?? '' })}
        confirmLabel={t('delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
