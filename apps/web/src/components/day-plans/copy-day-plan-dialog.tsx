'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCopyDayPlan } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type DayPlan = components['schemas']['DayPlan']

interface CopyDayPlanDialogProps {
  dayPlan: DayPlan | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CopyDayPlanDialog({ dayPlan, open, onOpenChange }: CopyDayPlanDialogProps) {
  const [newCode, setNewCode] = React.useState('')
  const [newName, setNewName] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const copyMutation = useCopyDayPlan()

  // Initialize fields when dialog opens
  React.useEffect(() => {
    if (open && dayPlan) {
      setNewCode(`${dayPlan.code}-COPY`)
      setNewName(`${dayPlan.name} (Copy)`)
      setError(null)
    }
  }, [open, dayPlan])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!dayPlan) return

    if (!newCode.trim()) {
      setError('Code is required')
      return
    }
    if (!newName.trim()) {
      setError('Name is required')
      return
    }

    try {
      await copyMutation.mutateAsync({
        path: { id: dayPlan.id },
        body: {
          new_code: newCode.trim(),
          new_name: newName.trim(),
        },
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy day plan')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copy Day Plan</DialogTitle>
          <DialogDescription>
            Create a copy of &ldquo;{dayPlan?.name}&rdquo; with a new code and name.
            All settings, breaks, and bonuses will be copied.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newCode">New Code *</Label>
              <Input
                id="newCode"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="e.g., STD-2"
                maxLength={20}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newName">New Name *</Label>
              <Input
                id="newName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Standard Day (Copy)"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={copyMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={copyMutation.isPending}>
              {copyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Copy
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
