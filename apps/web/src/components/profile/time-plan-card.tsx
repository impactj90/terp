'use client'

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, Construction } from 'lucide-react'

interface TimePlanCardProps {
  employeeId: string
}

/**
 * Time plan card - placeholder for future implementation.
 * Will show assigned time plans and schedules when the API is ready.
 */
export function TimePlanCard({ employeeId: _employeeId }: TimePlanCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Time Plan
          <Badge variant="secondary" className="text-xs">
            Coming Soon
          </Badge>
        </CardTitle>
        <CardDescription>Your assigned work schedule</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="relative">
            <div className="rounded-full bg-muted p-3">
              <Clock className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="absolute -bottom-1 -right-1 rounded-full bg-amber-100 p-1 dark:bg-amber-900">
              <Construction className="h-3 w-3 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <p className="mt-3 text-sm font-medium">Time Plan Feature</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This feature is currently under development.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            You will be able to view your assigned time plans and work schedules here.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
