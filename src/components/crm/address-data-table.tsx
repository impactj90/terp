'use client'

import { useTranslations } from 'next-intl'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { MoreHorizontal, Eye, Edit, Trash2, RotateCcw, Building2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface CrmAddress {
  id: string
  number: string
  company: string
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH'
  city: string | null
  phone: string | null
  email: string | null
  isActive: boolean
  parentAddressId?: string | null
  _count?: { childAddresses?: number }
}

interface AddressDataTableProps {
  addresses: CrmAddress[]
  isLoading: boolean
  selectedIds: Set<string>
  onSelectIds: (ids: Set<string>) => void
  onView: (address: CrmAddress) => void
  onEdit: (address: CrmAddress) => void
  onDelete: (address: CrmAddress) => void
  onRestore?: (address: CrmAddress) => void
}

function getTypeBadgeVariant(type: string) {
  switch (type) {
    case 'CUSTOMER':
      return 'default'
    case 'SUPPLIER':
      return 'secondary'
    case 'BOTH':
      return 'outline'
    default:
      return 'default'
  }
}

export function AddressDataTable({
  addresses,
  isLoading,
  selectedIds,
  onSelectIds,
  onView,
  onEdit,
  onDelete,
  onRestore,
}: AddressDataTableProps) {
  const t = useTranslations('crmAddresses')

  if (isLoading) return <AddressDataTableSkeleton />
  if (addresses.length === 0) return null

  const allSelected = addresses.every((a) => selectedIds.has(a.id))
  const someSelected = addresses.some((a) => selectedIds.has(a.id))

  const toggleAll = () => {
    if (allSelected) {
      onSelectIds(new Set())
    } else {
      onSelectIds(new Set(addresses.map((a) => a.id)))
    }
  }

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    onSelectIds(next)
  }

  return (
    <>
      {/* Mobile: card list */}
      <div className="divide-y sm:hidden">
        {addresses.map((address) => (
          <div
            key={address.id}
            className="flex items-center gap-3 p-3 active:bg-muted/50 cursor-pointer"
            onClick={() => onView(address)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium overflow-hidden text-ellipsis whitespace-nowrap" style={{ maxWidth: 'calc(100vw - 6rem)' }}>{address.company}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant={getTypeBadgeVariant(address.type)} className="shrink-0 text-[10px] px-1.5 py-0">
                  {address.type === 'CUSTOMER'
                    ? t('typeCustomer')
                    : address.type === 'SUPPLIER'
                      ? t('typeSupplier')
                      : t('typeBoth')}
                </Badge>
                {address.city && <span className="text-xs text-muted-foreground">{address.city}</span>}
                <span className="text-xs text-muted-foreground font-mono">{address.number}</span>
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
                  <DropdownMenuItem onClick={() => onView(address)}>
                    <Eye className="mr-2 h-4 w-4" />
                    {t('viewDetails')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(address)}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t('edit')}
                  </DropdownMenuItem>
                  {address.isActive ? (
                    <DropdownMenuItem onClick={() => onDelete(address)} className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('deactivate')}
                    </DropdownMenuItem>
                  ) : onRestore ? (
                    <DropdownMenuItem onClick={() => onRestore(address)}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {t('restore')}
                    </DropdownMenuItem>
                  ) : null}
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
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={toggleAll}
                  aria-label={t('selectAll')}
                />
              </TableHead>
              <TableHead className="w-28">{t('columnNumber')}</TableHead>
              <TableHead>{t('columnCompany')}</TableHead>
              <TableHead className="w-32">{t('columnType')}</TableHead>
              <TableHead className="w-28">{t('columnCity')}</TableHead>
              <TableHead className="w-28">{t('columnPhone')}</TableHead>
              <TableHead className="w-40">{t('columnEmail')}</TableHead>
              <TableHead className="w-24">{t('columnStatus')}</TableHead>
              <TableHead className="w-16">
                <span className="sr-only">{t('columnActions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {addresses.map((address) => (
              <TableRow
                key={address.id}
                className="cursor-pointer"
                onClick={() => onView(address)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(address.id)}
                    onCheckedChange={() => toggleOne(address.id)}
                  />
                </TableCell>
                <TableCell className="font-mono text-sm">{address.number}</TableCell>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-1.5">
                    {address.company}
                    {(address._count?.childAddresses ?? 0) > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          {t('groupIndicatorTooltip', { count: address._count!.childAddresses! })}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={getTypeBadgeVariant(address.type)}>
                    {address.type === 'CUSTOMER'
                      ? t('typeCustomer')
                      : address.type === 'SUPPLIER'
                        ? t('typeSupplier')
                        : t('typeBoth')}
                  </Badge>
                </TableCell>
                <TableCell>{address.city || '—'}</TableCell>
                <TableCell>{address.phone || '—'}</TableCell>
                <TableCell>{address.email || '—'}</TableCell>
                <TableCell>
                  <Badge variant={address.isActive ? 'default' : 'secondary'}>
                    {address.isActive ? t('active') : t('inactive')}
                  </Badge>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Aktionen</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onView(address)}>
                        <Eye className="mr-2 h-4 w-4" />
                        {t('viewDetails')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit(address)}>
                        <Edit className="mr-2 h-4 w-4" />
                        {t('edit')}
                      </DropdownMenuItem>
                      {address.isActive ? (
                        <DropdownMenuItem
                          onClick={() => onDelete(address)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('deactivate')}
                        </DropdownMenuItem>
                      ) : onRestore ? (
                        <DropdownMenuItem onClick={() => onRestore(address)}>
                          <RotateCcw className="mr-2 h-4 w-4" />
                          {t('restore')}
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

function AddressDataTableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}
