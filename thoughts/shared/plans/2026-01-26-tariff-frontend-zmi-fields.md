# Tariff Frontend ZMI Fields Implementation Plan

## Overview

Update the Next.js frontend (apps/web) to support all new ZMI tariff fields and rhythm features added to the backend. This includes vacation settings, target hours, flextime/monthly evaluation settings, and rhythm configuration (weekly, rolling_weekly, x_days).

## Current State Analysis

### Backend (Complete)
All ZMI fields and rhythm features have been implemented:
- 12 ZMI fields (vacation, target hours, flextime)
- Rhythm types: weekly, rolling_weekly, x_days
- tariff_week_plans and tariff_day_plans tables
- Employee tariff_id field

### Frontend (Needs Update)
Current tariff form only has:
- Basic fields (code, name, description)
- Single week plan selector
- Validity dates (valid_from, valid_to)
- Active status

**Missing:**
- All ZMI fields
- Rhythm type selection
- Conditional UI for rolling_weekly (multi week plan selector)
- Conditional UI for x_days (cycle days + day plan grid)

### Key Discoveries
- API types generated via `pnpm run generate:api` from OpenAPI spec
- Complex forms use Tabs pattern (see `day-plan-form-sheet.tsx`)
- Custom inputs: `TimeInput`, `DurationInput` for time/duration fields
- Conditional rendering pattern: `{form.planType === 'flextime' && (...)}`
- Enums handled via `Select` component with mapped options

## Desired End State

Tariff form with tabbed interface supporting all ZMI fields:
1. **Basic Tab** - Code, name, description, active status
2. **Schedule Tab** - Rhythm type, week plan(s), validity dates
3. **Vacation Tab** - Annual days, work days/week, vacation basis
4. **Target Hours Tab** - Daily, weekly, monthly, annual targets
5. **Flextime Tab** - Monthly limits, thresholds, credit type

## What We're NOT Doing

- Employee tariff assignment UI (separate ticket)
- Tariff break management (already exists)
- Backend changes (already complete)
- Tariff list/data table changes (fields not shown in table)

## Implementation Approach

1. First regenerate API types to include new fields
2. Update form state interface with all new fields
3. Restructure form into tabbed sections
4. Add conditional rhythm configuration UI
5. Update detail sheet to display new fields

---

## Phase 1: Regenerate API Types

### Overview
Update the OpenAPI spec and regenerate TypeScript types.

### Changes Required:

#### 1. Bundle OpenAPI Spec
First ensure the backend OpenAPI spec is bundled with new fields.

```bash
cd /home/tolga/projects/terp
# Bundle the OpenAPI spec (creates openapi.bundled.yaml)
# Then convert to v3 format for openapi-typescript
```

#### 2. Regenerate Frontend Types
**Command:**
```bash
cd apps/web && pnpm run generate:api
```

This will update `src/lib/api/types.ts` with:
- New Tariff fields (vacation, target hours, flextime, rhythm)
- TariffWeekPlan type
- TariffDayPlan type
- Updated CreateTariffRequest/UpdateTariffRequest

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/web && pnpm run generate:api` completes without errors
- [x] `cd apps/web && pnpm run lint` passes
- [x] `cd apps/web && pnpm run build` passes

#### Manual Verification:
- [ ] Check `src/lib/api/types.ts` contains `annual_vacation_days`, `rhythm_type`, `credit_type` fields

---

## Phase 2: Update Tariff Form State

### Overview
Add all new fields to the form state interface and initial state.

### Changes Required:

#### 1. Update Form State Interface
**File**: `apps/web/src/components/tariffs/tariff-form-sheet.tsx`

```typescript
interface FormState {
  // Basic (existing)
  code: string
  name: string
  description: string
  isActive: boolean

  // Week Plan (existing)
  weekPlanId: string
  validFrom: Date | undefined
  validTo: Date | undefined

  // NEW: Rhythm Configuration
  rhythmType: 'weekly' | 'rolling_weekly' | 'x_days'
  cycleDays: number | null
  rhythmStartDate: Date | undefined
  weekPlanIds: string[]  // For rolling_weekly
  dayPlans: { dayPosition: number; dayPlanId: string | null }[]  // For x_days

