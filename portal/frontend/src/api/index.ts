import type {
  CurrentUser, Catalog, CatalogDetail, MouDefinition,
  CatalogMember, AccessRequest, SearchResult, SavedView,
  DataApp, NotificationsResponse,
  VehiclePoint, VehicleStatus, TimeseriesSeries, VideoInfo,
  StatResult, QualityAlert, PaginatedResponse, Region,
  MatchedColumn, AdminUser,
} from '@/types'

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/v1'

// Token は Zustand authStore から注入 (interceptor パターン)
let _getToken: () => string | null = () => null
export function setTokenGetter(fn: () => string | null) { _getToken = fn }

async function req<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = _getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw Object.assign(new Error(err.detail ?? 'API error'), { status: res.status, data: err })
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

const get = <T>(path: string) => req<T>(path)
const post = <T>(path: string, body: unknown) => req<T>(path, { method: 'POST', body: JSON.stringify(body) })
const put = <T>(path: string, body: unknown) => req<T>(path, { method: 'PUT', body: JSON.stringify(body) })
const patch = <T>(path: string, body?: unknown) => req<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined })
const del = <T>(path: string) => req<T>(path, { method: 'DELETE' })

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  me: () => get<CurrentUser>('/auth/me'),
}

// ── Notifications ─────────────────────────────────────────────────────────────
export const notificationsApi = {
  list: (params?: { is_read?: boolean; limit?: number; offset?: number }) => {
    const q = new URLSearchParams()
    if (params?.is_read !== undefined) q.set('is_read', String(params.is_read))
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.offset) q.set('offset', String(params.offset))
    return get<NotificationsResponse>(`/notifications${q.size ? '?' + q : ''}`)
  },
  markRead: (id: string) => patch<{ notification_id: string; is_read: boolean }>(`/notifications/${id}/read`),
  markAllRead: () => patch<{ updated_count: number }>('/notifications/read-all'),
}

// ── Catalogs ──────────────────────────────────────────────────────────────────
export const catalogsApi = {
  list: (params?: { q?: string; subscribed?: boolean; limit?: number; offset?: number }) => {
    const q = new URLSearchParams()
    if (params?.q) q.set('q', params.q)
    if (params?.subscribed !== undefined) q.set('subscribed', String(params.subscribed))
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.offset) q.set('offset', String(params.offset))
    return get<PaginatedResponse<Catalog>>(`/catalogs${q.size ? '?' + q : ''}`)
  },
  get: (name: string) => get<CatalogDetail>(`/catalogs/${name}`),
  create: (body: { catalog_name: string; display_name: string; description: string; requires_approval?: boolean }) =>
    post<{ catalog_name: string; status: string }>('/catalogs', body),

  getMou: (name: string) => get<MouDefinition>(`/catalogs/${name}/mou`),
  updateMou: (name: string, body: { mou_text: string; checklist: { label: string; required: boolean }[] }) =>
    put<{ catalog_name: string; version: string; updated_at: string }>(`/catalogs/${name}/mou`, body),

  getMembers: (name: string, role?: string) => {
    const q = role ? `?role=${role}` : ''
    return get<{ members: CatalogMember[] }>(`/catalogs/${name}/members${q}`)
  },
  updateMember: (name: string, userId: string, role: string) =>
    patch<{ user_id: string; role: string }>(`/catalogs/${name}/members/${userId}`, { role }),
  deleteMember: (name: string, userId: string) =>
    del<{ deleted: boolean }>(`/catalogs/${name}/members/${userId}`),

  getAccessRequests: (name: string, status?: string) => {
    const q = status ? `?status=${status}` : ''
    return get<PaginatedResponse<AccessRequest>>(`/catalogs/${name}/access-requests${q}`)
  },
  createAccessRequest: (name: string, body: { mou_version: string; checklist_responses: { item_id: string; checked: boolean }[] }) =>
    post<{ agreement_id: string; status: string; role_granted: string | null }>(`/catalogs/${name}/access-requests`, body),
  decideAccessRequest: (name: string, id: string, body: { action: 'approve' | 'reject'; notes?: string }) =>
    patch<{ agreement_id: string; status: string; decided_at: string }>(`/catalogs/${name}/access-requests/${id}`, body),
  revokeAccessRequest: (name: string, id: string) =>
    del<{ deleted: boolean }>(`/catalogs/${name}/access-requests/${id}`),

  search: (body: { query: string; catalog_names?: string[]; time_from?: string; time_to?: string; limit?: number }) =>
    post<SearchResult>('/catalogs/search', body),
  saveView: (body: { view_name: string; target_schema: string; matched_columns: MatchedColumn[]; time_from?: string; time_to?: string }) =>
    post<SavedView>('/catalogs/search/views', body),
}

