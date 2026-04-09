'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { MoreHorizontal, Plus, RefreshCcw, Ban, Trash2, ArrowRightLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  useExtendDemoTenant,
  useExpireDemoTenantNow,
  useDeleteDemoTenant,
} from '@/hooks'
import type { AppRouter } from '@/trpc/routers/_app'
import type { inferRouterOutputs } from '@trpc/server'

type RouterOutput = inferRouterOutputs<AppRouter>
export type DemoTenantRow = NonNullable<RouterOutput['demoTenants']['list']>[number]

interface DemoTenantsTableProps {
  items: DemoTenantRow[]
  onConvert: (item: DemoTenantRow) => void
}

function daysBadgeVariant(
  daysRemaining: number,
): { className: string; label: 'expired' | 'danger' | 'warn' | 'ok' } {
  if (daysRemaining <= 0) {
    return {
      className: 'bg-red-900 text-red-50 border-transparent hover:bg-red-900',
      label: 'expired',
    }
  }
  if (daysRemaining < 3) {
    return {
      className: 'bg-red-500 text-white border-transparent hover:bg-red-500',
      label: 'danger',
    }
  }
  if (daysRemaining <= 7) {
    return {
      className: 'bg-yellow-500 text-yellow-950 border-transparent hover:bg-yellow-500',
      label: 'warn',
    }
  }
  return {
    className: 'bg-green-600 text-green-50 border-transparent hover:bg-green-600',
    label: 'ok',
  }
}

export function DemoTenantsTable({ items, onConvert }: DemoTenantsTableProps) {
  const t = useTranslations('adminTenants')
  const extend = useExtendDemoTenant()
  const expire = useExpireDemoTenantNow()
  const del = useDeleteDemoTenant()

  const [expireItem, setExpireItem] = React.useState<DemoTenantRow | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<DemoTenantRow | null>(null)

  const handleExtend = (item: DemoTenantRow, days: 7 | 14) => {
    extend.mutate(
      { tenantId: item.id, additionalDays: days },
      {
        onSuccess: () => {
          toast.success(t('demo.toast.extendSuccess', { days }))
        },
        onError: (err) => {
          toast.error(err.message || t('demo.toast.extendError'))
        },
      },
    )
  }

  const handleExpireConfirm = () => {
    if (!expireItem) return
    expire.mutate(
      { tenantId: expireItem.id },
      {
        onSuccess: () => {
          toast.success(t('demo.toast.expireSuccess'))
          setExpireItem(null)
        },
        onError: (err) => {
          toast.error(err.message || t('demo.toast.expireError'))
        },
      },
    )
  }

  const handleDeleteConfirm = () => {
    if (!deleteItem) return
    del.mutate(
      { tenantId: deleteItem.id },
      {
        onSuccess: () => {
          toast.success(t('demo.toast.deleteSuccess'))
          setDeleteItem(null)
        },
        onError: (err) => {
          toast.error(err.message || t('demo.toast.deleteError'))
        },
      },
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('demo.table.name')}</TableHead>
            <TableHead>{t('demo.table.template')}</TableHead>
            <TableHead>{t('demo.table.creator')}</TableHead>
            <TableHead>{t('demo.table.created')}</TableHead>
            <TableHead>{t('demo.table.daysRemaining')}</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const days = item.daysRemaining ?? 0
            const badge = daysBadgeVariant(days)
            const createdBy = item.demoCreatedBy
            const creatorName =
              (createdBy && (createdBy.displayName || createdBy.email)) ?? '—'
            const createdAt = item.createdAt
              ? new Date(item.createdAt).toLocaleDateString()
              : '—'
            const isExpired = days <= 0

            return (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{item.slug}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {item.demoTemplate ?? '—'}
                </TableCell>
                <TableCell className="text-sm">{creatorName}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {createdAt}
                </TableCell>
                <TableCell>
                  <Badge className={badge.className} data-label={badge.label}>
                    {isExpired
                      ? t('demo.daysRemaining.expired')
                      : t('demo.daysRemaining.days', { count: days })}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>{t('demo.actions.label')}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Plus className="mr-2 h-4 w-4" />
                          {t('demo.actions.extend')}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem onClick={() => handleExtend(item, 7)}>
                            <RefreshCcw className="mr-2 h-4 w-4" />
                            {t('demo.actions.extend7')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExtend(item, 14)}>
                            <RefreshCcw className="mr-2 h-4 w-4" />
                            {t('demo.actions.extend14')}
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuItem onClick={() => onConvert(item)}>
                        <ArrowRightLeft className="mr-2 h-4 w-4" />
                        {t('demo.actions.convert')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setExpireItem(item)}>
                        <Ban className="mr-2 h-4 w-4" />
                        {t('demo.actions.expireNow')}
                      </DropdownMenuItem>
                      {isExpired && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteItem(item)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('demo.actions.delete')}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={!!expireItem}
        onOpenChange={(open) => {
          if (!open) setExpireItem(null)
        }}
        title={t('demo.expireNowConfirm.title')}
        description={t('demo.expireNowConfirm.description', {
          name: expireItem?.name ?? '',
        })}
        confirmLabel={t('demo.expireNowConfirm.confirm')}
        cancelLabel={t('demo.expireNowConfirm.cancel')}
        variant="destructive"
        isLoading={expire.isPending}
        onConfirm={handleExpireConfirm}
      />

      <ConfirmDialog
        open={!!deleteItem}
        onOpenChange={(open) => {
          if (!open) setDeleteItem(null)
        }}
        title={t('demo.deleteConfirm.title')}
        description={t('demo.deleteConfirm.description', {
          name: deleteItem?.name ?? '',
        })}
        confirmLabel={t('demo.deleteConfirm.confirm')}
        cancelLabel={t('demo.deleteConfirm.cancel')}
        variant="destructive"
        isLoading={del.isPending}
        onConfirm={handleDeleteConfirm}
      />
    </>
  )
}