  // NEW: Vacation Settings
  annualVacationDays: number | null
  workDaysPerWeek: number | null
  vacationBasis: 'calendar_year' | 'entry_date'

  // NEW: Target Hours (stored as hours, displayed as HH:MM)
  dailyTargetHours: number | null
  weeklyTargetHours: number | null
  monthlyTargetHours: number | null
  annualTargetHours: number | null

  // NEW: Flextime/Monthly Evaluation (stored in minutes)
  maxFlextimePerMonth: number | null
  upperLimitAnnual: number | null
  lowerLimitAnnual: number | null
  flextimeThreshold: number | null
  creditType: 'no_evaluation' | 'complete' | 'after_threshold' | 'no_carryover'
}
```

#### 2. Update Initial State
```typescript
const INITIAL_STATE: FormState = {
  // Basic
  code: '',
  name: '',
  description: '',
  isActive: true,

  // Week Plan
  weekPlanId: '',
  validFrom: undefined,
  validTo: undefined,

  // Rhythm
  rhythmType: 'weekly',
  cycleDays: null,
  rhythmStartDate: undefined,
  weekPlanIds: [],
  dayPlans: [],

  // Vacation
  annualVacationDays: null,
  workDaysPerWeek: 5,
  vacationBasis: 'calendar_year',

  // Target Hours
  dailyTargetHours: null,
  weeklyTargetHours: null,
  monthlyTargetHours: null,
  annualTargetHours: null,

  // Flextime
  maxFlextimePerMonth: null,
  upperLimitAnnual: null,
  lowerLimitAnnual: null,
  flextimeThreshold: null,
  creditType: 'no_evaluation',
}
```

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/web && pnpm run build` passes
- [x] No TypeScript errors

---

## Phase 3: Implement Tabbed Form UI

### Overview
Restructure the form into tabs for better organization.

### Changes Required:

#### 1. Add Tab Imports
```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DurationInput } from '@/components/ui/duration-input'
```

#### 2. Add Hooks for Data
```typescript
// Add to existing imports
import { useDayPlans } from '@/hooks/api'

// Inside component
const { data: dayPlansData } = useDayPlans({ active: true, enabled: open })
const dayPlans = dayPlansData?.data ?? []
```

#### 3. Implement Tab Structure
```tsx
<Tabs defaultValue="basic" className="w-full">
  <TabsList className="mb-4">
    <TabsTrigger value="basic">Basic</TabsTrigger>
    <TabsTrigger value="schedule">Schedule</TabsTrigger>
    <TabsTrigger value="vacation">Vacation</TabsTrigger>
    <TabsTrigger value="hours">Target Hours</TabsTrigger>
    <TabsTrigger value="flextime">Flextime</TabsTrigger>
  </TabsList>

  {/* Basic Tab - existing fields */}
  <TabsContent value="basic">...</TabsContent>

  {/* Schedule Tab - rhythm + week plan */}
  <TabsContent value="schedule">...</TabsContent>

  {/* Vacation Tab */}
  <TabsContent value="vacation">...</TabsContent>

  {/* Target Hours Tab */}
  <TabsContent value="hours">...</TabsContent>

  {/* Flextime Tab */}
  <TabsContent value="flextime">...</TabsContent>
</Tabs>
```

#### 4. Basic Tab Content
```tsx
<TabsContent value="basic" className="space-y-4">
  <div className="grid grid-cols-2 gap-4">
    <div className="space-y-2">
      <Label htmlFor="code">Code *</Label>
      <Input
        id="code"
        value={form.code}
        onChange={(e) => setForm({ ...form, code: e.target.value })}
        disabled={isEdit || isPending}
        placeholder="e.g., TARIFF-001"
        maxLength={20}
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="name">Name *</Label>
      <Input
        id="name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        disabled={isPending}
        placeholder="e.g., Standard Full-Time"
      />
    </div>
  </div>

  <div className="space-y-2">
    <Label htmlFor="description">Description</Label>
    <Textarea
      id="description"
      value={form.description}
      onChange={(e) => setForm({ ...form, description: e.target.value })}
      disabled={isPending}
      placeholder="Optional description..."
      rows={3}
    />
  </div>

  {isEdit && (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label htmlFor="isActive">Active</Label>
        <p className="text-sm text-muted-foreground">
          Inactive tariffs cannot be assigned to employees
        </p>
      </div>
      <Switch
        id="isActive"
        checked={form.isActive}
        onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
        disabled={isPending}
      />
    </div>
  )}
</TabsContent>
```

