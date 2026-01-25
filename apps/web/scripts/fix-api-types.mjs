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

// Add type helpers after the initial comment block
const typeHelpers = `
// Type helpers for nested array elements (auto-generated fix)
type EmployeeContact = NonNullable<components["schemas"]["Employee"]["contacts"]>[number];
type EmployeeCard = NonNullable<components["schemas"]["Employee"]["cards"]>[number];
`

// Insert type helpers after the export interface paths declaration ends
// We'll add them right before the operations section
const operationsIndex = content.indexOf('export interface operations {')
if (operationsIndex !== -1) {
  content = content.slice(0, operationsIndex) + typeHelpers + '\n' + content.slice(operationsIndex)
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

// Write the fixed content back
writeFileSync(typesPath, content)

console.log('Fixed API types: added type helpers for EmployeeContact and EmployeeCard')
