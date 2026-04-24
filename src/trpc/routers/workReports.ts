/**
 * WorkReports Router
 *
 * tRPC procedures for Arbeitsscheine (work reports). Exposes DRAFT CRUD
 * (Phase 2), Assignments sub-router (Phase 3), Attachments sub-router
 * (Phase 4), PDF download (Phase 5), sign (Phase 6) and void (Phase 7).
 * The UI (Phase 8) is layered in via subsequent plan phases.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as workReportService from "@/lib/services/work-report-service"
import * as workReportAssignmentService from "@/lib/services/work-report-assignment-service"
import * as workReportAttachmentService from "@/lib/services/work-report-attachment-service"
import * as workReportPdfService from "@/lib/services/work-report-pdf-service"
import type { WorkReportAssignmentWithIncludes } from "@/lib/services/work-report-assignment-repository"
import type { WorkReportWithIncludes } from "@/lib/services/work-report-repository"
import type { WorkReportAttachment } from "@/generated/prisma/client"

// --- Permission Constants ---
//
// These UUIDs are registered in `permission-catalog.ts` and assigned to
// system groups (ADMIN/PERSONAL/VERTRIEB/MITARBEITER) via migration
// `20260506000002_add_work_report_permissions_to_groups.sql`.
const WORK_REPORTS_VIEW = permissionIdByKey("work_reports.view")!
const WORK_REPORTS_MANAGE = permissionIdByKey("work_reports.manage")!
const WORK_REPORTS_SIGN = permissionIdByKey("work_reports.sign")!
const WORK_REPORTS_VOID = permissionIdByKey("work_reports.void")!

// --- Output Types ---

export interface WorkReportOutput {
  id: string
  tenantId: string
  orderId: string
  serviceObjectId: string | null
  code: string
  visitDate: string // ISO-Date (yyyy-mm-dd)
  travelMinutes: number | null
  workDescription: string | null
  status: "DRAFT" | "SIGNED" | "VOID"
  signedAt: string | null
  signedById: string | null
  signerName: string | null
  signerRole: string | null
  signerIpHash: string | null
  signaturePath: string | null
  pdfUrl: string | null
  voidedAt: string | null
  voidedById: string | null
  voidReason: string | null
  createdAt: string
  updatedAt: string
  createdById: string | null
  order: { id: string; code: string; name: string; customer: string | null } | null
  serviceObject: {
    id: string
    number: string
    name: string
    kind: string
  } | null
  assignments: {
    id: string
    workReportId: string
    employeeId: string
    role: string | null
    createdAt: string
    employee: {
      id: string
      firstName: string
      lastName: string
      personnelNumber: string | null
    }
  }[]
  attachments: {
    id: string
    workReportId: string
    filename: string
    storagePath: string
    mimeType: string
    sizeBytes: number
    createdAt: string
    createdById: string | null
  }[]
}

export interface WorkReportAssignmentOutput {
  id: string
  tenantId: string
  workReportId: string
  employeeId: string
  role: string | null
  createdAt: string
  workReport: {
    id: string
    code: string
    status: "DRAFT" | "SIGNED" | "VOID"
  }
  employee: {
    id: string
    firstName: string
    lastName: string
    personnelNumber: string | null
  }
}

export interface WorkReportAttachmentOutput {
  id: string
  tenantId: string
  workReportId: string
  filename: string
  storagePath: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  createdById: string | null
  downloadUrl: string | null
}

/**
 * Maps a Prisma WorkReport record (with the standard include) into the
 * API output shape. Converts Dates to ISO strings and normalizes the
 * visit date to `yyyy-mm-dd` (dropping the time component introduced
 * by Prisma's DateTime).
 */