#### 5. Schedule Tab Content (with Rhythm)
```tsx
<TabsContent value="schedule" className="space-y-4">
  {/* Rhythm Type Selector */}
  <div className="space-y-2">
    <Label>Rhythm Type</Label>
    <Select
      value={form.rhythmType}
      onValueChange={(v) => setForm({
        ...form,
        rhythmType: v as FormState['rhythmType'],
        // Reset related fields
        weekPlanIds: v === 'rolling_weekly' ? form.weekPlanIds : [],
        dayPlans: v === 'x_days' ? form.dayPlans : [],
        cycleDays: v === 'x_days' ? form.cycleDays : null,
      })}
      disabled={isPending}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="weekly">Weekly (Single Plan)</SelectItem>
        <SelectItem value="rolling_weekly">Rolling Weekly (Multiple Plans)</SelectItem>
        <SelectItem value="x_days">X-Days Cycle</SelectItem>
      </SelectContent>
    </Select>
    <p className="text-xs text-muted-foreground">
      {form.rhythmType === 'weekly' && 'Same week plan every week'}
      {form.rhythmType === 'rolling_weekly' && 'Week plans rotate in sequence'}
      {form.rhythmType === 'x_days' && 'Custom day cycle (not tied to weekdays)'}
    </p>
  </div>

  {/* Weekly: Single Week Plan */}
  {form.rhythmType === 'weekly' && (
    <div className="space-y-2">
      <Label>Week Plan</Label>
      <Select
        value={form.weekPlanId || '__none__'}
        onValueChange={(value) =>
          setForm({ ...form, weekPlanId: value === '__none__' ? '' : value })
        }
        disabled={isPending || loadingWeekPlans}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select week plan" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">None</SelectItem>
          {weekPlans.map((wp) => (
            <SelectItem key={wp.id} value={wp.id}>
              {wp.code} - {wp.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )}

  {/* Rolling Weekly: Multiple Week Plans */}
  {form.rhythmType === 'rolling_weekly' && (
    <RollingWeekPlanSelector
      weekPlans={weekPlans}
      selectedIds={form.weekPlanIds}
      onChange={(ids) => setForm({ ...form, weekPlanIds: ids })}
      disabled={isPending}
    />
  )}

  {/* X-Days: Cycle Configuration */}
  {form.rhythmType === 'x_days' && (
    <XDaysRhythmConfig
      cycleDays={form.cycleDays}
      dayPlans={form.dayPlans}
      availableDayPlans={dayPlans}
      onCycleDaysChange={(days) => setForm({ ...form, cycleDays: days })}
      onDayPlansChange={(plans) => setForm({ ...form, dayPlans: plans })}
      disabled={isPending}
    />
  )}

  {/* Rhythm Start Date */}
  {form.rhythmType !== 'weekly' && (
    <div className="space-y-2">
      <Label>Rhythm Start Date</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-full justify-start text-left font-normal',
              !form.rhythmStartDate && 'text-muted-foreground'
            )}
            disabled={isPending}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {form.rhythmStartDate ? format(form.rhythmStartDate, 'PPP') : 'Pick a date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={form.rhythmStartDate}
            onSelect={(date) => setForm({ ...form, rhythmStartDate: date as Date | undefined })}
          />
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground">
        When the rhythm cycle begins for calculation
      </p>
    </div>
  )}

  {/* Validity Period */}
  <div className="border-t pt-4 mt-4">
    <h4 className="text-sm font-medium mb-3">Validity Period</h4>
    <div className="grid grid-cols-2 gap-4">
      {/* ... existing validity date pickers ... */}
    </div>
  </div>
</TabsContent>
```

