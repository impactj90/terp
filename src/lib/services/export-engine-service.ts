/**
 * Export Engine Service (Phase 2)
 *
 * Loads a Liquid template, builds the export context, renders the
 * template inside a sandboxed engine, encodes the result and writes
 * an audit log entry. Used by `exportTemplates.testExport` and (later)
 * by the regular payroll export flow.
 *
 * Security guarantees:
 *   - Sandboxed engine (no filesystem / network / globals)
 *   - Render timeout (default 30s)
 *   - Maximum output size (100 MB)
 *   - SHA-256 file hash recorded in the audit log
 *   - Decrypted sensitive values are NEVER logged
 */
import { createHash } from "node:crypto"
import iconv from "iconv-lite"
import type { PrismaClient } from "@/generated/prisma/client"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import { createSandboxedEngine } from "./liquid-engine"
import {
  buildExportContext,
  type ExportContext,
} from "./export-context-builder"

// ──────────────────────────────────────────────────────────────────
// Errors
// ──────────────────────────────────────────────────────────────────

export class ExportTemplateNotFoundError extends Error {
  constructor() {
    super("Export template not found")
    this.name = "ExportTemplateNotFoundError"
  }
}

// Render / size / timeout failures are user-recoverable (template author
// can fix the template). They use the *ValidationError suffix so the
// existing handleServiceError maps them to BAD_REQUEST instead of 500.
export class ExportTemplateRenderValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ExportTemplateRenderValidationError"
  }
}

export class ExportTemplateSizeValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ExportTemplateSizeValidationError"
  }
}

export class ExportTemplateTimeoutValidationError extends Error {
  constructor(message = "Template render timeout") {
    super(message)
    this.name = "ExportTemplateTimeoutValidationError"
  }
}

// ──────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────

export const DEFAULT_RENDER_TIMEOUT_MS = 30_000
export const MAX_OUTPUT_BYTES = 100 * 1024 * 1024 // 100 MB

// ──────────────────────────────────────────────────────────────────
// Loaders
// ──────────────────────────────────────────────────────────────────

export async function loadTemplate(
  prisma: PrismaClient,
  tenantId: string,
  templateId: string,
) {
  const tpl = await prisma.exportTemplate.findFirst({
    where: { id: templateId, tenantId },
  })
  if (!tpl) throw new ExportTemplateNotFoundError()
  return tpl
}

// ──────────────────────────────────────────────────────────────────
// Render
// ──────────────────────────────────────────────────────────────────

export async function renderTemplate(
  templateBody: string,
  context: ExportContext,
  timeoutMs: number = DEFAULT_RENDER_TIMEOUT_MS,
): Promise<string> {
  const engine = createSandboxedEngine()

  let timeoutHandle: NodeJS.Timeout | undefined
  const renderPromise = engine.parseAndRender(templateBody, context as unknown as Record<string, unknown>)
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new ExportTemplateTimeoutValidationError()),
      timeoutMs,
    )
  })

  let result: string
  try {
    result = (await Promise.race([renderPromise, timeoutPromise])) as string
  } catch (err) {
    if (err instanceof ExportTemplateTimeoutValidationError) throw err
    const message = err instanceof Error ? err.message : String(err)
    throw new ExportTemplateRenderValidationError(message)
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }

  if (typeof result !== "string") {
    throw new ExportTemplateRenderValidationError("Template did not return a string")
  }
  if (Buffer.byteLength(result, "utf8") > MAX_OUTPUT_BYTES) {
    throw new ExportTemplateSizeValidationError(
      `Template output exceeds ${MAX_OUTPUT_BYTES} bytes`,
    )
  }
  return result
}

// ──────────────────────────────────────────────────────────────────
// Encoding
// ──────────────────────────────────────────────────────────────────

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])

export function encodeOutput(
  rendered: string,
  encoding: string,
  lineEnding: string,
): Buffer {
  // Normalize then re-apply line endings
  let text = rendered.replace(/\r\n/g, "\n")
  if (lineEnding === "crlf") {
    text = text.replace(/\n/g, "\r\n")
  }

  switch (encoding) {
    case "windows-1252":
      return iconv.encode(text, "win1252")
    case "utf-8-bom":
      return Buffer.concat([UTF8_BOM, Buffer.from(text, "utf8")])
    case "utf-8":
    default:
      return Buffer.from(text, "utf8")
  }
}

// ──────────────────────────────────────────────────────────────────
// Filename rendering
// ──────────────────────────────────────────────────────────────────

export async function renderFilename(
  pattern: string,
  context: ExportContext,
): Promise<string> {
  const engine = createSandboxedEngine()
  const out = (await engine.parseAndRender(
    pattern,
    context as unknown as Record<string, unknown>,
  )) as string
  // Strip path traversal and unsafe characters
  return out.replace(/[\\/]/g, "_").replace(/[\r\n]+/g, "").trim()
}

// ──────────────────────────────────────────────────────────────────
// Hash
// ──────────────────────────────────────────────────────────────────

export function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex")
}

// ──────────────────────────────────────────────────────────────────
// High-level entry points
// ──────────────────────────────────────────────────────────────────

export interface GenerateExportInput {
  templateId: string
  exportInterfaceId?: string | null
  year: number
  month: number
  employeeIds?: string[]
}

export interface GenerateExportResult {
  file: Buffer
  filename: string
  fileHash: string
  employeeCount: number
  byteSize: number
  templateId: string
  templateVersion: number
}

export async function generateExport(
  prisma: PrismaClient,
  tenantId: string,
  input: GenerateExportInput,
  audit: AuditContext,
  opts: { isTest?: boolean; timeoutMs?: number } = {},
): Promise<GenerateExportResult> {
  const tpl = await loadTemplate(prisma, tenantId, input.templateId)

  const context = await buildExportContext(prisma, {
    tenantId,
    exportInterfaceId: input.exportInterfaceId ?? undefined,
    templateId: input.templateId,
    year: input.year,
    month: input.month,
    employeeIds: input.employeeIds,
    template: {
      fieldSeparator: tpl.fieldSeparator,
      decimalSeparator: tpl.decimalSeparator,
      dateFormat: tpl.dateFormat,
      targetSystem: tpl.targetSystem,
    },
  })

  const rendered = await renderTemplate(
    tpl.templateBody,
    context,
    opts.timeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS,
  )

  const file = encodeOutput(rendered, tpl.encoding, tpl.lineEnding)
  if (file.byteLength > MAX_OUTPUT_BYTES) {
    throw new ExportTemplateSizeValidationError(
      `Encoded output exceeds ${MAX_OUTPUT_BYTES} bytes`,
    )
  }

  const filename = await renderFilename(tpl.outputFilename, context)
  const fileHash = sha256Hex(file)

  await auditLog
    .log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "export",
      entityType: "export_template",
      entityId: tpl.id,
      entityName: tpl.name,
      changes: null,
      metadata: {
        type: opts.isTest ? "test" : "export",
        templateVersion: tpl.version,
        year: input.year,
        month: input.month,
        employeeCount: context.employees.length,
        fileHash,
        byteSize: file.byteLength,
        encoding: tpl.encoding,
        targetSystem: tpl.targetSystem,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) => console.error("[AuditLog] Failed:", err))

  return {
    file,
    filename: filename || `${tpl.name}_${input.year}${String(input.month).padStart(2, "0")}.txt`,
    fileHash,
    employeeCount: context.employees.length,
    byteSize: file.byteLength,
    templateId: tpl.id,
    templateVersion: tpl.version,
  }
}
