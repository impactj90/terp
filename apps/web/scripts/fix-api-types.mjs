/**
 * Post-processing script for generated API types.
 *
 * This script fixes issues in the generated types.ts file that arise from
 * the OpenAPI spec using inline references to array items (e.g., Employee/properties/contacts/items).
 *
 * The fix adds type helpers and replaces problematic type expressions.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const typesPath = join(__dirname, '../src/lib/api/types.ts')

// Read the generated types file
let content = readFileSync(typesPath, 'utf-8')

const helperComment = '// Type helpers for nested array elements (auto-generated fix)'
const employeeContactLine =
  'type EmployeeContact = NonNullable<components["schemas"]["Employee"]["contacts"]>[number];'
const employeeCardLine =
  'type EmployeeCard = NonNullable<components["schemas"]["Employee"]["cards"]>[number];'
const tariffDayPlanLine =
  'type TariffDayPlan = NonNullable<components["schemas"]["CreateTariffRequest"]["day_plans"]>[number];'

// Insert type helpers right before the operations section if missing.
const operationsIndex = content.indexOf('export interface operations {')
if (operationsIndex !== -1 && !content.includes(helperComment)) {
  const typeHelpers = `
${helperComment}
${employeeContactLine}
${employeeCardLine}
${tariffDayPlanLine}
`
  content = content.slice(0, operationsIndex) + typeHelpers + '\n' + content.slice(operationsIndex)
}

// Ensure the tariff helper exists if older runs only injected employee helpers.
if (content.includes(helperComment) && !content.includes(tariffDayPlanLine)) {
  content = content.replace(employeeCardLine, `${employeeCardLine}\n${tariffDayPlanLine}`)
}

// Fix patterns that reference array items
// components["schemas"]["Employee"]["contacts"][number] -> EmployeeContact
content = content.replace(
  /components\["schemas"\]\["Employee"\]\["contacts"\]\["items"\]/g,
  'EmployeeContact'
)
content = content.replace(
  /components\["schemas"\]\["Employee"\]\["contacts"\]\[number\]/g,
  'EmployeeContact'
)

// components["schemas"]["Employee"]["cards"][number] -> EmployeeCard
content = content.replace(
  /components\["schemas"\]\["Employee"\]\["cards"\]\["items"\]/g,
  'EmployeeCard'
)
content = content.replace(
  /components\["schemas"\]\["Employee"\]\["cards"\]\[number\]/g,
  'EmployeeCard'
)

// components["schemas"]["CreateTariffRequest"]["day_plans"]["items"] -> TariffDayPlan
content = content.replace(
  /components\["schemas"\]\["CreateTariffRequest"\]\["day_plans"\]\["items"\]/g,
  'TariffDayPlan'
)

// Write the fixed content back
writeFileSync(typesPath, content)

console.log('Fixed API types: added type helpers for EmployeeContact and EmployeeCard')