#### 6. Vacation Tab Content
```tsx
<TabsContent value="vacation" className="space-y-4">
  <p className="text-sm text-muted-foreground">
    Configure vacation entitlement and calculation settings.
  </p>

  <div className="grid grid-cols-2 gap-4">
    <div className="space-y-2">
      <Label htmlFor="annualVacationDays">Annual Vacation Days</Label>
      <Input
        id="annualVacationDays"
        type="number"
        step="0.5"
        min="0"
        max="365"
        value={form.annualVacationDays ?? ''}
        onChange={(e) => setForm({
          ...form,
          annualVacationDays: e.target.value ? parseFloat(e.target.value) : null
        })}
        disabled={isPending}
        placeholder="e.g., 30"
      />
      <p className="text-xs text-muted-foreground">Base vacation days per year</p>
    </div>

    <div className="space-y-2">
      <Label htmlFor="workDaysPerWeek">Work Days per Week</Label>
      <Select
        value={form.workDaysPerWeek?.toString() ?? '5'}
        onValueChange={(v) => setForm({ ...form, workDaysPerWeek: parseInt(v) })}
        disabled={isPending}
      >
        <SelectTrigger id="workDaysPerWeek">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <SelectItem key={d} value={d.toString()}>
              {d} day{d > 1 ? 's' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">For vacation pro-rating</p>
    </div>
  </div>

  <div className="space-y-2">
    <Label>Vacation Year Basis</Label>
    <Select
      value={form.vacationBasis}
      onValueChange={(v) => setForm({ ...form, vacationBasis: v as FormState['vacationBasis'] })}
      disabled={isPending}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="calendar_year">Calendar Year (Jan 1 - Dec 31)</SelectItem>
        <SelectItem value="entry_date">Entry Date (Anniversary)</SelectItem>
      </SelectContent>
    </Select>
    <p className="text-xs text-muted-foreground">
      When the vacation year starts for this tariff
    </p>
  </div>
</TabsContent>
```

#### 7. Target Hours Tab Content
```tsx
<TabsContent value="hours" className="space-y-4">
  <p className="text-sm text-muted-foreground">
    Define target working hours. These can be used for reference and macros.
  </p>

  <div className="grid grid-cols-2 gap-4">
    <div className="space-y-2">
      <Label htmlFor="dailyTargetHours">Daily Target</Label>
      <Input
        id="dailyTargetHours"
        type="number"
        step="0.25"
        min="0"
        max="24"
        value={form.dailyTargetHours ?? ''}
        onChange={(e) => setForm({
          ...form,
          dailyTargetHours: e.target.value ? parseFloat(e.target.value) : null
        })}
        disabled={isPending}
        placeholder="e.g., 8.0"
      />
      <p className="text-xs text-muted-foreground">Hours per day</p>
    </div>

    <div className="space-y-2">
      <Label htmlFor="weeklyTargetHours">Weekly Target</Label>
      <Input
        id="weeklyTargetHours"
        type="number"
        step="0.5"
        min="0"
        max="168"
        value={form.weeklyTargetHours ?? ''}
        onChange={(e) => setForm({
          ...form,
          weeklyTargetHours: e.target.value ? parseFloat(e.target.value) : null
        })}
        disabled={isPending}
        placeholder="e.g., 40.0"
      />
      <p className="text-xs text-muted-foreground">Hours per week</p>
    </div>
  </div>

  <div className="grid grid-cols-2 gap-4">
    <div className="space-y-2">
      <Label htmlFor="monthlyTargetHours">Monthly Target</Label>
      <Input
        id="monthlyTargetHours"
        type="number"
        step="0.5"
        min="0"
        value={form.monthlyTargetHours ?? ''}
        onChange={(e) => setForm({
          ...form,
          monthlyTargetHours: e.target.value ? parseFloat(e.target.value) : null
        })}
        disabled={isPending}
        placeholder="e.g., 173.33"
      />
      <p className="text-xs text-muted-foreground">Hours per month</p>
    </div>

    <div className="space-y-2">
      <Label htmlFor="annualTargetHours">Annual Target</Label>
      <Input
        id="annualTargetHours"
        type="number"
        step="1"
        min="0"
        value={form.annualTargetHours ?? ''}
        onChange={(e) => setForm({
          ...form,
          annualTargetHours: e.target.value ? parseFloat(e.target.value) : null
        })}
        disabled={isPending}
        placeholder="e.g., 2080"
      />
      <p className="text-xs text-muted-foreground">Hours per year</p>
    </div>
  </div>
</TabsContent>
```

