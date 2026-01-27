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
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('profile')
  const tc = useTranslations('common')

  const [isEditing, setIsEditing] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const updateUser = useUpdateUser()
  const failedToSaveMsg = t('failedToSave')

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
      setError(t('displayNameRequired'))
      return
    }

    if (displayName.length > 100) {
      setError(t('displayNameMaxLength'))
      return
    }

    try {
      await updateUser.mutateAsync({
        path: { id: user.id },
        body: { display_name: displayName.trim() },
      })
      setIsEditing(false)
      setSuccessMessage(t('displayNameUpdated'))
    } catch {
      setError(failedToSaveMsg)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('accountSettings')}</CardTitle>
        <CardDescription>{t('accountSettingsSubtitle')}</CardDescription>
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
        {error && error === failedToSaveMsg && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="ml-2">{error}</span>
          </Alert>
        )}

        {/* Email (read-only) */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">{t('emailLabel')}</Label>
          <p className="text-sm font-medium">{user.email}</p>
          <p className="text-xs text-muted-foreground">
            {t('emailCannotChange')}
          </p>
        </div>

        {/* Role (read-only) */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">{t('role')}</Label>
          <div>
            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
              {user.role === 'admin' ? t('administrator') : t('userRole')}
            </Badge>
          </div>
        </div>

        <Separator />

        {/* Display Name (editable) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="displayName">{t('displayName')}</Label>
            {isEditing ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancel}
                  disabled={updateUser.isPending}
                >
                  <X className="mr-1 h-3 w-3" />
                  {tc('cancel')}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={updateUser.isPending}
                >
                  <Check className="mr-1 h-3 w-3" />
                  {updateUser.isPending ? tc('saving') : tc('save')}
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="mr-1 h-3 w-3" />
                {tc('edit')}
              </Button>
            )}
          </div>
          {isEditing ? (
            <>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={error && error !== failedToSaveMsg ? 'border-destructive' : ''}
              />
              {error && error !== failedToSaveMsg && (
                <p className="text-xs text-destructive">{error}</p>
              )}
            </>
          ) : (
            <p className="text-sm font-medium">{user.display_name || t('notSet')}</p>
          )}
        </div>

        <Separator />

        {/* Password Change (placeholder) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <Label>{t('passwordLabel')}</Label>
            </div>
            <Badge variant="secondary" className="text-xs">
              <Construction className="mr-1 h-3 w-3" />
              {t('comingSoon')}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('passwordComingSoon')}
          </p>
        </div>

        {/* Notification Preferences (placeholder) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <Label>{t('notifications')}</Label>
            </div>
            <Badge variant="secondary" className="text-xs">
              <Construction className="mr-1 h-3 w-3" />
              {t('comingSoon')}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('notificationsComingSoon')}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
