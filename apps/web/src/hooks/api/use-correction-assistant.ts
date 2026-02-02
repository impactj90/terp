import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authStorage, tenantIdStorage } from '@/lib/api'
import { clientEnv } from '@/config/env'

// --- Manual fetch helper (same pattern as use-monthly-values.ts) ---

async function apiRequest(url: string, options?: RequestInit) {
  const token = authStorage.getToken()
  const tenantId = tenantIdStorage.getTenantId()

  const response = await fetch(`${clientEnv.apiUrl}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantId ? { 'X-Tenant-ID': tenantId } : {}),
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(error.message || 'Request failed')
  }

  return response.json()
}

// --- TypeScript Interfaces (matching backend schema definitions) ---

export interface CorrectionAssistantError {
  code: string
  severity: 'error' | 'hint'
  message: string
  error_type: string
}

export interface CorrectionAssistantItem {
  daily_value_id: string
  employee_id: string
  employee_name: string
  department_id: string | null
  department_name: string | null
  value_date: string
  errors: CorrectionAssistantError[]
}

export interface CorrectionAssistantList {
  data: CorrectionAssistantItem[]
  meta: {
    total: number
    limit: number
    offset: number
    has_more: boolean
  }
}

export interface CorrectionMessage {
  id: string
  tenant_id: string
  code: string
  default_text: string
  custom_text: string | null
  effective_text: string
  severity: 'error' | 'hint'
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CorrectionMessageList {
  data: CorrectionMessage[]
  meta?: {
    total: number
    limit: number
    offset: number
    has_more: boolean
  }
}

export interface UpdateCorrectionMessageRequest {
  custom_text?: string | null
  severity?: 'error' | 'hint'
  is_active?: boolean
}

// --- Query Hooks ---

interface UseCorrectionAssistantItemsOptions {
  from?: string
  to?: string
  employee_id?: string
  department_id?: string
  severity?: 'error' | 'hint'
  error_code?: string
  limit?: number
  offset?: number
  enabled?: boolean
}

export function useCorrectionAssistantItems(options: UseCorrectionAssistantItemsOptions = {}) {
  const { enabled = true, ...params } = options

  const queryParams = new URLSearchParams()
  if (params.from) queryParams.set('from', params.from)
  if (params.to) queryParams.set('to', params.to)
  if (params.employee_id) queryParams.set('employee_id', params.employee_id)
  if (params.department_id) queryParams.set('department_id', params.department_id)
  if (params.severity) queryParams.set('severity', params.severity)
  if (params.error_code) queryParams.set('error_code', params.error_code)
  if (params.limit !== undefined) queryParams.set('limit', String(params.limit))
  if (params.offset !== undefined) queryParams.set('offset', String(params.offset))

  const qs = queryParams.toString()
  const url = `/correction-assistant${qs ? `?${qs}` : ''}`

  return useQuery<CorrectionAssistantList>({
    queryKey: ['correction-assistant', params],
    queryFn: () => apiRequest(url),
    enabled,
  })
}

interface UseCorrectionMessagesOptions {
  severity?: 'error' | 'hint'
  is_active?: boolean
  code?: string
  enabled?: boolean
}

export function useCorrectionMessages(options: UseCorrectionMessagesOptions = {}) {
  const { enabled = true, ...params } = options

  const queryParams = new URLSearchParams()
  if (params.severity) queryParams.set('severity', params.severity)
  if (params.is_active !== undefined) queryParams.set('is_active', String(params.is_active))
  if (params.code) queryParams.set('code', params.code)

  const qs = queryParams.toString()
  const url = `/correction-messages${qs ? `?${qs}` : ''}`

  return useQuery<CorrectionMessageList>({
    queryKey: ['correction-messages', params],
    queryFn: () => apiRequest(url),
    enabled,
  })
}

export function useCorrectionMessage(id: string, enabled = true) {
  return useQuery<CorrectionMessage>({
    queryKey: ['correction-messages', id],
    queryFn: () => apiRequest(`/correction-messages/${id}`),
    enabled: enabled && !!id,
  })
}

// --- Mutation Hooks ---

export function useUpdateCorrectionMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...body }: UpdateCorrectionMessageRequest & { id: string }) =>
      apiRequest(`/correction-messages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correction-messages'] })
      queryClient.invalidateQueries({ queryKey: ['correction-assistant'] })
    },
  })
}