#### 8. Flextime Tab Content
```tsx
<TabsContent value="flextime" className="space-y-4">
  <p className="text-sm text-muted-foreground">
    Configure monthly evaluation and flextime account limits.
  </p>

  <div className="space-y-2">
    <Label>Credit Type</Label>
    <Select
      value={form.creditType}
      onValueChange={(v) => setForm({ ...form, creditType: v as FormState['creditType'] })}
      disabled={isPending}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="no_evaluation">No Evaluation (1:1 Transfer)</SelectItem>
        <SelectItem value="complete">Complete Carryover (with Limits)</SelectItem>
        <SelectItem value="after_threshold">After Threshold</SelectItem>
        <SelectItem value="no_carryover">No Carryover (Reset to 0)</SelectItem>
      </SelectContent>
    </Select>
    <p className="text-xs text-muted-foreground">
      How flextime is credited at month end
    </p>
  </div>

  <div className="border rounded-lg p-4 space-y-4">
    <h4 className="text-sm font-medium">Account Limits (in minutes)</h4>

    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="maxFlextimePerMonth">Max Flextime per Month</Label>
        <DurationInput
          id="maxFlextimePerMonth"
          value={form.maxFlextimePerMonth}
          onChange={(v) => setForm({ ...form, maxFlextimePerMonth: v })}
          format="hhmm"
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">Maximum monthly credit</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="flextimeThreshold">Flextime Threshold</Label>
        <DurationInput
          id="flextimeThreshold"
          value={form.flextimeThreshold}
          onChange={(v) => setForm({ ...form, flextimeThreshold: v })}
          format="hhmm"
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">Minimum overtime to qualify</p>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="upperLimitAnnual">Upper Limit (Annual)</Label>
        <DurationInput
          id="upperLimitAnnual"
          value={form.upperLimitAnnual}
          onChange={(v) => setForm({ ...form, upperLimitAnnual: v })}
          format="hhmm"
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">Annual flextime cap</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="lowerLimitAnnual">Lower Limit (Annual)</Label>
        <DurationInput
          id="lowerLimitAnnual"
          value={form.lowerLimitAnnual}
          onChange={(v) => setForm({ ...form, lowerLimitAnnual: v })}
          format="hhmm"
          className="w-full"
          allowNegative
        />
        <p className="text-xs text-muted-foreground">Annual flextime floor (can be negative)</p>
      </div>
    </div>
  </div>
</TabsContent>
```

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/web && pnpm run build` passes
- [x] `cd apps/web && pnpm run lint` passes

#### Manual Verification:
- [ ] All 5 tabs display correctly
- [ ] Tab navigation works
- [ ] Form fields are editable

---

## Phase 4: Create Rhythm Sub-Components

### Overview
Create reusable components for rolling weekly and x-days rhythm configuration.

### Changes Required:

#### 1. Create Rolling Week Plan Selector
**File**: `apps/web/src/components/tariffs/rolling-week-plan-selector.tsx`

```tsx
'use client'

