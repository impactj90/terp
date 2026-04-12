import type { DemoTemplate } from "./types"
import { industriedienstleister150 } from "./templates/industriedienstleister_150"

const REGISTRY: Record<string, DemoTemplate> = {
  [industriedienstleister150.key]: industriedienstleister150,
}

export function getDemoTemplate(key: string): DemoTemplate {
  const tpl = REGISTRY[key]
  if (!tpl) {
    throw new Error(`Unknown demo template: ${key}`)
  }
  return tpl
}

export function listDemoTemplates(): Array<
  Pick<DemoTemplate, "key" | "label" | "description">
> {
  return Object.values(REGISTRY).map((t) => ({
    key: t.key,
    label: t.label,
    description: t.description,
  }))
}

export const DEFAULT_DEMO_TEMPLATE = industriedienstleister150.key