export function mapWorkReportToOutput(
  r: WorkReportWithIncludes,
): WorkReportOutput {
  return {
    id: r.id,
    tenantId: r.tenantId,
    orderId: r.orderId,
    serviceObjectId: r.serviceObjectId ?? null,
    code: r.code,
    visitDate: r.visitDate.toISOString().slice(0, 10),
    travelMinutes: r.travelMinutes ?? null,
    workDescription: r.workDescription ?? null,
    status: r.status,
    signedAt: r.signedAt ? r.signedAt.toISOString() : null,
    signedById: r.signedById ?? null,
    signerName: r.signerName ?? null,
    signerRole: r.signerRole ?? null,
    signerIpHash: r.signerIpHash ?? null,
    signaturePath: r.signaturePath ?? null,
    pdfUrl: r.pdfUrl ?? null,
    voidedAt: r.voidedAt ? r.voidedAt.toISOString() : null,
    voidedById: r.voidedById ?? null,
    voidReason: r.voidReason ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdById: r.createdById ?? null,
    order: r.order
      ? {
          id: r.order.id,
          code: r.order.code,
          name: r.order.name,
          customer: r.order.customer ?? null,
        }
      : null,
    serviceObject: r.serviceObject
      ? {
          id: r.serviceObject.id,
          number: r.serviceObject.number,
          name: r.serviceObject.name,
          kind: r.serviceObject.kind,
        }
      : null,
    assignments: (r.assignments ?? []).map((a) => ({
      id: a.id,
      workReportId: a.workReportId,
      employeeId: a.employeeId,
      role: a.role ?? null,
      createdAt: a.createdAt.toISOString(),
      employee: {
        id: a.employee.id,
        firstName: a.employee.firstName,
        lastName: a.employee.lastName,
        personnelNumber: a.employee.personnelNumber ?? null,
      },
    })),
    attachments: (r.attachments ?? []).map((att) => ({
      id: att.id,
      workReportId: att.workReportId,
      filename: att.filename,
      storagePath: att.storagePath,
      mimeType: att.mimeType,
      sizeBytes: att.sizeBytes,
      createdAt: att.createdAt.toISOString(),
      createdById: att.createdById ?? null,
    })),
  }
}

function mapAssignmentToOutput(
  a: WorkReportAssignmentWithIncludes,
): WorkReportAssignmentOutput {
  return {
    id: a.id,
    tenantId: a.tenantId,
    workReportId: a.workReportId,
    employeeId: a.employeeId,
    role: a.role ?? null,
    createdAt: a.createdAt.toISOString(),
    workReport: {
      id: a.workReport.id,
      code: a.workReport.code,
      status: a.workReport.status,
    },
    employee: {
      id: a.employee.id,
      firstName: a.employee.firstName,
      lastName: a.employee.lastName,
      personnelNumber: a.employee.personnelNumber ?? null,
    },
  }
}

function mapAttachmentToOutput(
  a: WorkReportAttachment & { downloadUrl?: string | null },
): WorkReportAttachmentOutput {
  return {
    id: a.id,
    tenantId: a.tenantId,
    workReportId: a.workReportId,
    filename: a.filename,
    storagePath: a.storagePath,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    createdAt: a.createdAt.toISOString(),
    createdById: a.createdById ?? null,
    downloadUrl: a.downloadUrl ?? null,
  }
}

// --- Input Schemas ---

// Loose UUID shape check (36 hex-dashed chars) — deliberately not
// Zod's strict `.uuid()` helper because Zod v4's RFC-9562 regex
// rejects legacy seed IDs like `00000000-0000-0000-0000-000000000b11`
// (version nibble `0` is not in `[1-8]`). PostgreSQL accepts these
// as valid `uuid` values; tenant-scoped service lookups remain the
// real security guard.
const uuidField = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID format",
  )

const STATUS_ENUM = z.enum(["DRAFT", "SIGNED", "VOID"])

