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
import { buildZip, type ZipEntry } from "./zip-store-writer"

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
// Multi-file support (Phase 4.5)
// ──────────────────────────────────────────────────────────────────
//
// Templates can declare multiple output files via blocks of the form:
//
//   {% file "buchungen.txt" %}...liquid...{% endfile %}
//   {% file "stammdaten.txt" %}...liquid...{% endfile %}
//
// We intentionally do NOT register these as custom Liquid tags — the
// Liquid body inside each block still needs the full feature set of
// the standard engine. Instead we pre-process the raw template body
// with a regex, extract each `{% file %}...{% endfile %}` section,
// render each inner body as its own Liquid template, and ZIP the
// results. Templates without any `{% file %}` block behave exactly as
// before: single rendered file. This preserves full backwards
// compatibility with all Phase 2/3 templates.
//

const FILE_BLOCK_RE =
  /\{%\s*file\s+"([^"]+)"\s*%\}([\s\S]*?)\{%\s*endfile\s*%\}/g

export interface ParsedMultiFile {
  isMultiFile: boolean
  files: Array<{ filename: string; body: string }>
}

/**
 * Parses a template body and returns either an empty file list (when
 * no `{% file %}` blocks are present) or the list of file blocks.
 * Filenames are sanitised to prevent path traversal.
 */
export function parseMultiFileBody(body: string): ParsedMultiFile {
  const files: Array<{ filename: string; body: string }> = []
  let match: RegExpExecArray | null
  // The regex is stateful because of the `g` flag — reset before use.
  FILE_BLOCK_RE.lastIndex = 0
  while ((match = FILE_BLOCK_RE.exec(body)) !== null) {
    const rawName = match[1]!
    const innerBody = match[2]!
    const safeName = sanitizeFilename(rawName)
    files.push({ filename: safeName, body: innerBody })
  }
  if (files.length === 0) {
    return { isMultiFile: false, files: [] }
  }
  return { isMultiFile: true, files }
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/]/g, "_")
    .replace(/\.\./g, "_")
    .replace(/[\r\n]+/g, "")
    .trim()
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

  const parsed = parseMultiFileBody(tpl.templateBody)
  const timeoutMs = opts.timeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS

  let file: Buffer
  let filename: string

  if (parsed.isMultiFile) {
    // Render each file body individually, encode, ZIP together.
    const zipEntries: ZipEntry[] = []
    for (const f of parsed.files) {
      const renderedPart = await renderTemplate(f.body, context, timeoutMs)
      const encodedPart = encodeOutput(
        renderedPart,
        tpl.encoding,
        tpl.lineEnding,
      )
      if (encodedPart.byteLength > MAX_OUTPUT_BYTES) {
        throw new ExportTemplateSizeValidationError(
          `Encoded output for "${f.filename}" exceeds ${MAX_OUTPUT_BYTES} bytes`,
        )
      }
      // Render the filename too — templates may use `{{ period.year }}`.
      const renderedName = await renderFilename(f.filename, context)
      zipEntries.push({
        filename: renderedName || f.filename,
        content: encodedPart,
      })
    }
    file = buildZip(zipEntries)
    if (file.byteLength > MAX_OUTPUT_BYTES) {
      throw new ExportTemplateSizeValidationError(
        `Zipped output exceeds ${MAX_OUTPUT_BYTES} bytes`,
      )
    }
    const baseName = await renderFilename(
      tpl.outputFilename.replace(/\.(txt|csv|dat)$/i, ""),
      context,
    )
    filename = `${baseName || tpl.name}.zip`
  } else {
    const rendered = await renderTemplate(tpl.templateBody, context, timeoutMs)
    file = encodeOutput(rendered, tpl.encoding, tpl.lineEnding)
    if (file.byteLength > MAX_OUTPUT_BYTES) {
      throw new ExportTemplateSizeValidationError(
        `Encoded output exceeds ${MAX_OUTPUT_BYTES} bytes`,
      )
    }
    filename = await renderFilename(tpl.outputFilename, context)
  }

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
        multiFile: parsed.isMultiFile,
        fileCount: parsed.isMultiFile ? parsed.files.length : 1,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) => console.error("[AuditLog] Failed:", err))

  return {
    file,
    filename:
      filename ||
      `${tpl.name}_${input.year}${String(input.month).padStart(2, "0")}.${parsed.isMultiFile ? "zip" : "txt"}`,
    fileHash,
    employeeCount: context.employees.length,
    byteSize: file.byteLength,
    templateId: tpl.id,
    templateVersion: tpl.version,
  }
}
