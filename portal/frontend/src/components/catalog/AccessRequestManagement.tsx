// ── AccessRequestManagement ───────────────────────────────────────────────────
import { useState } from 'react'
import { useAccessRequests, useDecideAccessRequest } from '@/hooks'
import { useUIStore } from '@/stores'
import { Button, Badge, EmptyState, Spinner, PageHeader } from '@/components/common/ui'

export function AccessRequestManagement({ catalogName }: { catalogName: string }) {
  const [statusFilter, setStatusFilter] = useState<string>('PENDING')
  const { data, isLoading } = useAccessRequests(catalogName, statusFilter)
  const decide = useDecideAccessRequest()
  const { addToast } = useUIStore()
  const [notes, setNotes] = useState('')
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)

  const handleDecide = (id: string, action: 'approve' | 'reject') => {
    decide.mutate(
      { catalogName, id, action, notes: action === 'reject' ? notes : undefined },
      {
        onSuccess: () => {
          addToast({ type: 'success', message: action === 'approve' ? '承認しました' : '却下しました' })
          setRejectTarget(null)
          setNotes('')
        },
        onError: () => addToast({ type: 'error', message: '操作に失敗しました' }),
      }
    )
  }

  return (
    <div className="p-6">
      <PageHeader title="申請管理" description={catalogName} />

      <div className="flex gap-1.5 mb-4">
        {['PENDING', 'APPROVED', 'REJECTED'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
              statusFilter === s
                ? 'bg-teal-600 text-white border-teal-700'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState title="申請がありません" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">ユーザー</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">MOU バージョン</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">申請日時</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">ステータス</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data?.items ?? []).map((req) => (
                <tr key={req.agreement_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <p className="text-xs font-medium text-gray-900">{req.display_name}</p>
                    <p className="text-xs text-gray-400">{req.email}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-gray-700">{req.mou_version}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{new Date(req.agreed_at).toLocaleString('ja-JP')}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={req.status === 'PENDING' ? 'amber' : req.status === 'APPROVED' ? 'green' : 'red'}>
                      {req.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {req.status === 'PENDING' && (
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="primary" onClick={() => handleDecide(req.agreement_id, 'approve')} loading={decide.isPending}>
                          承認
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setRejectTarget(req.agreement_id)}>
                          却下
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm">
            <h3 className="text-base font-medium text-gray-900 mb-3">却下理由（任意）</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="却下の理由を入力してください"
              className="w-full text-sm border border-gray-200 rounded-md p-2.5 resize-none outline-none focus:border-teal-400"
            />
            <div className="flex gap-2 justify-end mt-3">
              <Button variant="secondary" onClick={() => setRejectTarget(null)}>キャンセル</Button>
              <Button variant="danger" onClick={() => handleDecide(rejectTarget, 'reject')} loading={decide.isPending}>
                却下する
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
