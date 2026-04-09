import { useState } from 'react'
import { useCrossSearch, useSaveView } from '@/hooks'
import { useUIStore } from '@/stores'
import { Button, EmptyState, Spinner, PageHeader } from '@/components/common/ui'
import type { MatchedColumn } from '@/types'

export function CrossSearch() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [saveOpen, setSaveOpen] = useState(false)
  const [viewName, setViewName] = useState('')
  const [targetSchema, setTargetSchema] = useState('')
  const search = useCrossSearch()
  const saveView = useSaveView()
  const { addToast } = useUIStore()

  const handleSearch = () => {
    if (!query.trim()) return
    search.mutate({ query })
    setSelected(new Set())
  }

  const toggleCol = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const selectedCols: MatchedColumn[] = (search.data?.matched_columns ?? []).filter((_, i) => selected.has(i))

  const handleSave = () => {
    saveView.mutate(
      { view_name: viewName, target_schema: targetSchema, matched_columns: selectedCols },
      {
        onSuccess: (v) => {
          addToast({ type: 'success', message: `VIEW を保存しました: ${v.view_full_name}` })
          setSaveOpen(false)
        },
        onError: () => addToast({ type: 'error', message: 'VIEW の保存に失敗しました' }),
      }
    )
  }

  return (
    <div className="p-6">
      <PageHeader title="横断検索" description="自然言語でカラムを検索し、時系列データを結合します" />

      <div className="flex gap-2 mb-5">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="例：車速と加速度に関するカラム"
          className="flex-1 h-9 px-3 text-sm border border-gray-200 rounded-md bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-teal-400"
        />
        <Button variant="primary" onClick={handleSearch} loading={search.isPending}>検索</Button>
      </div>

      {search.isPending ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !search.data ? (
        <EmptyState title="検索クエリを入力してください" description="自然言語でカラムを検索できます" />
      ) : (
        <div className="grid grid-cols-5 gap-4">
          {/* Left: column list */}
          <div className="col-span-2 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-gray-700">
                ヒットしたカラム <span className="text-gray-400 font-normal">{search.data.matched_columns.length}件</span>
              </p>
              {selected.size > 0 && (
                <Button size="sm" variant="primary" onClick={() => setSaveOpen(true)}>
                  VIEW を保存 ({selected.size})
                </Button>
              )}
            </div>
            {search.data.matched_columns.length === 0 ? (
              <EmptyState title="該当するカラムがありません" />
            ) : (
              search.data.matched_columns.map((col, i) => (
                <label
                  key={i}
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    selected.has(i) ? 'border-teal-300 bg-teal-50' : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggleCol(i)}
                    className="mt-0.5 rounded border-gray-300 text-teal-600"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 font-mono">{col.column_name}</p>
                    <p className="text-xs text-gray-400 truncate">{col.catalog_name}.{col.schema_name}.{col.table_name}</p>
                    {col.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{col.description}</p>}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {col.tags.map((tag) => (
                        <span key={tag} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono">{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-xs text-gray-400">{col.score.toFixed(2)}</span>
                    <div className="w-12 h-1.5 bg-gray-100 rounded-full">
                      <div className="h-full bg-teal-500 rounded-full" style={{ width: `${col.score * 100}%` }} />
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>

          {/* Right: preview */}
          <div className="col-span-3">
            <p className="text-xs font-medium text-gray-700 mb-2">
              時系列プレビュー <span className="text-gray-400 font-normal">{search.data.preview_rows.length}行</span>
            </p>
            <div className="bg-white rounded-xl border border-gray-100 overflow-auto max-h-96">
              {search.data.preview_rows.length === 0 ? (
                <EmptyState title="プレビューデータなし" />
              ) : (
                <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {Object.keys(search.data.preview_rows[0]).map((k) => (
                        <th key={k} className="px-3 py-2 text-left font-medium text-gray-500 font-mono truncate">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {search.data.preview_rows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="px-3 py-2 text-gray-700 truncate">{String(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {saveOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm">
            <h3 className="text-base font-medium text-gray-900 mb-3">VIEW を保存</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">VIEW 名</label>
                <input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="my_combined_view"
                  className="w-full h-8 px-3 text-sm border border-gray-200 rounded-md outline-none focus:border-teal-400 font-mono" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">保存先スキーマ</label>
                <input value={targetSchema} onChange={(e) => setTargetSchema(e.target.value)} placeholder="my_catalog.my_schema"
                  className="w-full h-8 px-3 text-sm border border-gray-200 rounded-md outline-none focus:border-teal-400 font-mono" />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="secondary" onClick={() => setSaveOpen(false)}>キャンセル</Button>
              <Button variant="primary" onClick={handleSave} loading={saveView.isPending} disabled={!viewName || !targetSchema}>
                保存
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