import * as React from 'react'
import { GripVertical, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { components } from '@/lib/api/types'

type WeekPlan = components['schemas']['WeekPlan']

interface RollingWeekPlanSelectorProps {
  weekPlans: WeekPlan[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}

export function RollingWeekPlanSelector({
  weekPlans,
  selectedIds,
  onChange,
  disabled,
}: RollingWeekPlanSelectorProps) {
  const availablePlans = weekPlans.filter((wp) => !selectedIds.includes(wp.id))

  const handleAdd = (id: string) => {
    onChange([...selectedIds, id])
  }

  const handleRemove = (index: number) => {
    onChange(selectedIds.filter((_, i) => i !== index))
  }

  const handleMove = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
    if (toIndex < 0 || toIndex >= selectedIds.length) return

    const newIds = [...selectedIds]
    ;[newIds[fromIndex], newIds[toIndex]] = [newIds[toIndex], newIds[fromIndex]]
    onChange(newIds)
  }

  return (
    <div className="space-y-3">
      <Label>Week Plans (in rotation order)</Label>

      {selectedIds.length === 0 ? (
        <p className="text-sm text-muted-foreground">No week plans selected</p>
      ) : (
        <div className="space-y-2">
          {selectedIds.map((id, index) => {
            const plan = weekPlans.find((wp) => wp.id === id)
            return (
              <div
                key={id}
                className="flex items-center gap-2 p-2 border rounded-lg bg-muted/50"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Week {index + 1}:</span>
                <span className="flex-1 text-sm">
                  {plan?.code} - {plan?.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleMove(index, 'up')}
                  disabled={disabled || index === 0}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleMove(index, 'down')}
                  disabled={disabled || index === selectedIds.length - 1}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleRemove(index)}
                  disabled={disabled}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {availablePlans.length > 0 && (
        <div className="flex gap-2">
          <Select
            onValueChange={handleAdd}
            disabled={disabled}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Add week plan to rotation..." />
            </SelectTrigger>
            <SelectContent>
              {availablePlans.map((wp) => (
                <SelectItem key={wp.id} value={wp.id}>
                  {wp.code} - {wp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Week plans rotate in sequence. Week 1 uses the first plan, Week 2 the second, etc.
      </p>
    </div>
  )
}
```

#### 2. Create X-Days Rhythm Config
**File**: `apps/web/src/components/tariffs/x-days-rhythm-config.tsx`

```tsx
'use client'

import * as React from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { components } from '@/lib/api/types'

type DayPlan = components['schemas']['DayPlan']

interface DayPlanAssignment {
  dayPosition: number
  dayPlanId: string | null
}

interface XDaysRhythmConfigProps {
  cycleDays: number | null
  dayPlans: DayPlanAssignment[]
  availableDayPlans: DayPlan[]
  onCycleDaysChange: (days: number | null) => void
  onDayPlansChange: (plans: DayPlanAssignment[]) => void
  disabled?: boolean
}

export function XDaysRhythmConfig({
  cycleDays,
  dayPlans,
  availableDayPlans,
  onCycleDaysChange,
  onDayPlansChange,
  disabled,
}: XDaysRhythmConfigProps) {
  // When cycle days change, update the day plans array
  React.useEffect(() => {
    if (!cycleDays || cycleDays < 1) return

    const newPlans: DayPlanAssignment[] = []
    for (let i = 1; i <= cycleDays; i++) {
      const existing = dayPlans.find((dp) => dp.dayPosition === i)
      newPlans.push({
        dayPosition: i,
        dayPlanId: existing?.dayPlanId ?? null,
      })
    }

    if (JSON.stringify(newPlans) !== JSON.stringify(dayPlans)) {
      onDayPlansChange(newPlans)
    }
  }, [cycleDays, dayPlans, onDayPlansChange])

  const handleDayPlanChange = (position: number, dayPlanId: string | null) => {
    const newPlans = dayPlans.map((dp) =>
      dp.dayPosition === position ? { ...dp, dayPlanId } : dp
    )
    onDayPlansChange(newPlans)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cycleDays">Cycle Length (Days)</Label>
        <Input
          id="cycleDays"
          type="number"
          min="1"
          max="365"
          value={cycleDays ?? ''}
          onChange={(e) => onCycleDaysChange(e.target.value ? parseInt(e.target.value) : null)}
          disabled={disabled}
          placeholder="e.g., 14"
          className="w-32"
        />
        <p className="text-xs text-muted-foreground">
          Number of days before the cycle repeats
        </p>
      </div>

      {cycleDays && cycleDays > 0 && (
        <div className="space-y-2">
          <Label>Day Plan Assignments</Label>
          <ScrollArea className="h-64 border rounded-lg">
            <div className="p-2 space-y-1">
              {dayPlans.map((dp) => (
                <div
                  key={dp.dayPosition}
                  className="flex items-center gap-2 py-1"
                >
                  <span className="w-16 text-sm font-medium">
                    Day {dp.dayPosition}:
                  </span>
                  <Select
                    value={dp.dayPlanId ?? '__off__'}
                    onValueChange={(v) =>
                      handleDayPlanChange(dp.dayPosition, v === '__off__' ? null : v)
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__off__">Off Day (No Plan)</SelectItem>
                      {availableDayPlans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.code} - {plan.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </ScrollArea>
          <p className="text-xs text-muted-foreground">
            Assign a day plan to each position. Off days have no work requirement.
          </p>
        </div>
      )}
    </div>
  )
}
```

#### 3. Export from Index
**File**: `apps/web/src/components/tariffs/index.ts`

Add exports:
```typescript
export { RollingWeekPlanSelector } from './rolling-week-plan-selector'
export { XDaysRhythmConfig } from './x-days-rhythm-config'
```

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/web && pnpm run build` passes
- [x] No TypeScript errors in new components

#### Manual Verification:
- [ ] Rolling selector allows adding/removing/reordering week plans
- [ ] X-days config generates correct number of day position rows

---

## Phase 5: Update Form Submission

### Overview
Update handleSubmit to include all new fields in API requests.

### Changes Required:

#### 1. Update handleSubmit
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setError(null)

  const errors = validateForm(form, isEdit)
  if (errors.length > 0) {
    setError(errors.join('. '))
    return
  }

  try {
    // Build request body
    const commonFields = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      valid_from: form.validFrom ? format(form.validFrom, 'yyyy-MM-dd') : undefined,
      valid_to: form.validTo ? format(form.validTo, 'yyyy-MM-dd') : undefined,

      // Rhythm fields
      rhythm_type: form.rhythmType,
      cycle_days: form.rhythmType === 'x_days' ? form.cycleDays : undefined,
      rhythm_start_date: form.rhythmType !== 'weekly' && form.rhythmStartDate
        ? format(form.rhythmStartDate, 'yyyy-MM-dd') : undefined,

      // Week plan (for weekly rhythm)
      week_plan_id: form.rhythmType === 'weekly' ? (form.weekPlanId || undefined) : undefined,

      // Week plan IDs (for rolling_weekly)
      week_plan_ids: form.rhythmType === 'rolling_weekly' ? form.weekPlanIds : undefined,

      // Day plans (for x_days)
      day_plans: form.rhythmType === 'x_days'
        ? form.dayPlans.map((dp) => ({
            day_position: dp.dayPosition,
            day_plan_id: dp.dayPlanId,
          }))
        : undefined,

      // Vacation fields
      annual_vacation_days: form.annualVacationDays,
      work_days_per_week: form.workDaysPerWeek,
      vacation_basis: form.vacationBasis,

      // Target hours
      daily_target_hours: form.dailyTargetHours,
      weekly_target_hours: form.weeklyTargetHours,
      monthly_target_hours: form.monthlyTargetHours,
      annual_target_hours: form.annualTargetHours,

      // Flextime
      max_flextime_per_month: form.maxFlextimePerMonth,
      upper_limit_annual: form.upperLimitAnnual,
      lower_limit_annual: form.lowerLimitAnnual,
      flextime_threshold: form.flextimeThreshold,
      credit_type: form.creditType,
    }

    if (isEdit && tariff) {
      await updateMutation.mutateAsync({
        path: { id: tariff.id },
        body: {
          ...commonFields,
          is_active: form.isActive,
        },
      })
    } else {
      await createMutation.mutateAsync({
        body: {
          code: form.code.trim(),
          ...commonFields,
        },
      })
    }
    onSuccess?.()
  } catch (err) {
    const apiError = err as { detail?: string; message?: string }
    setError(apiError.detail ?? apiError.message ?? `Failed to ${isEdit ? 'update' : 'create'} tariff`)
  }
}
```

#### 2. Update Form Population on Edit
```typescript
React.useEffect(() => {
  if (open) {
    setError(null)
    if (fullTariff) {
      setForm({
        code: fullTariff.code,
        name: fullTariff.name,
        description: fullTariff.description ?? '',
        isActive: fullTariff.is_active ?? true,

        // Week Plan / Rhythm
        weekPlanId: fullTariff.week_plan_id ?? '',
        validFrom: fullTariff.valid_from ? parseISODate(fullTariff.valid_from) : undefined,
        validTo: fullTariff.valid_to ? parseISODate(fullTariff.valid_to) : undefined,
        rhythmType: fullTariff.rhythm_type ?? 'weekly',
        cycleDays: fullTariff.cycle_days ?? null,
        rhythmStartDate: fullTariff.rhythm_start_date
          ? parseISODate(fullTariff.rhythm_start_date) : undefined,
        weekPlanIds: fullTariff.tariff_week_plans?.map((twp) => twp.week_plan_id) ?? [],
        dayPlans: fullTariff.tariff_day_plans?.map((tdp) => ({
          dayPosition: tdp.day_position,
          dayPlanId: tdp.day_plan_id ?? null,
        })) ?? [],

        // Vacation
        annualVacationDays: fullTariff.annual_vacation_days ?? null,
        workDaysPerWeek: fullTariff.work_days_per_week ?? 5,
        vacationBasis: fullTariff.vacation_basis ?? 'calendar_year',

        // Target Hours
        dailyTargetHours: fullTariff.daily_target_hours ?? null,
        weeklyTargetHours: fullTariff.weekly_target_hours ?? null,
        monthlyTargetHours: fullTariff.monthly_target_hours ?? null,
        annualTargetHours: fullTariff.annual_target_hours ?? null,

        // Flextime
        maxFlextimePerMonth: fullTariff.max_flextime_per_month ?? null,
        upperLimitAnnual: fullTariff.upper_limit_annual ?? null,
        lowerLimitAnnual: fullTariff.lower_limit_annual ?? null,
        flextimeThreshold: fullTariff.flextime_threshold ?? null,
        creditType: fullTariff.credit_type ?? 'no_evaluation',
      })
    } else if (!isEdit) {
      setForm(INITIAL_STATE)
    }
  }
}, [open, fullTariff, isEdit])
```

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/web && pnpm run build` passes

#### Manual Verification:
- [ ] Create tariff with all fields - verify saved correctly
- [ ] Edit tariff - verify all fields populate correctly
- [ ] Update tariff fields - verify changes persist

---

## Phase 6: Update Detail Sheet

### Overview
Update the tariff detail sheet to display all new fields.

### Changes Required:

**File**: `apps/web/src/components/tariffs/tariff-detail-sheet.tsx`

Add sections to display:
- Rhythm type and configuration
- Vacation settings
- Target hours
- Flextime settings

(Full implementation similar to form, but read-only display)

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/web && pnpm run build` passes

#### Manual Verification:
- [ ] Detail sheet shows all ZMI fields
- [ ] Rolling weekly shows week plans in order
- [ ] X-days shows cycle day assignments

---

## Testing Strategy

### Automated Tests:
- Component unit tests for RollingWeekPlanSelector
- Component unit tests for XDaysRhythmConfig
- Form validation tests

### Manual Testing Steps:
1. Create tariff with weekly rhythm + week plan
2. Create tariff with rolling_weekly rhythm + multiple week plans
3. Create tariff with x_days rhythm + 14-day cycle
4. Edit each tariff type, verify fields populate
5. Update fields, verify persistence
6. View detail sheet for each rhythm type

## References

- Research: `thoughts/shared/research/2026-01-26-tariff-zmi-verification.md`
- Research: `thoughts/shared/research/2026-01-26-rolling-weekplans-xdays-rhythm.md`
- Similar form: `apps/web/src/components/day-plans/day-plan-form-sheet.tsx`
- Backend plan: `thoughts/shared/plans/2026-01-26-tariff-zmi-verification.md`

---

**END OF PLAN**
