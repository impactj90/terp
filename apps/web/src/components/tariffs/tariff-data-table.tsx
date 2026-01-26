'use client'

import * as React from 'react'
import { MoreHorizontal, Eye, Edit, Trash2, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, parseISODate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Tariff = components['schemas']['Tariff']

interface TariffDataTableProps {
  tariffs: Tariff[]
  isLoading: boolean
  onView: (tariff: Tariff) => void
  onEdit: (tariff: Tariff) => void
  onDelete: (tariff: Tariff) => void
  onCopy: (tariff: Tariff) => void
}

export function TariffDataTable({
  tariffs,
  isLoading,
  onView,
  onEdit,
  onDelete,
  onCopy,
}: TariffDataTableProps) {
  if (isLoading) {
    return <TariffDataTableSkeleton />
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">Code</TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="w-40">Week Plan</TableHead>
          <TableHead className="w-28">Valid From</TableHead>
          <TableHead className="w-28">Valid To</TableHead>
          <TableHead className="w-20">Breaks</TableHead>
          <TableHead className="w-20">Status</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tariffs.map((tariff) => (
          <TableRow
            key={tariff.id}
            className="cursor-pointer"
            onClick={() => onView(tariff)}
          >
            <TableCell className="font-mono text-sm">{tariff.code}</TableCell>
            <TableCell className="font-medium">{tariff.name}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {tariff.week_plan ? (
                <span>{tariff.week_plan.code} - {tariff.week_plan.name}</span>
              ) : (
                <span className="text-muted-foreground/60">-</span>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {tariff.valid_from ? formatDate(parseISODate(tariff.valid_from)) : '-'}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {tariff.valid_to ? formatDate(parseISODate(tariff.valid_to)) : '-'}
            </TableCell>
            <TableCell>{tariff.breaks?.length ?? 0}</TableCell>
            <TableCell>
              <Badge variant={tariff.is_active ? 'default' : 'secondary'}>
                {tariff.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(tariff)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(tariff)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onCopy(tariff)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(tariff)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function TariffDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-40"><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-8" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell><Skeleton className="h-4 w-8" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
