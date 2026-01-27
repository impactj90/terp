'use client'

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Camera } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { User } from '@/hooks/use-auth'
import type { components } from '@/lib/api/types'

type Employee = components['schemas']['Employee']

interface ProfileHeaderProps {
  user: User
  employee: Employee
}

/**
 * Profile header showing avatar, name, role, and basic info.
 */
export function ProfileHeader({ user, employee }: ProfileHeaderProps) {
  const t = useTranslations('profile')

  const firstName = employee.first_name || ''
  const lastName = employee.last_name || ''
  const fullName = `${firstName} ${lastName}`.trim() || t('unknown')
  const initials = `${firstName.charAt(0) || '?'}${lastName.charAt(0) || '?'}`

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
      {/* Avatar with upload button */}
      <div className="relative">
        <Avatar className="h-24 w-24 text-2xl">
          <AvatarImage src={user.avatar_url ?? undefined} alt={fullName} />
          <AvatarFallback className="text-2xl font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full"
              disabled
            >
              <Camera className="h-4 w-4" />
              <span className="sr-only">{t('uploadAvatar')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('comingSoon')}</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Name and details */}
      <div className="flex flex-col items-center gap-2 sm:items-start">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">{fullName}</h2>
          <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
            {user.role === 'admin' ? t('administrator') : t('employee')}
          </Badge>
        </div>

        <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground sm:items-start">
          <p>
            <span className="font-medium">#{employee.personnel_number}</span>
            {employee.department && (
              <span className="ml-2 text-muted-foreground">
                {employee.department.name}
              </span>
            )}
          </p>
          {employee.email && (
            <p className="text-muted-foreground">{employee.email}</p>
          )}
        </div>
      </div>
    </div>
  )
}
