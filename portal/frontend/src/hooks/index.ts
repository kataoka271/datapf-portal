import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi, catalogsApi, appsApi, analysisApi, alertsApi, notificationsApi } from '@/api'
import type { Region } from '@/types'

// ── Auth ──────────────────────────────────────────────────────────────────────
export function useCurrentUser() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    staleTime: 5 * 60_000,
  })
}

// ── Notifications ─────────────────────────────────────────────────────────────
export function useNotifications(params?: { is_read?: boolean; limit?: number }) {
  return useQuery({
    queryKey: ['notifications', params],
    queryFn: () => notificationsApi.list(params),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

// ── Catalogs ──────────────────────────────────────────────────────────────────
export function useCatalogs(params?: { q?: string; subscribed?: boolean }) {
  return useQuery({
    queryKey: ['catalogs', params],
    queryFn: () => catalogsApi.list(params),
    staleTime: 2 * 60_000,
  })
}

export function useCatalog(name: string) {
  return useQuery({
    queryKey: ['catalogs', name],
    queryFn: () => catalogsApi.get(name),
    staleTime: 5 * 60_000,
    enabled: !!name,
  })
}

export function useMou(catalogName: string) {
  return useQuery({
    queryKey: ['catalogs', catalogName, 'mou'],
    queryFn: () => catalogsApi.getMou(catalogName),
    staleTime: 10 * 60_000,
    enabled: !!catalogName,
  })
}

export function useMembers(catalogName: string) {
  return useQuery({
    queryKey: ['catalogs', catalogName, 'members'],
    queryFn: () => catalogsApi.getMembers(catalogName),
    staleTime: 2 * 60_000,
    enabled: !!catalogName,
  })
}

export function useAccessRequests(catalogName: string, status?: string) {
  return useQuery({
    queryKey: ['catalogs', catalogName, 'access-requests', status],
    queryFn: () => catalogsApi.getAccessRequests(catalogName, status),
    staleTime: 60_000,
    enabled: !!catalogName,
  })
}

export function useCreateAccessRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ catalogName, body }: {
      catalogName: string
      body: { mou_version: string; checklist_responses: { item_id: string; checked: boolean }[] }
    }) => catalogsApi.createAccessRequest(catalogName, body),
    onSuccess: (_data, { catalogName }) => {
      qc.invalidateQueries({ queryKey: ['catalogs', catalogName] })
      qc.invalidateQueries({ queryKey: ['catalogs', { }] })
    },
  })
}

export function useDecideAccessRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ catalogName, id, action, notes }: {
      catalogName: string; id: string; action: 'approve' | 'reject'; notes?: string
    }) => catalogsApi.decideAccessRequest(catalogName, id, { action, notes }),
    onSuccess: (_data, { catalogName }) => {
      qc.invalidateQueries({ queryKey: ['catalogs', catalogName, 'access-requests'] })
    },
  })
}

export function useRevokeAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ catalogName, id }: { catalogName: string; id: string }) =>
      catalogsApi.revokeAccessRequest(catalogName, id),
    onSuccess: (_data, { catalogName }) => {
      qc.invalidateQueries({ queryKey: ['catalogs'] })
      qc.invalidateQueries({ queryKey: ['catalogs', catalogName, 'access-requests'] })
    },
  })
}

export function useUpdateMou() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ catalogName, body }: {
      catalogName: string
      body: { mou_text: string; checklist: { label: string; required: boolean }[] }
    }) => catalogsApi.updateMou(catalogName, body),
    onSuccess: (_data, { catalogName }) => {
      qc.invalidateQueries({ queryKey: ['catalogs', catalogName, 'mou'] })
    },
  })
}

export function useDeleteMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ catalogName, userId }: { catalogName: string; userId: string }) =>
      catalogsApi.deleteMember(catalogName, userId),
    onSuccess: (_data, { catalogName }) => {
      qc.invalidateQueries({ queryKey: ['catalogs', catalogName, 'members'] })
    },
  })
}

export function useUpdateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ catalogName, userId, role }: { catalogName: string; userId: string; role: string }) =>
      catalogsApi.updateMember(catalogName, userId, role),
    onSuccess: (_data, { catalogName }) => {
      qc.invalidateQueries({ queryKey: ['catalogs', catalogName, 'members'] })
    },
  })
}

export function useCrossSearch() {
  return useMutation({
    mutationFn: catalogsApi.search,
  })
}

export function useSaveView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: catalogsApi.saveView,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-views'] }),
  })
}

// ── Apps ──────────────────────────────────────────────────────────────────────
export function useApps(params?: { q?: string; subscribed?: boolean }) {
  return useQuery({
    queryKey: ['apps', params],
    queryFn: () => appsApi.list(params),
    staleTime: 2 * 60_000,
  })
}

export function useSubscribeApp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (appId: string) => appsApi.subscribe(appId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apps'] }),
  })
}

export function useUnsubscribeApp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (appId: string) => appsApi.unsubscribe(appId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apps'] }),
  })
}

// ── Analysis ──────────────────────────────────────────────────────────────────
export function useVehicles(region: Region, atTime: string) {
  return useQuery({
    queryKey: ['analysis', 'vehicles', region, atTime],
    queryFn: () => analysisApi.vehicles({ region, at_time: atTime }),
    staleTime: 60_000,
    enabled: !!region && !!atTime,
  })
}

export function useVehicleStatus(vehicleId: string | null, atTime: string) {
  return useQuery({
    queryKey: ['analysis', 'vehicle', vehicleId, 'status', atTime],
    queryFn: () => analysisApi.vehicleStatus(vehicleId!, atTime),
    staleTime: 3 * 60_000,
    enabled: !!vehicleId && !!atTime,
  })
}

export function useVehicleTimeseries(vehicleId: string | null, columns: string[], timeFrom: string, timeTo: string) {
  return useQuery({
    queryKey: ['analysis', 'vehicle', vehicleId, 'timeseries', columns, timeFrom, timeTo],
    queryFn: () => analysisApi.vehicleTimeseries(vehicleId!, { columns, time_from: timeFrom, time_to: timeTo }),
    staleTime: 5 * 60_000,
    enabled: !!vehicleId && columns.length > 0,
  })
}

export function useVehicleVideo(vehicleId: string | null, atTime: string, enabled: boolean) {
  return useQuery({
    queryKey: ['analysis', 'vehicle', vehicleId, 'video', atTime],
    queryFn: () => analysisApi.vehicleVideo(vehicleId!, atTime),
    staleTime: 50 * 60_000,
    enabled: !!vehicleId && enabled,
  })
}

export function useStatistics() {
  return useMutation({ mutationFn: analysisApi.statistics })
}

// ── Alerts ────────────────────────────────────────────────────────────────────
export function useAlerts(params?: { catalog_name?: string; status?: string }) {
  return useQuery({
    queryKey: ['alerts', params],
    queryFn: () => alertsApi.list(params),
    staleTime: 2 * 60_000,
  })
}

export function useAlert(id: string) {
  return useQuery({
    queryKey: ['alerts', id],
    queryFn: () => alertsApi.get(id),
    staleTime: 2 * 60_000,
    enabled: !!id,
  })
}
