'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
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
import { MoreHorizontal, Edit, Trash2, Plus, Eye, Search, XCircle } from 'lucide-react'
import {
  useCrmInquiries,
  useDeleteCrmInquiry,
} from '@/hooks'
import { InquiryStatusBadge } from './inquiry-status-badge'
import { InquiryFormSheet } from './inquiry-form-sheet'
import { toast } from 'sonner'

interface InquiryListProps {
  addressId?: string
}

export function InquiryList({ addressId }: InquiryListProps) {
  const t = useTranslations('crmInquiries')
  const router = useRouter()

  // Filter state
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [page, setPage] = React.useState(1)
  const pageSize = 25

  // Dialog state
  const [formOpen, setFormOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<Record<string, unknown> | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<{ id: string; title: string } | null>(null)

  const { data, isLoading } = useCrmInquiries({
    addressId,
    search: search || undefined,
    status: statusFilter !== 'all' ? (statusFilter as "OPEN" | "IN_PROGRESS" | "CLOSED" | "CANCELLED") : undefined,
    page,
    pageSize,
  })

  const deleteMutation = useDeleteCrmInquiry()

  const handleDelete = async () => {
    if (!deleteItem) return
    try {
      await deleteMutation.mutateAsync({ id: deleteItem.id })
      setDeleteItem(null)
      toast.success(t('deleteTitle'))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error'
      toast.error(message)
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
    number: string
    title: string
    status: string
    effort: string | null
    createdAt: Date | string
    address: { id: string; company: string } | null
    contact: { id: string; firstName: string; lastName: string } | null
    order: { id: string; code: string; name: string } | null
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
          {t('newInquiry')}
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
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('statusAll')}</SelectItem>
            <SelectItem value="OPEN">{t('statusOpen')}</SelectItem>
            <SelectItem value="IN_PROGRESS">{t('statusInProgress')}</SelectItem>
            <SelectItem value="CLOSED">{t('statusClosed')}</SelectItem>
            <SelectItem value="CANCELLED">{t('statusCancelled')}</SelectItem>
          </SelectContent>
        </Select>
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
                onClick={() => router.push(`/crm/inquiries/${item.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground font-mono">{item.number}</span>
                    <InquiryStatusBadge status={item.status} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span>{formatDate(item.createdAt)}</span>
                    {item.order && <span>· {item.order.code}</span>}
                  </div>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Aktionen</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/crm/inquiries/${item.id}`)}>
                        <Eye className="mr-2 h-4 w-4" />
                        {t('view')}
                      </DropdownMenuItem>
                      {item.status !== 'CLOSED' && (
                        <DropdownMenuItem onClick={() => handleEdit(item as unknown as Record<string, unknown>)}>
                          <Edit className="mr-2 h-4 w-4" />
                          {t('edit')}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => setDeleteItem({ id: item.id, title: item.title })}
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
                  <TableHead>{t('number')}</TableHead>
                  <TableHead>{t('inquiryTitle')}</TableHead>
                  {!addressId && <TableHead>{t('address')}</TableHead>}
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('linkedOrder')}</TableHead>
                  <TableHead>{t('createdAt')}</TableHead>
                  <TableHead className="w-16">
                    <span className="sr-only">{t('actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => router.push(`/crm/inquiries/${item.id}`)}>
                    <TableCell className="font-mono whitespace-nowrap">
                      {item.number}
                    </TableCell>
                    <TableCell className="font-medium max-w-[300px] truncate">
                      {item.title}
                    </TableCell>
                    {!addressId && (
                      <TableCell>
                        {item.address?.company ?? '—'}
                      </TableCell>
                    )}
                    <TableCell>
                      <InquiryStatusBadge status={item.status} />
                    </TableCell>
                    <TableCell>
                      {item.order ? item.order.code : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(item.createdAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Aktionen</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/crm/inquiries/${item.id}`) }}>
                            <Eye className="mr-2 h-4 w-4" />
                            {t('view')}
                          </DropdownMenuItem>
                          {item.status !== 'CLOSED' && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(item as unknown as Record<string, unknown>) }}>
                              <Edit className="mr-2 h-4 w-4" />
                              {t('edit')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); setDeleteItem({ id: item.id, title: item.title }) }}
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
      <InquiryFormSheet
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false)
            setEditItem(null)
          }
        }}
        addressId={addressId}
        editItem={editItem}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteItem}
        onOpenChange={(open) => !open && setDeleteItem(null)}
        title={t('deleteTitle')}
        description={t('deleteDescription', { title: deleteItem?.title ?? '' })}
        confirmLabel={t('confirm')}
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  )
}
