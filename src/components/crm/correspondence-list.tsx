'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { MoreHorizontal, Edit, Trash2, Plus, Eye, Search } from 'lucide-react'
import {
  useCrmCorrespondence,
  useDeleteCrmCorrespondence,
  useCrmContacts,
} from '@/hooks'
import { CorrespondenceTypeBadge, CorrespondenceDirectionBadge } from './correspondence-type-badge'
import { CorrespondenceFormSheet } from './correspondence-form-sheet'
import { CorrespondenceDetailDialog } from './correspondence-detail-dialog'
import { toast } from 'sonner'

interface CorrespondenceListProps {
  addressId: string
  tenantId: string
}

export function CorrespondenceList({ addressId, tenantId: _tenantId }: CorrespondenceListProps) {
  const t = useTranslations('crmCorrespondence')

  // Filter state
  const [search, setSearch] = React.useState('')
  const [direction, setDirection] = React.useState<string>('all')
  const [typeFilter, setTypeFilter] = React.useState<string>('all')
  const [page, setPage] = React.useState(1)
  const pageSize = 25

  // Dialog state
  const [formOpen, setFormOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<Record<string, unknown> | null>(null)
  const [detailItem, setDetailItem] = React.useState<Record<string, unknown> | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<{ id: string; subject: string } | null>(null)

  const { data, isLoading } = useCrmCorrespondence({
    addressId,
    search: search || undefined,
    direction: direction !== 'all' ? (direction as "INCOMING" | "OUTGOING" | "INTERNAL") : undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    page,
    pageSize,
  })

  const { data: contacts } = useCrmContacts(addressId)
  const deleteMutation = useDeleteCrmCorrespondence()

  const handleDelete = async () => {
    if (!deleteItem) return
    try {
      await deleteMutation.mutateAsync({ id: deleteItem.id })
      setDeleteItem(null)
      toast.success(t('deleteTitle'))
    } catch {
      toast.error('Error')
    }
  }

  const handleEdit = (item: Record<string, unknown>) => {
    setEditItem(item)
    setFormOpen(true)
  }

  const handleCreate = () => {
    setEditItem(null)
    setFormOpen(true)
  }

  const items = (data?.items ?? []) as Array<{
    id: string
    date: Date | string
    direction: string
    type: string
    subject: string
    content: string | null
    fromUser: string | null
    toUser: string | null
    contactId: string | null
    contact: { id: string; firstName: string; lastName: string } | null
  }>
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  const formatDate = (dateStr: string | Date) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{t('title')}</h3>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newEntry')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={direction}
            onValueChange={(v) => {
              setDirection(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="flex-1 sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('directionAll')}</SelectItem>
              <SelectItem value="INCOMING">{t('directionIncoming')}</SelectItem>
              <SelectItem value="OUTGOING">{t('directionOutgoing')}</SelectItem>
              <SelectItem value="INTERNAL">{t('directionInternal')}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="flex-1 sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('typeAll')}</SelectItem>
              <SelectItem value="phone">{t('typePhone')}</SelectItem>
              <SelectItem value="email">{t('typeEmail')}</SelectItem>
              <SelectItem value="letter">{t('typeLetter')}</SelectItem>
              <SelectItem value="fax">{t('typeFax')}</SelectItem>
              <SelectItem value="visit">{t('typeVisit')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4">...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">{t('noEntries')}</p>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="divide-y sm:hidden">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 p-3 active:bg-muted/50 cursor-pointer"
                onClick={() => setDetailItem(item as unknown as Record<string, unknown>)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.subject}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">{formatDate(item.date)}</span>
                    <CorrespondenceDirectionBadge direction={item.direction} />
                    <CorrespondenceTypeBadge type={item.type} />
                  </div>
                  {item.contact && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.contact.firstName} {item.contact.lastName}
                    </p>
                  )}
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDetailItem(item as unknown as Record<string, unknown>)}>
                        <Eye className="mr-2 h-4 w-4" />
                        {t('view')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleEdit(item as unknown as Record<string, unknown>)}>
                        <Edit className="mr-2 h-4 w-4" />
                        {t('edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteItem({ id: item.id, subject: item.subject })}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('date')}</TableHead>
                  <TableHead>{t('direction')}</TableHead>
                  <TableHead>{t('type')}</TableHead>
                  <TableHead>{t('subject')}</TableHead>
                  <TableHead>{t('contact')}</TableHead>
                  <TableHead className="w-16">
                    <span className="sr-only">{t('actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(item.date)}
                    </TableCell>
                    <TableCell>
                      <CorrespondenceDirectionBadge direction={item.direction} />
                    </TableCell>
                    <TableCell>
                      <CorrespondenceTypeBadge type={item.type} />
                    </TableCell>
                    <TableCell className="font-medium max-w-[300px] truncate">
                      {item.subject}
                    </TableCell>
                    <TableCell>
                      {item.contact
                        ? `${item.contact.firstName} ${item.contact.lastName}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDetailItem(item as unknown as Record<string, unknown>)}>
                            <Eye className="mr-2 h-4 w-4" />
                            {t('view')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(item as unknown as Record<string, unknown>)}>
                            <Edit className="mr-2 h-4 w-4" />
                            {t('edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteItem({ id: item.id, subject: item.subject })}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                &lt;
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                &gt;
              </Button>
            </div>
          )}
        </>
      )}

      {/* Form Sheet */}
      <CorrespondenceFormSheet
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false)
            setEditItem(null)
          }
        }}
        addressId={addressId}
        editItem={editItem}
        contacts={contacts ?? []}
      />

      {/* Detail Dialog */}
      <CorrespondenceDetailDialog
        open={!!detailItem}
        onOpenChange={(open) => !open && setDetailItem(null)}
        item={detailItem}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteItem}
        onOpenChange={(open) => !open && setDeleteItem(null)}
        title={t('deleteTitle')}
        description={t('deleteDescription', { subject: deleteItem?.subject ?? '' })}
        confirmLabel={t('confirm')}
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  )
}
