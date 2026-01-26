'use client'

import { useState, useEffect } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { useUpdateUser } from '@/hooks/api'
import {
  Pencil,
  X,
  Check,
  AlertCircle,
  CheckCircle,
  Lock,
  Bell,
  Construction,
} from 'lucide-react'
import type { User } from '@/hooks/use-auth'

interface AccountSettingsCardProps {
  user: User
}

/**
 * Account settings card with display name editing and placeholders.
 */
export function AccountSettingsCard({ user }: AccountSettingsCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const updateUser = useUpdateUser()

  // Initialize form data when user changes
  useEffect(() => {
    setDisplayName(user.display_name || '')
  }, [user])

  // Clear success message after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [successMessage])

  const handleCancel = () => {
    setDisplayName(user.display_name || '')
    setError(null)
    setIsEditing(false)
  }

  const handleSave = async () => {
    setError(null)

    if (!displayName.trim()) {
      setError('Display name is required')
      return
    }

    if (displayName.length > 100) {
      setError('Display name must be less than 100 characters')
      return
    }

    try {
      await updateUser.mutateAsync({
        path: { id: user.id },
        body: { display_name: displayName.trim() },
      })
      setIsEditing(false)
      setSuccessMessage('Display name updated successfully')
    } catch {
      setError('Failed to save changes. Please try again.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Settings</CardTitle>
        <CardDescription>Manage your account preferences</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Success message */}
        {successMessage && (
          <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            <CheckCircle className="h-4 w-4" />
            <span className="ml-2">{successMessage}</span>
          </Alert>
        )}

        {/* Error message */}
        {error && error.includes('Failed') && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="ml-2">{error}</span>
          </Alert>
        )}

        {/* Email (read-only) */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">Email</Label>
          <p className="text-sm font-medium">{user.email}</p>
          <p className="text-xs text-muted-foreground">
            Your email address cannot be changed.
          </p>
        </div>

        {/* Role (read-only) */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">Role</Label>
          <div>
            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
              {user.role === 'admin' ? 'Administrator' : 'User'}
            </Badge>
          </div>
        </div>

        <Separator />

        {/* Display Name (editable) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="displayName">Display Name</Label>
            {isEditing ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancel}
                  disabled={updateUser.isPending}
                >
                  <X className="mr-1 h-3 w-3" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={updateUser.isPending}
                >
                  <Check className="mr-1 h-3 w-3" />
                  {updateUser.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="mr-1 h-3 w-3" />
                Edit
              </Button>
            )}
          </div>
          {isEditing ? (
            <>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={error && !error.includes('Failed') ? 'border-destructive' : ''}
              />
              {error && !error.includes('Failed') && (
                <p className="text-xs text-destructive">{error}</p>
              )}
            </>
          ) : (
            <p className="text-sm font-medium">{user.display_name || 'Not set'}</p>
          )}
        </div>

        <Separator />

        {/* Password Change (placeholder) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <Label>Password</Label>
            </div>
            <Badge variant="secondary" className="text-xs">
              <Construction className="mr-1 h-3 w-3" />
              Coming Soon
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Password change functionality will be available in a future update.
          </p>
        </div>

        {/* Notification Preferences (placeholder) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <Label>Notifications</Label>
            </div>
            <Badge variant="secondary" className="text-xs">
              <Construction className="mr-1 h-3 w-3" />
              Coming Soon
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Notification preferences will be available in a future update.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