const listInput = z
  .object({
    status: STATUS_ENUM.optional(),
    orderId: uuidField.optional(),
    serviceObjectId: uuidField.optional(),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .optional()

const createInput = z.object({
  orderId: uuidField,
  serviceObjectId: uuidField.nullable().optional(),
  visitDate: z.string().date(),
  travelMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  workDescription: z.string().max(5000).nullable().optional(),
})

const updateInput = z.object({
  id: uuidField,
  visitDate: z.string().date().optional(),
  travelMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  workDescription: z.string().max(5000).nullable().optional(),
  serviceObjectId: uuidField.nullable().optional(),
})

const assignmentAddInput = z.object({
  workReportId: uuidField,
  employeeId: uuidField,
  role: z.string().max(50).nullable().optional(),
})

const attachmentGetUploadUrlInput = z.object({
  workReportId: uuidField,
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
})

const attachmentConfirmUploadInput = z.object({
  workReportId: uuidField,
  storagePath: z.string().min(1).max(500),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
})

const signInput = z.object({
  id: uuidField,
  signerName: z.string().min(2).max(255),
  signerRole: z.string().min(2).max(100),
  // Enforce PNG-data-URL prefix and cap at ~2 MB (base64 ≈ 1.34× byte
  // overhead, and the service layer re-checks the decoded buffer against
  // the hard 1 MiB bucket limit).
  signatureDataUrl: z
    .string()
    .regex(/^data:image\/png;base64,/, "Signature must be a PNG data URL")
    .max(2_000_000),
})

const voidInput = z.object({
  id: uuidField,
  // 10 characters minimum so operators can't click through with a
  // placeholder like "x" — the service layer re-checks this as
  // defence-in-depth for scripted callers.
  reason: z.string().min(10).max(2000),
})

// --- Router ---

export const workReportsRouter = createTRPCRouter({
  /**
   * workReports.list — Paginated list with optional filters.
   *
   * Supports status, orderId, and serviceObjectId filters. Defaults to
   * the 50 most recent records by visit date.
   */
  list: tenantProcedure
    .use(requirePermission(WORK_REPORTS_VIEW, WORK_REPORTS_MANAGE))
    .input(listInput)
    .query(async ({ ctx, input }) => {
      try {
        const { items, total } = await workReportService.list(
          ctx.prisma,
          ctx.tenantId!,
          input,
        )
        return {
          items: items.map(mapWorkReportToOutput),
          total,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * workReports.getById — Returns a single record with all includes.
   */
  getById: tenantProcedure
    .use(requirePermission(WORK_REPORTS_VIEW, WORK_REPORTS_MANAGE))
    .input(z.object({ id: uuidField }))
    .query(async ({ ctx, input }) => {
      try {
        const report = await workReportService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
        )
        return mapWorkReportToOutput(report)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * workReports.listByOrder — All WorkReports for a given Order,
   * newest first. Used by the Order-detail "Arbeitsscheine" tab.
   */
  listByOrder: tenantProcedure
    .use(requirePermission(WORK_REPORTS_VIEW, WORK_REPORTS_MANAGE))
    .input(z.object({ orderId: uuidField }))
    .query(async ({ ctx, input }) => {
      try {
        const items = await workReportService.listByOrder(
          ctx.prisma,
          ctx.tenantId!,
          input.orderId,
        )
        return { items: items.map(mapWorkReportToOutput) }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * workReports.listByServiceObject — Recent WorkReports for a given
   * ServiceObject. Used by the ServiceObject-detail "Arbeitsscheine"
   * tab with a configurable limit (default 20).
   */
  listByServiceObject: tenantProcedure
    .use(requirePermission(WORK_REPORTS_VIEW, WORK_REPORTS_MANAGE))
    .input(
      z.object({
        serviceObjectId: uuidField,
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const items = await workReportService.listByServiceObject(
          ctx.prisma,
          ctx.tenantId!,
          input.serviceObjectId,
          input.limit,
        )
        return { items: items.map(mapWorkReportToOutput) }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * workReports.create — Creates a new DRAFT WorkReport.
   *
   * Validates Order / ServiceObject tenant ownership, allocates the
   * next `AS-<n>` code via number-sequence-service, and writes an
   * audit log row.
   */
  create: tenantProcedure
    .use(requirePermission(WORK_REPORTS_MANAGE))
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const created = await workReportService.create(
          ctx.prisma,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
        return mapWorkReportToOutput(created)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * workReports.update — Updates a DRAFT WorkReport.
   *
   * Status guard: only DRAFT records are editable. SIGNED/VOID return
   * BAD_REQUEST via WorkReportNotEditableError.
   */
  update: tenantProcedure
    .use(requirePermission(WORK_REPORTS_MANAGE))
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const updated = await workReportService.update(
          ctx.prisma,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
        return mapWorkReportToOutput(updated)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * workReports.delete — Deletes a DRAFT WorkReport.
   *
   * Status guard: only DRAFT records are deletable. Cascades to
   * WorkReportAssignment and WorkReportAttachment via DB-level
   * ON DELETE CASCADE (set in the migration).
   */
  delete: tenantProcedure
    .use(requirePermission(WORK_REPORTS_MANAGE))
    .input(z.object({ id: uuidField }))
    .mutation(async ({ ctx, input }) => {
      try {
        await workReportService.remove(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
        return { success: true as const }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * workReports.downloadPdf — Returns a short-lived signed URL pointing
   * at the Arbeitsschein PDF.
   *
   * Behavior branches on record status:
   *   - DRAFT: every call re-renders fresh (work is still in flight).
   *   - SIGNED: returns the persisted archive. Falls back to a fresh
   *     render when the sign-time upload failed (best-effort), so the
   *     operator always gets a link.
   *   - VOID: renders a fresh PDF with the diagonal "STORNIERT" overlay
   *     on top of the preserved signature (Phase 7).
   *
   * Declared as a mutation — the server may upload a fresh PDF to
   * storage as a side effect, which React Query should not cache.
   */
  downloadPdf: tenantProcedure
    .use(requirePermission(WORK_REPORTS_VIEW, WORK_REPORTS_MANAGE))
    .input(z.object({ id: uuidField }))
    .mutation(async ({ ctx, input }) => {
      try {
        const report = await workReportService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
        )

        if (report.status === "SIGNED") {
          const persisted = await workReportPdfService.getPersistedDownloadUrl(
            ctx.prisma,
            ctx.tenantId!,
            input.id,
          )
          if (persisted) return persisted
          // Fallback: the sign-time PDF write was best-effort. Regenerate
          // so the operator isn't blocked.
          return await workReportPdfService.generateAndGetDownloadUrl(
            ctx.prisma,
            ctx.tenantId!,
            input.id,
          )
        }

        if (report.status === "VOID") {
          return await workReportPdfService.generateVoidedOverlay(
            ctx.prisma,
            ctx.tenantId!,
            input.id,
          )
        }

        // DRAFT — always fresh render
        return await workReportPdfService.generateAndGetDownloadUrl(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * workReports.sign — DRAFT → SIGNED transition.
   *
   * Requires the `work_reports.sign` permission (distinct from
   * `work_reports.manage` so operators can separate "edit the draft" from
   * "commit the signature" responsibilities).
   *
   * Preconditions enforced by the service:
   *   - Record is still in DRAFT
   *   - `workDescription` is non-empty
   *   - At least one assignment exists
   *
   * Side effects inside `sign()`:
   *   - Signature PNG uploaded to `workreport-signatures`
   *   - SIGNED status, signer metadata and IP hash committed atomically
   *   - PDF archived to `documents/arbeitsscheine/…pdf` (best-effort)
   *   - `audit_logs` row with `action: "sign"`
   */
  sign: tenantProcedure
    .use(requirePermission(WORK_REPORTS_SIGN))
    .input(signInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await workReportService.sign(
          ctx.prisma,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
        return mapWorkReportToOutput(result)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * workReports.void — SIGNED → VOID transition.
   *
   * Requires the dedicated `work_reports.void` permission (distinct from
   * `work_reports.manage` and `work_reports.sign`): by default only ADMIN
   * gets it so operators can prevent field staff from cancelling
   * legally-binding signatures.
   *
   * Preconditions enforced by the service:
   *   - Record is still in SIGNED (DRAFT cannot be voided — use delete,
   *     and VOID is terminal).
   *   - Reason is at least 10 characters after trimming.
   *
   * Side effects:
   *   - Status, voidedAt, voidedById and voidReason committed atomically.
   *   - `audit_logs` row with `action: "void"` and the reason in metadata.
   *
   * The archived signed PDF at `arbeitsscheine/{tenantId}/{id}.pdf`
   * stays untouched; the VOID branch of `downloadPdf` renders a fresh
   * PDF with the diagonal "STORNIERT" overlay on top of the preserved
   * signature.
   */
  void: tenantProcedure
    .use(requirePermission(WORK_REPORTS_VOID))
    .input(voidInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await workReportService.voidReport(
          ctx.prisma,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
        return mapWorkReportToOutput(result)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  assignments: createTRPCRouter({
    /**
     * workReports.assignments.list — Lists employees assigned to a
     * WorkReport. SIGNED/VOID records remain readable.
     */
    list: tenantProcedure
      .use(requirePermission(WORK_REPORTS_VIEW, WORK_REPORTS_MANAGE))
      .input(z.object({ workReportId: uuidField }))
      .query(async ({ ctx, input }) => {
        try {
          const items = await workReportAssignmentService.listByWorkReport(
            ctx.prisma,
            ctx.tenantId!,
            input.workReportId,
          )
          return { items: items.map(mapAssignmentToOutput) }
        } catch (err) {
          handleServiceError(err)
        }
      }),

    /**
     * workReports.assignments.add — Adds an employee to a DRAFT
     * WorkReport. Each employee may appear at most once per report —
     * a second add for the same employee (regardless of role) returns
     * CONFLICT.
     */
    add: tenantProcedure
      .use(requirePermission(WORK_REPORTS_MANAGE))
      .input(assignmentAddInput)
      .mutation(async ({ ctx, input }) => {
        try {
          const created = await workReportAssignmentService.add(
            ctx.prisma,
            ctx.tenantId!,
            input,
            {
              userId: ctx.user!.id,
              ipAddress: ctx.ipAddress,
              userAgent: ctx.userAgent,
            },
          )
          return mapAssignmentToOutput(created)
        } catch (err) {
          handleServiceError(err)
        }
      }),

    /**
     * workReports.assignments.remove — Removes an assignment from a
     * DRAFT WorkReport.
     */
    remove: tenantProcedure
      .use(requirePermission(WORK_REPORTS_MANAGE))
      .input(z.object({ id: uuidField }))
      .mutation(async ({ ctx, input }) => {
        try {
          await workReportAssignmentService.remove(
            ctx.prisma,
            ctx.tenantId!,
            input.id,
            {
              userId: ctx.user!.id,
              ipAddress: ctx.ipAddress,
              userAgent: ctx.userAgent,
            },
          )
          return { success: true as const }
        } catch (err) {
          handleServiceError(err)
        }
      }),
  }),

  attachments: createTRPCRouter({
    /**
     * workReports.attachments.list — Lists attachments on a WorkReport
     * with short-lived signed download URLs. Readable in any status
     * (DRAFT / SIGNED / VOID).
     */
    list: tenantProcedure
      .use(requirePermission(WORK_REPORTS_VIEW, WORK_REPORTS_MANAGE))
      .input(z.object({ workReportId: uuidField }))
      .query(async ({ ctx, input }) => {
        try {
          const items = await workReportAttachmentService.listAttachments(
            ctx.prisma,
            ctx.tenantId!,
            input.workReportId,
          )
          return { items: items.map(mapAttachmentToOutput) }
        } catch (err) {
          handleServiceError(err)
        }
      }),

    /**
     * workReports.attachments.getUploadUrl — Stage 1 of the 3-step upload
     * flow. Returns a signed PUT URL the client can upload directly to.
     *
     * Parent WorkReport must be DRAFT. MIME type is validated; the returned
     * storage path is namespaced `${tenantId}/${workReportId}/${uuid}.${ext}`.
     */
    getUploadUrl: tenantProcedure
      .use(requirePermission(WORK_REPORTS_MANAGE))
      .input(attachmentGetUploadUrlInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await workReportAttachmentService.getUploadUrl(
            ctx.prisma,
            ctx.tenantId!,
            input.workReportId,
            input.filename,
            input.mimeType,
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    /**
     * workReports.attachments.confirmUpload — Stage 3 of the 3-step
     * upload flow. Re-validates MIME/size/path-prefix and inserts the
     * DB row. Writes an audit entry attributed to the parent
     * WorkReport (`entityType: "work_report"`).
     */
    confirmUpload: tenantProcedure
      .use(requirePermission(WORK_REPORTS_MANAGE))
      .input(attachmentConfirmUploadInput)
      .mutation(async ({ ctx, input }) => {
        try {
          const attachment = await workReportAttachmentService.confirmUpload(
            ctx.prisma,
            ctx.tenantId!,
            input.workReportId,
            input.storagePath,
            input.filename,
            input.mimeType,
            input.sizeBytes,
            ctx.user!.id,
            {
              userId: ctx.user!.id,
              ipAddress: ctx.ipAddress,
              userAgent: ctx.userAgent,
            },
          )
          return mapAttachmentToOutput(attachment)
        } catch (err) {
          handleServiceError(err)
        }
      }),

    /**
     * workReports.attachments.getDownloadUrl — Returns a short-lived
     * signed URL (5 min expiry) for downloading a single attachment.
     * Readable in any parent status.
     */
    getDownloadUrl: tenantProcedure
      .use(requirePermission(WORK_REPORTS_VIEW, WORK_REPORTS_MANAGE))
      .input(z.object({ attachmentId: uuidField }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await workReportAttachmentService.getDownloadUrl(
            ctx.prisma,
            ctx.tenantId!,
            input.attachmentId,
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    /**
     * workReports.attachments.remove — Deletes an attachment's DB row
     * and storage blob (best-effort). Parent WorkReport must be DRAFT.
     */
    remove: tenantProcedure
      .use(requirePermission(WORK_REPORTS_MANAGE))
      .input(z.object({ attachmentId: uuidField }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await workReportAttachmentService.remove(
            ctx.prisma,
            ctx.tenantId!,
            input.attachmentId,
            {
              userId: ctx.user!.id,
              ipAddress: ctx.ipAddress,
              userAgent: ctx.userAgent,
            },
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),
  }),
})
