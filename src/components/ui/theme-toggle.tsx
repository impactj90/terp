'use client'

import { useTranslations } from 'next-intl'
import { Moon, Sun, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTheme } from '@/providers/theme-provider'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const t = useTranslations('common')

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={cycleTheme}
          aria-label={t('switchTheme')}
        >
          {theme === 'light' && <Sun className="size-5" />}
          {theme === 'dark' && <Moon className="size-5" />}
          {theme === 'system' && <Monitor className="size-5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t('switchTheme')}</TooltipContent>
    </Tooltip>
  )
}
