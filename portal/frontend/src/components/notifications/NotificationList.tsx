import { useState } from 'react'
import { useNotifications, useMarkRead, useMarkAllRead, useAlerts, useAlert } from '@/hooks'
import { Button, NotifIcon, Spinner, EmptyState, SeverityBadge, AlertStatusBadge, PageHeader } from '@/components/common/ui'
import { useCurrentUser } from '@/hooks'

// ── Notifications list ────────────────────────────────────────────────────────
export function NotificationList() {
  const [unreadOnly, setUnreadOnly] = useState(false)
  const { data, isLoading } = useNotifications({ is_read: unreadOnly ? false : undefined })
  const markRead  = useMarkRead()
  const markAll   = useMarkAllRead()

  return (
    <div className="p-6">
      <PageHeader
        title="通知"
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setUnreadOnly(!unreadOnly)}
              className={`px-3 h-8 text-xs rounded-md border transition-colors ${
                unreadOnly ? 'bg-teal-600 text-white border-teal-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              未読のみ
            </button>
            <Button size="sm" variant="secondary" onClick={() => markAll.mutate()} loading={markAll.isPending}>
              すべて既読
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState title="通知がありません" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
          {(data?.items ?? []).map((n) => (
            <div
              key={n.notification_id}
              onClick={() => !n.is_read && markRead.mutate(n.notification_id)}
              className={`flex gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                !n.is_read ? 'bg-teal-50/30' : ''
              }`}
            >
              <NotifIcon type={n.type} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{n.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  {n.related_catalog && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">{n.related_catalog}</span>
                  )}
                  <span className="text-xs text-gray-400">
                    {new Date(n.created_at).toLocaleString('ja-JP')}
                  </span>
                </div>
              </div>
              {!n.is_read && (
                <div className="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0 mt-1.5" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Quality alerts list ───────────────────────────────────────────────────────
export function AlertList() {
  const { data: user } = useCurrentUser()
  const [catalogFilter, setCatalogFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('OPEN')
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null)
  const { data, isLoading } = useAlerts({
    catalog_name: catalogFilter || undefined,
    status: statusFilter || undefined,
  })
  const { data: alertDetail } = useAlert(selectedAlertId ?? '')

  // unique catalogs from the user's owned catalogs
  const ownedCatalogs = (user?.catalog_roles ?? [])
    .filter((r) => r.role === 'owner')
    .map((r) => r.catalog_name)

  const severityBorder: Record<string, string> = {
    HIGH:   'border-l-red-500',
    MEDIUM: 'border-l-amber-400',
    LOW:    'border-l-blue-400',
  }

  return (
    <div className="p-6">
      <PageHeader title="データ品質アラート" description="所有カタログの品質問題を確認します" />

      <div className="flex gap-2 mb-5 flex-wrap">
        <select
          value={catalogFilter}
          onChange={(e) => setCatalogFilter(e.target.value)}
          className="h-8 px-3 text-sm border border-gray-200 rounded-md bg-white text-gray-900 outline-none focus:border-teal-400"
        >
          <option value="">すべてのカタログ</option>
          {ownedCatalogs.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {['OPEN', 'RESOLVED', ''].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 h-8 text-xs rounded-md border transition-colors ${
              statusFilter === s
                ? 'bg-teal-600 text-white border-teal-700'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {s || '全件'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState title="アラートがありません" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-2">
            {(data?.items ?? []).map((alert) => (
              <div
                key={alert.alert_id}
                onClick={() => setSelectedAlertId(alert.alert_id)}
                className={`bg-white rounded-xl border-l-4 border border-gray-100 p-4 cursor-pointer hover:border-gray-200 transition-colors ${
                  severityBorder[alert.severity] ?? 'border-l-gray-300'
                } ${selectedAlertId === alert.alert_id ? 'ring-1 ring-teal-300' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-1">
                    <SeverityBadge severity={alert.severity} />
                    <AlertStatusBadge status={alert.status} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{alert.metric_name}</p>
                    <p className="text-xs text-gray-500 font-mono truncate mt-0.5">{alert.table_full_name}</p>
                    {alert.actual_value !== null && alert.threshold !== null && (
                      <p className="text-xs text-gray-400 mt-1">
                        実測: {alert.actual_value.toFixed(2)} / 閾値: {alert.threshold.toFixed(2)}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(alert.triggered_at).toLocaleString('ja-JP')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Detail panel */}
          <div>
            {selectedAlertId && alertDetail ? (
              <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 sticky top-4">
                <p className="text-xs font-medium text-gray-700">アラート詳細</p>
                <div className="flex gap-2">
                  <SeverityBadge severity={alertDetail.severity} />
                  <AlertStatusBadge status={alertDetail.status} />
                </div>
                <div className="space-y-2 text-xs">
                  {[
                    { label: 'メトリクス', value: alertDetail.metric_name },
                    { label: 'テーブル',   value: alertDetail.table_full_name },
                    { label: '実測値',     value: alertDetail.actual_value?.toFixed(4) ?? '-' },
                    { label: '閾値',       value: alertDetail.threshold?.toFixed(4)    ?? '-' },
                    { label: '発生日時',   value: new Date(alertDetail.triggered_at).toLocaleString('ja-JP') },
                    { label: '解決日時',   value: alertDetail.resolved_at ? new Date(alertDetail.resolved_at).toLocaleString('ja-JP') : '-' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex gap-2">
                      <span className="text-gray-400 w-20 flex-shrink-0">{label}</span>
                      <span className="text-gray-700 font-mono break-all">{value}</span>
                    </div>
                  ))}
                </div>
                {alertDetail.detail_message && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-600 leading-relaxed">{alertDetail.detail_message}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 p-4 h-40 flex items-center justify-center">
                <p className="text-xs text-gray-400">アラートを選択すると詳細が表示されます</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
