'use client'

import * as React from 'react'
import { MoreHorizontal, Eye, Edit, Building2, Trash2 } from 'lucide-react'
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
import { Skeleton } from '@/components/ui/skeleton'
import type { components } from '@/lib/api/types'

type Department = components['schemas']['Department']

interface DepartmentDataTableProps {
  departments: Department[]
  isLoading: boolean
  onView: (department: Department) => void
  onEdit: (department: Department) => void
  onDelete: (department: Department) => void
}

export function DepartmentDataTable({
  departments,
  isLoading,
  onView,
  onEdit,
  onDelete,
}: DepartmentDataTableProps) {
  if (isLoading) {
    return <DepartmentDataTableSkeleton />
  }

  if (departments.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">Code</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Parent</TableHead>
          <TableHead className="w-24">Status</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {departments.map((department) => (
          <TableRow
            key={department.id}
            className="cursor-pointer"
            onClick={() => onView(department)}
          >
            <TableCell className="font-mono text-sm">{department.code}</TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                  <Building2 className="h-4 w-4" />
                </div>
                <span className="font-medium">{department.name}</span>
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {department.parent?.name || '-'}
            </TableCell>
            <TableCell>
              <Badge variant={department.is_active ? 'default' : 'secondary'}>
                {department.is_active ? 'Active' : 'Inactive'}
              </Badge>
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
                  <DropdownMenuItem onClick={() => onView(department)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(department)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(department)}
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

function DepartmentDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-4 w-32" />
              </div>
            </TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
