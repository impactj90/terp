'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Check, Minus, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useEmployees,
  useVacationEntitlementPreview,
  useVacationCarryoverPreview,
} from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
type Employee = NonNullable<ReturnType<typeof useEmployees>['data']>['items'][number]

function DetailRow({ label, value, bold = false }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className="flex justify-between py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm text-right ${bold ? 'font-bold' : 'font-medium'}`}>{value ?? '-'}</span>
    </div>
  )
}

const formatDecimal = (val: number | undefined | null) => {
  if (val == null) return '-'
  return val.toFixed(1)
}

export function VacationPreviewsTab() {
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['absence_types.manage'])

  const { data: employeesData } = useEmployees({ pageSize: 200, isActive: true, enabled: !authLoading && !permLoading && canAccess })
  const employees = employeesData?.items ?? []

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <EntitlementPreviewCard employees={employees} />
      <CarryoverPreviewCard employees={employees} />
    </div>
  )
}

// ==================== Entitlement Preview ====================

function EntitlementPreviewCard({ employees }: { employees: Employee[] }) {
  const t = useTranslations('adminVacationConfig')
  const currentYear = new Date().getFullYear()
  const [employeeId, setEmployeeId] = React.useState('')
  const [year, setYear] = React.useState(String(currentYear))
  const [error, setError] = React.useState<string | null>(null)

  const entitlementMutation = useVacationEntitlementPreview()

  const handleCalculate = async () => {
    if (!employeeId) return
    setError(null)
    try {
      await entitlementMutation.mutateAsync({
        employeeId: employeeId,
        year: parseInt(year, 10),
      })
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('preview.errorTitle'))
    }
  }

  const result = entitlementMutation.data

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('preview.entitlementTitle')}</CardTitle>
        <CardDescription>{t('preview.entitlementDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Inputs */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t('preview.fieldEmployee')}</Label>
            <Select
              value={employeeId || '__none__'}
              onValueChange={(value) => setEmployeeId(value === '__none__' ? '' : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('preview.selectEmployee')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('preview.selectEmployee')}</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.personnelNumber} - {emp.firstName} {emp.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('preview.fieldYear')}</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              min={2000}
              max={2100}
            />
          </div>

          <Button
            onClick={handleCalculate}
            disabled={!employeeId || entitlementMutation.isPending}
            className="w-full"
          >
            {entitlementMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {entitlementMutation.isPending ? t('preview.calculating') : t('preview.calculate')}
          </Button>
        </div>

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4 pt-2">
            {/* Calculation Details */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">{t('preview.sectionDetails')}</h4>
              <div className="rounded-lg border p-4">
                <DetailRow label={t('preview.calculationGroup')} value={result.calcGroupName ?? '-'} />
                <DetailRow
                  label={t('preview.basis')}
                  value={
                    result.basis === 'calendar_year'
                      ? t('calcGroup.basisCalendarYear')
                      : result.basis === 'entry_date'
                        ? t('calcGroup.basisEntryDate')
                        : '-'
                  }
                />
                <DetailRow label={t('preview.monthsEmployed')} value={result.monthsEmployed} />
                <DetailRow label={t('preview.ageAtReference')} value={result.ageAtReference} />
                <DetailRow label={t('preview.tenureYears')} value={result.tenureYears} />
                <DetailRow label={t('preview.weeklyHours')} value={formatDecimal(result.weeklyHours)} />
                <DetailRow label={t('preview.standardWeeklyHours')} value={formatDecimal(result.standardWeeklyHours)} />
                <DetailRow label={t('preview.partTimeFactor')} value={formatDecimal(result.partTimeFactor)} />
              </div>
            </div>

            {/* Entitlement Breakdown */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">{t('preview.sectionBreakdown')}</h4>
              <div className="rounded-lg border p-4">
                <DetailRow label={t('preview.baseEntitlement')} value={formatDecimal(result.baseEntitlement)} />
                <DetailRow label={t('preview.proRatedEntitlement')} value={formatDecimal(result.proRatedEntitlement)} />
                <DetailRow label={t('preview.partTimeAdjustment')} value={formatDecimal(result.partTimeAdjustment)} />
                <DetailRow label={t('preview.ageBonus')} value={result.ageBonus ? `+${formatDecimal(result.ageBonus)}` : '0.0'} />
                <DetailRow label={t('preview.tenureBonus')} value={result.tenureBonus ? `+${formatDecimal(result.tenureBonus)}` : '0.0'} />
                <DetailRow label={t('preview.disabilityBonus')} value={result.disabilityBonus ? `+${formatDecimal(result.disabilityBonus)}` : '0.0'} />
                <div className="border-t mt-2 pt-2">
                  <DetailRow label={t('preview.totalEntitlement')} value={formatDecimal(result.totalEntitlement)} bold />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* No results placeholder */}
        {!result && !error && !entitlementMutation.isPending && (
          <p className="text-sm text-muted-foreground text-center py-4">{t('preview.noResults')}</p>
        )}
      </CardContent>
    </Card>
  )
}

// ==================== Carryover Preview ====================

function CarryoverPreviewCard({ employees }: { employees: Employee[] }) {
  const t = useTranslations('adminVacationConfig')
  const currentYear = new Date().getFullYear()
  const [employeeId, setEmployeeId] = React.useState('')
  const [year, setYear] = React.useState(String(currentYear))
  const [error, setError] = React.useState<string | null>(null)

  const carryoverMutation = useVacationCarryoverPreview()

  const handleCalculate = async () => {
    if (!employeeId) return
    setError(null)
    try {
      await carryoverMutation.mutateAsync({
        employeeId: employeeId,
        year: parseInt(year, 10),
      })
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('preview.errorTitle'))
    }
  }

  const result = carryoverMutation.data

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('preview.carryoverTitle')}</CardTitle>
        <CardDescription>{t('preview.carryoverDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Inputs */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t('preview.fieldEmployee')}</Label>
            <Select
              value={employeeId || '__none__'}
              onValueChange={(value) => setEmployeeId(value === '__none__' ? '' : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('preview.selectEmployee')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('preview.selectEmployee')}</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.personnelNumber} - {emp.firstName} {emp.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('preview.fieldYear')}</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              min={2000}
              max={2100}
            />
          </div>

          <Button
            onClick={handleCalculate}
            disabled={!employeeId || carryoverMutation.isPending}
            className="w-full"
          >
            {carryoverMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {carryoverMutation.isPending ? t('preview.calculating') : t('preview.calculate')}
          </Button>
        </div>

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4 pt-2">
            {/* Exception notice */}
            {result.hasException && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{t('preview.hasException')}</AlertDescription>
              </Alert>
            )}

            {/* Carryover Summary */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">{t('preview.sectionSummary')}</h4>
              <div className="rounded-lg border p-4">
                <DetailRow label={t('preview.availableDays')} value={formatDecimal(result.availableDays)} />
                <DetailRow label={t('preview.cappedCarryover')} value={formatDecimal(result.cappedCarryover)} bold />
                <DetailRow
                  label={t('preview.forfeitedDays')}
                  value={
                    <span className={(result.forfeitedDays ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : ''}>
                      {formatDecimal(result.forfeitedDays)}
                    </span>
                  }
                />
              </div>
            </div>

            {/* Rules Applied */}
            {result.rulesApplied && result.rulesApplied.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('preview.sectionRules')}</h4>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('preview.ruleName')}</TableHead>
                        <TableHead>{t('preview.ruleType')}</TableHead>
                        <TableHead>{t('preview.capValue')}</TableHead>
                        <TableHead>{t('preview.applied')}</TableHead>
                        <TableHead>{t('preview.exception')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.rulesApplied.map((rule, idx) => (
                        <TableRow key={rule.ruleId ?? idx}>
                          <TableCell className="text-sm">{rule.ruleName ?? '-'}</TableCell>
                          <TableCell>
                            {rule.ruleType && (
                              <Badge
                                variant={rule.ruleType === 'year_end' ? 'orange' : 'cyan'}
                              >
                                {rule.ruleType === 'year_end' ? t('cappingRule.ruleTypeYearEnd') : t('cappingRule.ruleTypeMidYear')}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{rule.capValue ?? '-'}</TableCell>
                          <TableCell>
                            {rule.applied ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Minus className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell>
                            {rule.exceptionActive ? (
                              <Badge variant="yellow">
                                {t('preview.exceptionActive')}
                              </Badge>
                            ) : (
                              <Minus className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* No results placeholder */}
        {!result && !error && !carryoverMutation.isPending && (
          <p className="text-sm text-muted-foreground text-center py-4">{t('preview.noResults')}</p>
        )}
      </CardContent>
    </Card>
  )
}
