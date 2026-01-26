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
import { cn } from '@/lib/utils'
import type { components } from '@/lib/api/types'

type WeekPlan = components['schemas']['WeekPlan']
type DayPlanSummary = components['schemas']['DayPlanSummary']

interface WeekPlanDataTableProps {
  weekPlans: WeekPlan[]
  isLoading: boolean
  onView: (weekPlan: WeekPlan) => void
  onEdit: (weekPlan: WeekPlan) => void
  onDelete: (weekPlan: WeekPlan) => void
  onCopy: (weekPlan: WeekPlan) => void
}

// Helper function to count work days
function countWorkDays(weekPlan: WeekPlan): number {
  const days = [
    weekPlan.monday_day_plan_id,
    weekPlan.tuesday_day_plan_id,
    weekPlan.wednesday_day_plan_id,
    weekPlan.thursday_day_plan_id,
    weekPlan.friday_day_plan_id,
    weekPlan.saturday_day_plan_id,
    weekPlan.sunday_day_plan_id,
  ]
  return days.filter(Boolean).length
}

// Day plan cell component
function DayPlanCell({
  dayPlan,
  isWeekend,
}: {
  dayPlan: DayPlanSummary | null | undefined
  isWeekend: boolean
}) {
  if (!dayPlan) {
    return (
      <span className={cn('text-muted-foreground text-xs', isWeekend && 'opacity-50')}>
        -
      </span>
    )
  }
  return (
    <Badge
      variant="outline"
      className={cn('text-xs truncate max-w-full', isWeekend && 'opacity-75')}
      title={`${dayPlan.code}: ${dayPlan.name}`}
    >
      {dayPlan.code}
    </Badge>
  )
}

export function WeekPlanDataTable({
  weekPlans,
  isLoading,
  onView,
  onEdit,
  onDelete,
  onCopy,
}: WeekPlanDataTableProps) {
  if (isLoading) {
    return <WeekPlanDataTableSkeleton />
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">Code</TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="w-16 text-center">Mon</TableHead>
          <TableHead className="w-16 text-center">Tue</TableHead>
          <TableHead className="w-16 text-center">Wed</TableHead>
          <TableHead className="w-16 text-center">Thu</TableHead>
          <TableHead className="w-16 text-center">Fri</TableHead>
          <TableHead className="w-16 text-center text-muted-foreground">Sat</TableHead>
          <TableHead className="w-16 text-center text-muted-foreground">Sun</TableHead>
          <TableHead className="w-20 text-center">Days</TableHead>
          <TableHead className="w-20">Status</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {weekPlans.map((weekPlan) => (
          <TableRow
            key={weekPlan.id}
            className="cursor-pointer"
            onClick={() => onView(weekPlan)}
          >
            <TableCell className="font-mono text-sm">{weekPlan.code}</TableCell>
            <TableCell className="font-medium">{weekPlan.name}</TableCell>
            <TableCell className="text-center">
              <DayPlanCell dayPlan={weekPlan.monday_day_plan} isWeekend={false} />
            </TableCell>
            <TableCell className="text-center">
              <DayPlanCell dayPlan={weekPlan.tuesday_day_plan} isWeekend={false} />
            </TableCell>
            <TableCell className="text-center">
              <DayPlanCell dayPlan={weekPlan.wednesday_day_plan} isWeekend={false} />
            </TableCell>
            <TableCell className="text-center">
              <DayPlanCell dayPlan={weekPlan.thursday_day_plan} isWeekend={false} />
            </TableCell>
            <TableCell className="text-center">
              <DayPlanCell dayPlan={weekPlan.friday_day_plan} isWeekend={false} />
            </TableCell>
            <TableCell className="text-center">
              <DayPlanCell dayPlan={weekPlan.saturday_day_plan} isWeekend={true} />
            </TableCell>
            <TableCell className="text-center">
              <DayPlanCell dayPlan={weekPlan.sunday_day_plan} isWeekend={true} />
            </TableCell>
            <TableCell className="text-center text-sm text-muted-foreground">
              {countWorkDays(weekPlan)}/7
            </TableCell>
            <TableCell>
              <Badge variant={weekPlan.is_active ? 'default' : 'secondary'}>
                {weekPlan.is_active ? 'Active' : 'Inactive'}
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
                  <DropdownMenuItem onClick={() => onView(weekPlan)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(weekPlan)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onCopy(weekPlan)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(weekPlan)}
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

function WeekPlanDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">
            <Skeleton className="h-4 w-12" />
          </TableHead>
          <TableHead>
            <Skeleton className="h-4 w-16" />
          </TableHead>
          <TableHead className="w-16">
            <Skeleton className="h-4 w-8" />
          </TableHead>
          <TableHead className="w-16">
            <Skeleton className="h-4 w-8" />
          </TableHead>
          <TableHead className="w-16">
            <Skeleton className="h-4 w-8" />
          </TableHead>
          <TableHead className="w-16">
            <Skeleton className="h-4 w-8" />
          </TableHead>
          <TableHead className="w-16">
            <Skeleton className="h-4 w-8" />
          </TableHead>
          <TableHead className="w-16">
            <Skeleton className="h-4 w-8" />
          </TableHead>
          <TableHead className="w-16">
            <Skeleton className="h-4 w-8" />
          </TableHead>
          <TableHead className="w-20">
            <Skeleton className="h-4 w-8" />
          </TableHead>
          <TableHead className="w-20">
            <Skeleton className="h-4 w-12" />
          </TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell>
              <Skeleton className="h-4 w-16" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-32" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-12 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-12 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-12 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-12 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-12 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-12 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-12 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-8" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-16 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-8 w-8" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
