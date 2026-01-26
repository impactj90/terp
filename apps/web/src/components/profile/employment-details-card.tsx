'use client'

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import type { components } from '@/lib/api/types'

type Employee = components['schemas']['Employee']

interface EmploymentDetailsCardProps {
  employee: Employee
}

/**
 * Format a date string to a readable format.
 */
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

/**
 * Employment details card showing read-only employment information.
 */
export function EmploymentDetailsCard({ employee }: EmploymentDetailsCardProps) {
  const isActive = !employee.exit_date || new Date(employee.exit_date) > new Date()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employment Details</CardTitle>
        <CardDescription>Your employment information (read-only)</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Department */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">Department</Label>
            <p className="text-sm font-medium">
              {employee.department?.name || (
                <span className="text-muted-foreground">Not assigned</span>
              )}
            </p>
          </div>

          {/* Cost Center */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">Cost Center</Label>
            <p className="text-sm font-medium">
              {employee.cost_center?.name || (
                <span className="text-muted-foreground">Not assigned</span>
              )}
            </p>
          </div>

          {/* Employment Type */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">Employment Type</Label>
            <p className="text-sm font-medium">
              {employee.employment_type?.name || (
                <span className="text-muted-foreground">Not specified</span>
              )}
            </p>
          </div>

          {/* Status */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">Status</Label>
            <div>
              <Badge variant={isActive ? 'default' : 'secondary'}>
                {isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>

          {/* Entry Date */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">Entry Date</Label>
            <p className="text-sm font-medium">{formatDate(employee.entry_date)}</p>
          </div>

          {/* Exit Date */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">Exit Date</Label>
            <p className="text-sm font-medium">
              {employee.exit_date ? (
                formatDate(employee.exit_date)
              ) : (
                <span className="text-muted-foreground">Not set</span>
              )}
            </p>
          </div>

          {/* Weekly Hours */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">Weekly Hours</Label>
            <p className="text-sm font-medium">
              {employee.weekly_hours !== undefined && employee.weekly_hours !== null ? (
                `${employee.weekly_hours} hours`
              ) : (
                <span className="text-muted-foreground">Not specified</span>
              )}
            </p>
          </div>

          {/* Annual Vacation */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">Annual Vacation</Label>
            <p className="text-sm font-medium">
              {employee.vacation_days_per_year !== undefined &&
              employee.vacation_days_per_year !== null ? (
                `${employee.vacation_days_per_year} days`
              ) : (
                <span className="text-muted-foreground">Not specified</span>
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
