/**
 * NK Estimated Components Drill-Down Sheet (NK-1, Phase 8)
 *
 * Renders the list of estimated components from the IstAufwandReport.
 */
"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

interface NkEstimatedDrillSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  estimatedShare: number
  estimatedComponents: string[]
}

const COMPONENT_LABEL_KEY: Record<
  string,
  "componentLabor" | "componentTravel" | "componentMaterial"
> = {
  labor: "componentLabor",
  travel: "componentTravel",
  material: "componentMaterial",
}

export function NkEstimatedDrillSheet({
  open,
  onOpenChange,
  estimatedShare,
  estimatedComponents,
}: NkEstimatedDrillSheetProps) {
  const t = useTranslations("nachkalkulation.estimated")

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t("drillTitle")}</SheetTitle>
          <SheetDescription>{t("drillSubtitle")}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-4">
              <Badge variant="outline">
                {(estimatedShare * 100).toFixed(1)} %
              </Badge>
              <p className="mt-2 text-sm">{t("bannerBody", {
                percent: (estimatedShare * 100).toFixed(0),
              })}</p>
            </div>

            <ul className="space-y-2">
              {estimatedComponents.map((c) => {
                const labelKey = COMPONENT_LABEL_KEY[c]
                return (
                  <li
                    key={c}
                    className="rounded-lg border px-3 py-2 text-sm flex items-center gap-3"
                  >
                    <span className="font-mono text-xs uppercase">{c}</span>
                    {labelKey && (
                      <span className="text-muted-foreground">
                        {t(labelKey)}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            {t("bannerCta")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