// ── Apps ──────────────────────────────────────────────────────────────────────
export const appsApi = {
  list: (params?: { q?: string; subscribed?: boolean }) => {
    const q = new URLSearchParams()
    if (params?.q) q.set('q', params.q)
    if (params?.subscribed !== undefined) q.set('subscribed', String(params.subscribed))
    return get<PaginatedResponse<DataApp>>(`/apps${q.size ? '?' + q : ''}`)
  },
  get: (id: string) => get<DataApp>(`/apps/${id}`),
  create: (body: {
    name: string; description: string; redirect_url: string
    used_catalog_names: string[]; published_catalog_names?: string[]
    cognito_user_pool_arn?: string; cognito_region?: string
  }) => post<{ app_id: string; status: string }>('/apps', body),
  update: (id: string, body: {
    name?: string; description?: string; redirect_url?: string
    used_catalog_names?: string[]; published_catalog_names?: string[]
  }) => put<{ app_id: string; status: string }>(`/apps/${id}`, body),
  subscribe: (id: string) => post<{ app_id: string; status: string; cognito_provisioned: boolean }>(`/apps/${id}/subscriptions`, {}),
  unsubscribe: (id: string) => del<{ deleted: boolean }>(`/apps/${id}/subscriptions`),
  redirectToken: (id: string) => post<{ redirect_url: string; expires_in: number }>(`/apps/${id}/redirect-token`, {}),
}

// ── Analysis ──────────────────────────────────────────────────────────────────
export const analysisApi = {
  vehicles: (body: { region: Region; at_time: string; time_tolerance_sec?: number }) =>
    post<{ vehicles: VehiclePoint[] }>('/analysis/vehicles', body),
  vehicleStatus: (id: string, atTime: string) =>
    get<VehicleStatus>(`/analysis/vehicles/${id}/status?at_time=${encodeURIComponent(atTime)}`),
  vehicleTimeseries: (id: string, body: { columns: string[]; time_from: string; time_to: string; downsample_interval_sec?: number }) =>
    post<{ vehicle_id: string; series: TimeseriesSeries[] }>(`/analysis/vehicles/${id}/timeseries`, body),
  vehicleVideo: (id: string, atTime: string) =>
    get<VideoInfo>(`/analysis/vehicles/${id}/video?at_time=${encodeURIComponent(atTime)}`),
  statistics: (body: { region: Region; time_from: string; time_to: string; columns: string[] }) =>
    post<{ stats: StatResult[] }>('/analysis/statistics', body),
}

// ── Alerts ────────────────────────────────────────────────────────────────────
export const alertsApi = {
  list: (params?: { catalog_name?: string; status?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams()
    if (params?.catalog_name) q.set('catalog_name', params.catalog_name)
    if (params?.status) q.set('status', params.status)
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.offset) q.set('offset', String(params.offset))
    return get<PaginatedResponse<QualityAlert>>(`/alerts${q.size ? '?' + q : ''}`)
  },
  get: (id: string) => get<QualityAlert>(`/alerts/${id}`),
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminApi = {
  listUsers: (params?: { q?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams()
    if (params?.q) q.set('q', params.q)
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.offset) q.set('offset', String(params.offset))
    return get<PaginatedResponse<AdminUser>>(`/admin/users${q.size ? '?' + q : ''}`)
  },
  sendNotification: (body: { title: string; body: string; target_user_ids?: string[]; send_email?: boolean }) =>
    post<{ notification_ids: string[]; recipient_count: number }>('/admin/notifications', body),
}
