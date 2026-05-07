/**
 * Nachkalkulation "estimated" marker (NK-1, Phase 8, Decision 19)
 *
 * Renders the value with a leading "≈" tooltip when the underlying
 * value was computed from live-lookups instead of a snapshot.
 */
"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function NkEstimatedMarker({
  estimated,
  children,
}: {
  estimated: boolean
  children: React.ReactNode
}) {
  const t = useTranslations("nachkalkulation.estimated")
  if (!estimated) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-muted-foreground">≈ {children}</span>
      </TooltipTrigger>
      <TooltipContent>{t("tooltip")}</TooltipContent>
    </Tooltip>
  )
}
