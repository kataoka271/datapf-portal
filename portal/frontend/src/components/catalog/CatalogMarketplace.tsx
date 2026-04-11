import { useState } from 'react'
import { useDebounce } from '@/hooks/useDebounce'
import { useCatalogs, useRevokeAccess } from '@/hooks'
import { useUIStore } from '@/stores'
import { Button, Badge, Skeleton, EmptyState, ConfirmDialog, PageHeader } from '@/components/common/ui'
import { MouAgreementModal } from './MouAgreementModal'
import type { Catalog } from '@/types'

function CatalogCard({ catalog, onApply }: { catalog: Catalog; onApply: (c: Catalog) => void }) {
  const { addToast } = useUIStore()
  const revoke = useRevokeAccess()
  const [confirmRevoke, setConfirmRevoke] = useState(false)

  const isOwner = catalog.my_role === 'owner' || catalog.my_role === 'editor'
  const isPending = catalog.my_request_status === 'PENDING'
  const isApproved = catalog.my_request_status === 'APPROVED'

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-3 hover:border-gray-200 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-900 font-mono">{catalog.catalog_name}</h3>
        {isOwner ? <Badge variant="purple">オーナー</Badge>
          : isApproved ? <Badge variant="green">閲覧中</Badge>
          : isPending ? <Badge variant="amber">審査中</Badge>
          : catalog.my_request_status === 'REJECTED' ? <Badge variant="red">却下済み</Badge>
          : <Badge variant="gray">未申請</Badge>}
      </div>

      <p className="text-xs text-gray-500 leading-relaxed flex-1 line-clamp-3">
        {catalog.description || '説明なし'}
      </p>

      {catalog.requires_approval && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0-6v2m-6 3h12" />
          </svg>
          承認フローあり
        </p>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-gray-50 gap-2">
        <span className="text-xs text-gray-400 truncate">{catalog.owner_user_id}</span>
        <div className="flex gap-1.5 flex-shrink-0">
          {!isOwner && !isApproved && !isPending && (
            <Button size="sm" variant="primary" onClick={() => onApply(catalog)}>
              申請
            </Button>
          )}
          {(isApproved || isPending) && !isOwner && (
            <Button size="sm" variant="danger" onClick={() => setConfirmRevoke(true)}>
              解除
            </Button>
          )}
        </div>
      </div>

      {confirmRevoke && (
        <ConfirmDialog
          title="閲覧権限を解除しますか？"
          message={`${catalog.catalog_name} への閲覧権限を解除します。再度アクセスするには申請が必要です。`}
          onCancel={() => setConfirmRevoke(false)}
          loading={revoke.isPending}
          onConfirm={() => {
            if (!catalog.my_request_status) return
            revoke.mutate(
              { catalogName: catalog.catalog_name, id: catalog.my_request_status },
              {
                onSuccess: () => { setConfirmRevoke(false); addToast({ type: 'success', message: '購読を解除しました' }) },
                onError: () => addToast({ type: 'error', message: '解除に失敗しました' }),
              }
            )
          }}
        />
      )}
    </div>
  )
}

export function CatalogMarketplace() {
  const [rawQuery, setRawQuery] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const [applyTarget, setApplyTarget] = useState<Catalog | null>(null)
  const query = useDebounce(rawQuery, 300)
  const { data, isLoading } = useCatalogs({ q: query || undefined, subscribed: subscribed || undefined })

  return (
    <div className="p-6">
      <PageHeader
        title="データカタログ"
        description="利用可能なカタログを検索・申請できます"
        action={
          <Button variant="primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            カタログ作成申請
          </Button>
        }
      />

      <div className="flex gap-2 mb-5">
        <input
          type="text"
          placeholder="カタログ名・説明で検索..."
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          className="flex-1 h-8 px-3 text-sm border border-gray-200 rounded-md bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-teal-400"
        />
        <button
          onClick={() => setSubscribed(!subscribed)}
          className={`px-3 h-8 text-xs rounded-md border transition-colors ${
            subscribed ? 'bg-teal-600 text-white border-teal-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          閲覧中のみ
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState title="該当するカタログがありません" description="検索条件を変えてお試しください" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(data?.items ?? []).map((cat) => (
            <CatalogCard key={cat.catalog_name} catalog={cat} onApply={setApplyTarget} />
          ))}
        </div>
      )}

      {applyTarget && (
        <MouAgreementModal
          catalogName={applyTarget.catalog_name}
          onClose={() => setApplyTarget(null)}
          onSuccess={() => { setApplyTarget(null) }}
        />
      )}
    </div>
  )
}
