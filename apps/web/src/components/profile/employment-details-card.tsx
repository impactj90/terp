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
import { useTranslations, useLocale } from 'next-intl'
import type { components } from '@/lib/api/types'

type Employee = components['schemas']['Employee']

interface EmploymentDetailsCardProps {
  employee: Employee
}

/**
 * Format a date string to a readable format.
 */
function formatDate(dateStr: string | null | undefined, locale: string): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString(locale, {
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
  const t = useTranslations('profile')
  const locale = useLocale()

  const isActive = !employee.exit_date || new Date(employee.exit_date) > new Date()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('employmentDetails')}</CardTitle>
        <CardDescription>{t('employmentDetailsSubtitle')}</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Department */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">{t('department')}</Label>
            <p className="text-sm font-medium">
              {employee.department?.name || (
                <span className="text-muted-foreground">{t('notAssigned')}</span>
              )}
            </p>
          </div>

          {/* Cost Center */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">{t('costCenter')}</Label>
            <p className="text-sm font-medium">
              {employee.cost_center?.name || (
                <span className="text-muted-foreground">{t('notAssigned')}</span>
              )}
            </p>
          </div>

          {/* Employment Type */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">{t('employmentType')}</Label>
            <p className="text-sm font-medium">
              {employee.employment_type?.name || (
                <span className="text-muted-foreground">{t('notSpecified')}</span>
              )}
            </p>
          </div>

          {/* Status */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">{t('statusLabel')}</Label>
            <div>
              <Badge variant={isActive ? 'default' : 'secondary'}>
                {isActive ? t('statusActive') : t('statusInactive')}
              </Badge>
            </div>
          </div>

          {/* Entry Date */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">{t('entryDate')}</Label>
            <p className="text-sm font-medium">{formatDate(employee.entry_date, locale)}</p>
          </div>

          {/* Exit Date */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">{t('exitDate')}</Label>
            <p className="text-sm font-medium">
              {employee.exit_date ? (
                formatDate(employee.exit_date, locale)
              ) : (
                <span className="text-muted-foreground">{t('notSet')}</span>
              )}
            </p>
          </div>

          {/* Weekly Hours */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">{t('weeklyHours')}</Label>
            <p className="text-sm font-medium">
              {employee.weekly_hours !== undefined && employee.weekly_hours !== null ? (
                `${employee.weekly_hours} ${t('hours')}`
              ) : (
                <span className="text-muted-foreground">{t('notSpecified')}</span>
              )}
            </p>
          </div>

          {/* Annual Vacation */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">{t('annualVacation')}</Label>
            <p className="text-sm font-medium">
              {employee.vacation_days_per_year !== undefined &&
              employee.vacation_days_per_year !== null ? (
                `${employee.vacation_days_per_year} ${t('days')}`
              ) : (
                <span className="text-muted-foreground">{t('notSpecified')}</span>
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
