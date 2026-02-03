'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useChangeUserPassword } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type User = components['schemas']['User']

interface ChangePasswordDialogProps {
  user: User | null
  isSelf: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

interface PasswordFormState {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

const INITIAL_PASSWORD_STATE: PasswordFormState = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
}

function getPasswordStrength(password: string): 'weak' | 'medium' | 'strong' {
  if (!password || password.length < 8) return 'weak'
  const hasLower = /[a-z]/.test(password)
  const hasUpper = /[A-Z]/.test(password)
  const hasDigit = /[0-9]/.test(password)
  const hasSpecial = /[^a-zA-Z0-9]/.test(password)
  const typeCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length
  if (password.length >= 12 && typeCount >= 3) return 'strong'
  if (password.length >= 8 && typeCount >= 2) return 'medium'
  return 'weak'
}

export function ChangePasswordDialog({
  user,
  isSelf,
  onOpenChange,
  onSuccess,
}: ChangePasswordDialogProps) {
  const t = useTranslations('adminUsers')
  const tCommon = useTranslations('common')
  const changePasswordMutation = useChangeUserPassword()

  const [form, setForm] = React.useState<PasswordFormState>(INITIAL_PASSWORD_STATE)
  const [error, setError] = React.useState<string | null>(null)
  const [showCurrentPassword, setShowCurrentPassword] = React.useState(false)
  const [showNewPassword, setShowNewPassword] = React.useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)

  const open = !!user

  // Reset form when dialog opens/closes
  React.useEffect(() => {
    if (open) {
      setForm(INITIAL_PASSWORD_STATE)
      setError(null)
      setShowCurrentPassword(false)
      setShowNewPassword(false)
      setShowConfirmPassword(false)
    }
  }, [open])

  const handleSubmit = async () => {
    setError(null)

    const errors: string[] = []
    if (isSelf && !form.currentPassword.trim()) errors.push(t('validationCurrentPasswordRequired'))
    if (!form.newPassword.trim()) errors.push(t('validationNewPasswordRequired'))
    if (form.newPassword.length > 0 && form.newPassword.length < 8)
      errors.push(t('validationPasswordMinLength'))
    if (form.newPassword !== form.confirmPassword) errors.push(t('validationPasswordMismatch'))

    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    if (!user) return

    try {
      await changePasswordMutation.mutateAsync({
        path: { id: user.id },
        body: {
          current_password: isSelf ? form.currentPassword : undefined,
          new_password: form.newPassword,
        },
      })
      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('failedPasswordChange'))
    }
  }

  const isSubmitting = changePasswordMutation.isPending
  const strength = getPasswordStrength(form.newPassword)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="sm:max-w-lg sm:mx-auto sm:rounded-t-lg">
        <SheetHeader className="text-left">
          <SheetTitle>{t('passwordTitle')}</SheetTitle>
          <SheetDescription>
            {isSelf
              ? t('passwordDescriptionSelf')
              : user
                ? t('passwordDescription', { name: user.display_name })
                : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Current Password (only for self) */}
          {isSelf && (
            <div className="space-y-2">
              <Label htmlFor="currentPassword">{t('fieldCurrentPassword')}</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={form.currentPassword}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, currentPassword: e.target.value }))
                  }
                  disabled={isSubmitting}
                  placeholder={t('placeholderCurrentPassword')}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  tabIndex={-1}
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* New Password */}
          <div className="space-y-2">
            <Label htmlFor="newPassword">{t('fieldNewPassword')}</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? 'text' : 'password'}
                value={form.newPassword}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, newPassword: e.target.value }))
                }
                disabled={isSubmitting}
                placeholder={t('placeholderNewPassword')}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowNewPassword(!showNewPassword)}
                tabIndex={-1}
              >
                {showNewPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>

            {/* Password strength indicator */}
            {form.newPassword.length > 0 && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  <div
                    className={`h-1 flex-1 rounded-full ${
                      strength === 'weak'
                        ? 'bg-destructive'
                        : strength === 'medium'
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                  />
                  <div
                    className={`h-1 flex-1 rounded-full ${
                      strength === 'medium'
                        ? 'bg-yellow-500'
                        : strength === 'strong'
                          ? 'bg-green-500'
                          : 'bg-muted'
                    }`}
                  />
                  <div
                    className={`h-1 flex-1 rounded-full ${
                      strength === 'strong' ? 'bg-green-500' : 'bg-muted'
                    }`}
                  />
                </div>
                <p
                  className={`text-xs ${
                    strength === 'weak'
                      ? 'text-destructive'
                      : strength === 'medium'
                        ? 'text-yellow-600'
                        : 'text-green-600'
                  }`}
                >
                  {strength === 'weak'
                    ? t('strengthWeak')
                    : strength === 'medium'
                      ? t('strengthMedium')
                      : t('strengthStrong')}
                </p>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t('fieldConfirmPassword')}</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
                }
                disabled={isSubmitting}
                placeholder={t('placeholderConfirmPassword')}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <SheetFooter className="flex-row gap-2 sm:gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="flex-1"
          >
            {tCommon('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('changePasswordButton')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
