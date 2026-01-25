'use client'

import { Moon, Sun, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/providers/theme-provider'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      aria-label={`Current theme: ${theme}. Click to change.`}
    >
      {theme === 'light' && <Sun className="size-5" />}
      {theme === 'dark' && <Moon className="size-5" />}
      {theme === 'system' && <Monitor className="size-5" />}
    </Button>
  )
}
