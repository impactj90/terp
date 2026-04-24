/**
 * Create-WorkReport page — `/admin/work-reports/new`.
 *
 * Thin wrapper around `WorkReportFormSheet` in create mode. Supports
 * `?orderId=...` and `?serviceObjectId=...` query params so the flow can
 * be launched from the Order-detail tab or ServiceObject-detail tab with
 * the parent pre-selected.
 *
 * On success the user is routed to the new record's detail page.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 8)
 */
"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { useAuth } from "@/providers/auth-provider"
import { useHasPermission } from "@/hooks"

import { WorkReportFormSheet } from "@/components/work-reports/work-report-form-sheet"
import { Skeleton } from "@/components/ui/skeleton"

export default function NewWorkReportPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission([
    "work_reports.manage",
  ])

  const [open, setOpen] = React.useState(true)

  const defaultOrderId = searchParams?.get("orderId") ?? null
  const defaultServiceObjectId = searchParams?.get("serviceObjectId") ?? null

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push("/dashboard")
    }
  }, [authLoading, permLoading, canAccess, router])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      // Closing without save → back to list.
      router.push("/admin/work-reports")
    }
  }

  function handleSuccess(result: { id: string }) {
    router.push(`/admin/work-reports/${result.id}`)
  }

  if (authLoading || permLoading || !canAccess) {
    return (
      <div className="space-y-2 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <WorkReportFormSheet
      open={open}
      onOpenChange={handleOpenChange}
      defaultOrderId={defaultOrderId}
      defaultServiceObjectId={defaultServiceObjectId}
      onSuccess={handleSuccess}
    />
  )
}
