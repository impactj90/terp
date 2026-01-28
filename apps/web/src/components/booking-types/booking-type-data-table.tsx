'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Lock,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import type { components } from '@/lib/api/types'

type BookingType = components['schemas']['BookingType']

interface BookingTypeDataTableProps {
  bookingTypes: BookingType[]
  isLoading: boolean
  onEdit: (type: BookingType) => void
  onDelete: (type: BookingType) => void
  onToggleActive?: (type: BookingType, isActive: boolean) => void
  togglingId?: string | null
}

const directionConfig = {
  in: { labelKey: 'directionIn', icon: ArrowDownLeft, className: 'text-emerald-600' },
  out: { labelKey: 'directionOut', icon: ArrowUpRight, className: 'text-rose-600' },
} as const

type DirectionKey = keyof typeof directionConfig

const getDirectionKey = (direction?: string | null): DirectionKey =>
  direction === 'out' ? 'out' : 'in'

export function BookingTypeDataTable({
  bookingTypes,
  isLoading,
  onEdit,
  onDelete,
  onToggleActive,
  togglingId,
}: BookingTypeDataTableProps) {
  const t = useTranslations('adminBookingTypes')

  if (isLoading) {
    return <BookingTypeDataTableSkeleton />
  }

  if (bookingTypes.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">{t('columnDirection')}</TableHead>
          <TableHead className="w-24">{t('columnCode')}</TableHead>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead className="w-24">{t('columnUsage')}</TableHead>
          <TableHead className="w-32">{t('columnStatus')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('actions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bookingTypes.map((type) => {
          const directionKey = getDirectionKey(type.direction)
          const direction = directionConfig[directionKey]
          const DirectionIcon = direction.icon
          const usageCount = (type as Record<string, unknown>).usage_count as number | undefined
          const isInUse = (usageCount ?? 0) > 0

          return (
            <TableRow key={type.id}>
              <TableCell>
                <div className="inline-flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                    <DirectionIcon className={`h-4 w-4 ${direction.className}`} />
                  </div>
                  <span className="text-sm">{t(direction.labelKey as Parameters<typeof t>[0])}</span>
                </div>
              </TableCell>
              <TableCell className="font-mono text-sm font-medium">
                {type.code}
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{type.name}</span>
                  {type.description && (
                    <span className="text-xs text-muted-foreground line-clamp-1">{type.description}</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {usageCount ?? 0}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {type.is_system && (
                    <Badge variant="outline" className="text-xs">
                      <Lock className="mr-1 h-3 w-3" />
                      {t('statusSystem')}
                    </Badge>
                  )}
                  {!type.is_active && (
                    <Badge variant="secondary" className="text-xs">
                      {t('statusInactive')}
                    </Badge>
                  )}
                  {type.is_active && !type.is_system && (
                    <Badge variant="default" className="text-xs">
                      {t('statusActive')}
                    </Badge>
                  )}
                  {onToggleActive && (
                    <Switch
                      checked={type.is_active}
                      onCheckedChange={(checked) => onToggleActive(type, checked)}
                      disabled={type.is_system || togglingId === type.id}
                    />
                  )}
                </div>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">{t('actions')}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {type.is_system ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem disabled>
                              <Edit className="mr-2 h-4 w-4" />
                              {t('edit')}
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('systemCannotModify')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <DropdownMenuItem onClick={() => onEdit(type)}>
                        <Edit className="mr-2 h-4 w-4" />
                        {t('edit')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {type.is_system ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem disabled>
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t('delete')}
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('systemCannotDelete')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : isInUse ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem disabled>
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t('delete')}
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('cannotDeleteInUse')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDelete(type)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('delete')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function BookingTypeDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-32"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-8 w-16" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-4 w-40" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
