'use client'

import { useTranslations } from 'next-intl'
import { Moon, Sun, Monitor, Palette, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/providers/theme-provider'

const APPEARANCE_OPTIONS = [
  { value: 'light' as const, icon: Sun, labelKey: 'themeLight' as const },
  { value: 'dark' as const, icon: Moon, labelKey: 'themeDark' as const },
  { value: 'system' as const, icon: Monitor, labelKey: 'themeSystem' as const },
]

const COLOR_THEME_OPTIONS = [
  { value: 'default' as const, labelKey: 'themeClassic' as const, color: 'hsl(217 91% 60%)' },
  { value: 'modern' as const, labelKey: 'themeModern' as const, color: 'hsl(164 65% 40%)' },
]

export function ThemeToggle() {
  const { appearance, setAppearance, colorTheme, setColorTheme } = useTheme()
  const t = useTranslations('common')

  const ActiveIcon =
    appearance === 'light' ? Sun : appearance === 'dark' ? Moon : Monitor

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={t('switchTheme')}
            >
              <ActiveIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('switchTheme')}</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-44">
        {/* Appearance section */}
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          {t('themeAppearance')}
        </DropdownMenuLabel>
        {APPEARANCE_OPTIONS.map(({ value, icon: Icon, labelKey }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setAppearance(value)}
            className="flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <Icon className="size-4" />
              {t(labelKey)}
            </span>
            {appearance === value && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* Color theme section */}
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          {t('themeColorScheme')}
        </DropdownMenuLabel>
        {COLOR_THEME_OPTIONS.map(({ value, labelKey, color }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setColorTheme(value)}
            className="flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <span
                className="size-3.5 rounded-full border border-border shrink-0"
                style={{ backgroundColor: color }}
              />
              {t(labelKey)}
            </span>
            {colorTheme === value && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
