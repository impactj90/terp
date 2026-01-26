'use client'

import * as React from 'react'
import {
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  CalendarOff,
  Check,
  X,
  Lock,
} from 'lucide-react'
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

type AbsenceType = components['schemas']['AbsenceType']

interface AbsenceTypeDataTableProps {
  absenceTypes: AbsenceType[]
  isLoading: boolean
  onView: (type: AbsenceType) => void
  onEdit: (type: AbsenceType) => void
  onDelete: (type: AbsenceType) => void
}

const categoryLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  vacation: { label: 'Vacation', variant: 'default' },
  sick: { label: 'Sick', variant: 'destructive' },
  personal: { label: 'Personal', variant: 'secondary' },
  unpaid: { label: 'Unpaid', variant: 'outline' },
  holiday: { label: 'Holiday', variant: 'default' },
  other: { label: 'Other', variant: 'outline' },
}

function BooleanIndicator({ value, label }: { value: boolean | undefined; label: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-center">
            {value ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <X className="h-4 w-4 text-muted-foreground/50" />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}: {value ? 'Yes' : 'No'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function AbsenceTypeDataTable({
  absenceTypes,
  isLoading,
  onView,
  onEdit,
  onDelete,
}: AbsenceTypeDataTableProps) {
  if (isLoading) {
    return <AbsenceTypeDataTableSkeleton />
  }

  if (absenceTypes.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12" />
          <TableHead className="w-20">Code</TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="w-24">Category</TableHead>
          <TableHead className="w-20 text-center">Paid</TableHead>
          <TableHead className="w-20 text-center">Vacation</TableHead>
          <TableHead className="w-20 text-center">Approval</TableHead>
          <TableHead className="w-24">Status</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {absenceTypes.map((type) => {
          const categoryKey = type.category || 'other'
          const category = categoryLabels[categoryKey] ?? { label: 'Other', variant: 'outline' as const }

          return (
            <TableRow
              key={type.id}
              className="cursor-pointer"
              onClick={() => onView(type)}
            >
              <TableCell>
                <div
                  className="h-6 w-6 rounded-md border"
                  style={{ backgroundColor: type.color || '#808080' }}
                  title={type.color || '#808080'}
                />
              </TableCell>
              <TableCell className="font-mono text-sm font-medium">
                {type.code}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                    <CalendarOff className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="font-medium">{type.name}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={category.variant}>{category.label}</Badge>
              </TableCell>
              <TableCell className="text-center">
                <BooleanIndicator value={type.is_paid} label="Paid" />
              </TableCell>
              <TableCell className="text-center">
                <BooleanIndicator value={type.affects_vacation_balance} label="Deducts Vacation" />
              </TableCell>
              <TableCell className="text-center">
                <BooleanIndicator value={type.requires_approval} label="Requires Approval" />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {type.is_system && (
                    <Badge variant="outline" className="text-xs">
                      <Lock className="mr-1 h-3 w-3" />
                      System
                    </Badge>
                  )}
                  {!type.is_active && (
                    <Badge variant="secondary" className="text-xs">
                      Inactive
                    </Badge>
                  )}
                  {type.is_active && !type.is_system && (
                    <Badge variant="default" className="text-xs">
                      Active
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onView(type)}>
                      <Eye className="mr-2 h-4 w-4" />
                      View Details
                    </DropdownMenuItem>
                    {type.is_system ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem disabled>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>System types cannot be modified</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <DropdownMenuItem onClick={() => onEdit(type)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {type.is_system ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem disabled>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>System types cannot be deleted</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDelete(type)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
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

function AbsenceTypeDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12" />
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-6 w-6 rounded-md" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-4 w-32" />
              </div>
            </TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
            <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
            <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
            <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
