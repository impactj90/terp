import { Liquid } from "liquidjs"

/**
 * Creates a sandboxed LiquidJS engine instance.
 * - No filesystem access (no `root`/`fs` options provided)
 * - No network access (LiquidJS provides none by default)
 * - No global variables
 * - `ownPropertyOnly` prevents prototype-chain traversal
 *
 * Used by the export-engine to render user-defined export templates
 * (DATEV LODAS, LuG, Lexware, SAGE, generic CSV).
 */
export function createSandboxedEngine(): Liquid {
  const engine = new Liquid({
    ownPropertyOnly: true,
    strictFilters: true,
    strictVariables: false,
    globals: {},
  })

  registerDatevFilters(engine)

  return engine
}

function registerDatevFilters(engine: Liquid): void {
  // datev_date: Format date for DATEV (TT.MM.JJJJ default)
  engine.registerFilter(
    "datev_date",
    (value: string | Date | null | undefined, format?: string) => {
      if (value === null || value === undefined || value === "") return ""
      const date = value instanceof Date ? value : new Date(value)
      if (isNaN(date.getTime())) return ""
      const dd = String(date.getUTCDate()).padStart(2, "0")
      const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
      const yyyy = String(date.getUTCFullYear())
      switch (format) {
        case "TTMMJJJJ":
          return `${dd}${mm}${yyyy}`
        case "JJJJMMTT":
          return `${yyyy}${mm}${dd}`
        case "TT.MM.JJJJ":
        default:
          return `${dd}.${mm}.${yyyy}`
      }
    },
  )

  // datev_decimal: German decimal format (comma separator)
  engine.registerFilter(
    "datev_decimal",
    (value: number | string | null | undefined, decimals?: number) => {
      const num = typeof value === "string" ? Number(value) : value
      if (num === null || num === undefined || Number.isNaN(num)) return "0,00"
      const d = decimals ?? 2
      return (num as number).toFixed(d).replace(".", ",")
    },
  )

  // datev_string: Escape strings for DATEV semicolon-delimited fields
  engine.registerFilter("datev_string", (value: string | null | undefined) => {
    if (value === null || value === undefined) return ""
    const s = String(value)
    if (s.length === 0) return ""
    if (s.includes(";") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  })

  // pad_left: Pad value on the left to a fixed length
  engine.registerFilter(
    "pad_left",
    (value: string | number | null | undefined, length: number, char?: string) => {
      const s = value === null || value === undefined ? "" : String(value)
      const padChar = char ?? " "
      return s.padStart(length, padChar.length > 0 ? padChar : " ")
    },
  )

  // pad_right: Pad value on the right to a fixed length
  engine.registerFilter(
    "pad_right",
    (value: string | number | null | undefined, length: number, char?: string) => {
      const s = value === null || value === undefined ? "" : String(value)
      const padChar = char ?? " "
      return s.padEnd(length, padChar.length > 0 ? padChar : " ")
    },
  )

  // mask_iban: Show only first 4 and last 4 characters
  engine.registerFilter("mask_iban", (value: string | null | undefined) => {
    if (value === null || value === undefined) return ""
    const s = String(value).replace(/\s+/g, "")
    if (s.length < 8) return s
    return s.slice(0, 4) + "****" + s.slice(-4)
  })

  // terp_value: Resolve a payroll-wage terpSource against an employee context.
  // - "account:<CODE>" → employee.accountValues[CODE]
  // - any other string → employee.monthlyValues[terpSource]
  // Falls back to 0 on miss (keeps datev_decimal chain numeric-safe).
  engine.registerFilter(
    "terp_value",
    (
      terpSource: string | null | undefined,
      employee:
        | {
            accountValues?: Record<string, number> | null
            monthlyValues?: Record<string, number> | null
          }
        | null
        | undefined,
    ) => {
      if (!terpSource || !employee) return 0
      if (terpSource.startsWith("account:")) {
        const code = terpSource.slice("account:".length)
        return employee.accountValues?.[code] ?? 0
      }
      return employee.monthlyValues?.[terpSource] ?? 0
    },
  )
}
