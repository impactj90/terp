'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { Edit, Trash2, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useDepartment } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Department = components['schemas']['Department']

interface DepartmentDetailSheetProps {
  departmentId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (department: Department) => void
  onDelete: (department: Department) => void
}

interface DetailRowProps {
  label: string
  value: React.ReactNode
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex justify-between py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '-'}</span>
    </div>
  )
}

export function DepartmentDetailSheet({
  departmentId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: DepartmentDetailSheetProps) {
  const { data: department, isLoading } = useDepartment(departmentId || '', open && !!departmentId)

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy HH:mm')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>Department Details</SheetTitle>
          <SheetDescription>View department information and hierarchy</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 space-y-4 py-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : department ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Header with icon and status */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <Building2 className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{department.name}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{department.code}</p>
                </div>
                <Badge variant={department.is_active ? 'default' : 'secondary'}>
                  {department.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              {/* Basic Information */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Basic Information</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label="Name" value={department.name} />
                  <DetailRow label="Code" value={department.code} />
                  <DetailRow label="Description" value={department.description} />
                </div>
              </div>

              {/* Hierarchy */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Hierarchy</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow
                    label="Parent Department"
                    value={department.parent?.name || 'None (Root Level)'}
                  />
                  <DetailRow
                    label="Child Departments"
                    value={
                      department.children && department.children.length > 0
                        ? department.children.map((c) => c.name).join(', ')
                        : 'None'
                    }
                  />
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Timestamps</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label="Created" value={formatDate(department.created_at)} />
                  <DetailRow label="Last Updated" value={formatDate(department.updated_at)} />
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Close
          </Button>
          {department && (
            <>
              <Button variant="outline" onClick={() => onEdit(department)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="destructive"
                onClick={() => onDelete(department)}
                disabled={department.children && department.children.length > 0}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
