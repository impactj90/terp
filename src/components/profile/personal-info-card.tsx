'use client'

import { useState, useEffect } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import { useUpdateEmployee } from '@/hooks'
import type { useEmployee } from '@/hooks'
import { Pencil, X, Check, AlertCircle, CheckCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

type EmployeeData = NonNullable<ReturnType<typeof useEmployee>['data']>

interface PersonalInfoCardProps {
  employee: EmployeeData
}

interface FormData {
  firstName: string
  lastName: string
  email: string
  phone: string
}

interface FormErrors {
  firstName?: string
  lastName?: string
  email?: string
}

/**
 * Personal information card with editable fields.
 */
export function PersonalInfoCard({ employee }: PersonalInfoCardProps) {
  const t = useTranslations('profile')
  const tc = useTranslations('common')

  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const updateEmployee = useUpdateEmployee()
  const failedToSaveMsg = t('failedToSave')

  // Initialize form data when employee changes
  useEffect(() => {
    setFormData({
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email ?? '',
      phone: employee.phone ?? '',
    })
  }, [employee])

  // Clear success message after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [successMessage])

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.firstName.trim()) {
      newErrors.firstName = t('firstNameRequired')
    } else if (formData.firstName.length > 100) {
      newErrors.firstName = t('firstNameMaxLength')
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = t('lastNameRequired')
    } else if (formData.lastName.length > 100) {
      newErrors.lastName = t('lastNameMaxLength')
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t('invalidEmail')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleCancel = () => {
    setFormData({
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email ?? '',
      phone: employee.phone ?? '',
    })
    setErrors({})
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (!validateForm()) return

    try {
      await updateEmployee.mutateAsync({
        id: employee.id,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
      })
      setIsEditing(false)
      setSuccessMessage(t('personalInfoUpdated'))
    } catch {
      setErrors({ firstName: failedToSaveMsg })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('personalInformation')}</CardTitle>
        <CardDescription>{t('personalDetails')}</CardDescription>
        <CardAction>
          {isEditing ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                disabled={updateEmployee.isPending}
              >
                <X className="mr-1 h-4 w-4" />
                {tc('cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateEmployee.isPending}
              >
                <Check className="mr-1 h-4 w-4" />
                {updateEmployee.isPending ? tc('saving') : tc('save')}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
              <Pencil className="mr-1 h-4 w-4" />
              {tc('edit')}
            </Button>
          )}
        </CardAction>
      </CardHeader>

      <CardContent>
        {successMessage && (
          <Alert className="mb-4 border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            <CheckCircle className="h-4 w-4" />
            <span className="ml-2">{successMessage}</span>
          </Alert>
        )}

        {errors.firstName && errors.firstName === failedToSaveMsg && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <span className="ml-2">{errors.firstName}</span>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {/* First Name */}
          <div className="space-y-2">
            <Label htmlFor="firstName">{t('firstName')}</Label>
            {isEditing ? (
              <>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, firstName: e.target.value }))
                  }
                  className={errors.firstName && errors.firstName !== failedToSaveMsg ? 'border-destructive' : ''}
                />
                {errors.firstName && errors.firstName !== failedToSaveMsg && (
                  <p className="text-xs text-destructive">{errors.firstName}</p>
                )}
              </>
            ) : (
              <p className="text-sm font-medium">{employee.firstName}</p>
            )}
          </div>

          {/* Last Name */}
          <div className="space-y-2">
            <Label htmlFor="lastName">{t('lastName')}</Label>
            {isEditing ? (
              <>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, lastName: e.target.value }))
                  }
                  className={errors.lastName ? 'border-destructive' : ''}
                />
                {errors.lastName && (
                  <p className="text-xs text-destructive">{errors.lastName}</p>
                )}
              </>
            ) : (
              <p className="text-sm font-medium">{employee.lastName}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">{t('emailLabel')}</Label>
            {isEditing ? (
              <>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className={errors.email ? 'border-destructive' : ''}
                  placeholder={t('emailPlaceholder')}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email}</p>
                )}
              </>
            ) : (
              <p className="text-sm font-medium">
                {employee.email || <span className="text-muted-foreground">{t('notSet')}</span>}
              </p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone">{t('phone')}</Label>
            {isEditing ? (
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder={t('phonePlaceholder')}
              />
            ) : (
              <p className="text-sm font-medium">
                {employee.phone || <span className="text-muted-foreground">{t('notSet')}</span>}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
