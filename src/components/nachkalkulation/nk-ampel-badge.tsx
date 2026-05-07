/**
 * Nachkalkulation Ampel Badge (NK-1, Phase 8)
 *
 * Visual semaphore for Marge / Productivity classification.
 */
"use client"

import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type AmpelStatus = "red" | "amber" | "green"

export function NkAmpelBadge({
  status,
  label,
}: {
  status: AmpelStatus
  label?: string
}) {
  const t = useTranslations("nachkalkulation.ampel")
  const text = label ?? t(status)
  return (
    <Badge
      variant={status === "red" ? "destructive" : "outline"}
      className={cn(
        status === "amber" &&
          "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700",
        status === "green" &&
          "bg-green-100 text-green-900 border-green-300 dark:bg-green-950 dark:text-green-200 dark:border-green-700",
      )}
    >
      {text}
    </Badge>
  )
}
