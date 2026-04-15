import type { TenantTemplate } from "./types"
import { industriedienstleisterShowcase } from "./templates/industriedienstleister/showcase"
import { industriedienstleisterStarter } from "./templates/industriedienstleister/starter"

const REGISTRY: Record<string, TenantTemplate> = {
  [industriedienstleisterShowcase.key]: industriedienstleisterShowcase,
  [industriedienstleisterStarter.key]: industriedienstleisterStarter,
}

export function getTenantTemplate(key: string): TenantTemplate {
  const tpl = REGISTRY[key]
  if (!tpl) {
    throw new Error(`Unknown tenant template: ${key}`)
  }
  return tpl
}

export function listTenantTemplates(): Array<
  Pick<TenantTemplate, "key" | "label" | "description" | "industry" | "kind">
> {
  return Object.values(REGISTRY).map((t) => ({
    key: t.key,
    label: t.label,
    description: t.description,
    industry: t.industry,
    kind: t.kind,
  }))
}

export const DEFAULT_TENANT_TEMPLATE = industriedienstleisterShowcase.key
