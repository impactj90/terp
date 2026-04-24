/**
 * WorkReport Attachment Repository
 *
 * Tenant-scoped Prisma access for photo/document attachments on
 * WorkReports. Attachment metadata lives in `work_report_attachments`;
 * binary blobs live in the `workreport-attachments` Supabase bucket
 * (see `work-report-attachment-service.ts`).
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 4)
 */
import type { PrismaClient, Prisma, WorkReportAttachment } from "@/generated/prisma/client"

type Tx = PrismaClient | Prisma.TransactionClient

export async function findMany(
  prisma: Tx,
  tenantId: string,
  workReportId: string,
): Promise<WorkReportAttachment[]> {
  return prisma.workReportAttachment.findMany({
    where: { tenantId, workReportId },
    orderBy: { createdAt: "desc" },
  })
}

export async function findById(
  prisma: Tx,
  tenantId: string,
  id: string,
): Promise<WorkReportAttachment | null> {
  return prisma.workReportAttachment.findFirst({
    where: { id, tenantId },
  })
}

export async function count(
  prisma: Tx,
  tenantId: string,
  workReportId: string,
): Promise<number> {
  return prisma.workReportAttachment.count({
    where: { tenantId, workReportId },
  })
}

export interface WorkReportAttachmentCreateData {
  tenantId: string
  workReportId: string
  filename: string
  storagePath: string
  mimeType: string
  sizeBytes: number
  createdById?: string | null
}

export async function create(
  prisma: Tx,
  data: WorkReportAttachmentCreateData,
): Promise<WorkReportAttachment> {
  return prisma.workReportAttachment.create({
    data: {
      tenantId: data.tenantId,
      workReportId: data.workReportId,
      filename: data.filename,
      storagePath: data.storagePath,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      createdById: data.createdById ?? null,
    },
  })
}

export async function deleteById(
  prisma: Tx,
  tenantId: string,
  id: string,
): Promise<boolean> {
  const { count } = await prisma.workReportAttachment.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
