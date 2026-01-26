'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useCreateTeam,
  useUpdateTeam,
  useDepartments,
  useEmployees,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Team = components['schemas']['Team']

interface TeamFormSheetProps {
  /** Whether the sheet is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Team to edit (null = create mode) */
  team?: Team | null
  /** Callback when form submits successfully */
  onSuccess?: () => void
}

interface FormState {
  name: string
  description: string
  departmentId: string
  leaderEmployeeId: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  name: '',
  description: '',
  departmentId: '',
  leaderEmployeeId: '',
  isActive: true,
}

function validateForm(form: FormState): string[] {
  const errors: string[] = []

  if (!form.name.trim()) {
    errors.push('Team name is required')
  }

  if (form.name.length > 255) {
    errors.push('Team name must be 255 characters or less')
  }

  return errors
}

/**
 * Sheet form for creating or editing a team.
 */
export function TeamFormSheet({
  open,
  onOpenChange,
  team,
  onSuccess,
}: TeamFormSheetProps) {
  const isEdit = !!team
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  // Mutations
  const createMutation = useCreateTeam()
  const updateMutation = useUpdateTeam()

  // Reference data
  const { data: departmentsData, isLoading: loadingDepartments } = useDepartments({ enabled: open })
  const { data: employeesData, isLoading: loadingEmployees } = useEmployees({
    limit: 100,
    active: true,
    enabled: open
  })

  const departments = departmentsData?.data ?? []
  const employees = employeesData?.data ?? []

  // Reset form when opening/closing or team changes
  React.useEffect(() => {
    if (open) {
      if (team) {
        setForm({
          name: team.name,
          description: team.description || '',
          departmentId: team.department_id || '',
          leaderEmployeeId: team.leader_employee_id || '',
          isActive: team.is_active,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, team])

  const handleSubmit = async () => {
    setError(null)

    const errors = validateForm(form)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && team) {
        await updateMutation.mutateAsync({
          path: { id: team.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            department_id: form.departmentId || undefined,
            leader_employee_id: form.leaderEmployeeId || undefined,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            department_id: form.departmentId || undefined,
            leader_employee_id: form.leaderEmployeeId || undefined,
            is_active: form.isActive,
          },
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? `Failed to ${isEdit ? 'update' : 'create'} team`)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending
  const isLoadingReferenceData = loadingDepartments || loadingEmployees

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Team' : 'New Team'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update team information and settings.'
              : 'Create a new team for organizing employees.'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Team Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Team Information</h3>

              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder="e.g., Frontend Team"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder="Brief description of the team's purpose..."
                  rows={3}
                />
              </div>
            </div>

            {/* Organization */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Organization</h3>

              <div className="space-y-2">
                <Label>Department</Label>
                <Select
                  value={form.departmentId || '__none__'}
                  onValueChange={(value) => setForm((prev) => ({
                    ...prev,
                    departmentId: value === '__none__' ? '' : value
                  }))}
                  disabled={isSubmitting || isLoadingReferenceData}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Team Leader</Label>
                <Select
                  value={form.leaderEmployeeId || '__none__'}
                  onValueChange={(value) => setForm((prev) => ({
                    ...prev,
                    leaderEmployeeId: value === '__none__' ? '' : value
                  }))}
                  disabled={isSubmitting || isLoadingReferenceData}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select team leader" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Status</h3>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isActive">Active</Label>
                  <p className="text-sm text-muted-foreground">
                    Inactive teams are hidden from most views
                  </p>
                </div>
                <Switch
                  id="isActive"
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Team'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
