import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCrossSearch, useCatalogs } from "@/hooks";
import { Button, Spinner } from "@/components/common/ui";
import type { MatchedColumn } from "@/types";

export const colKey = (c: MatchedColumn) =>
  `${c.catalog_name}.${c.schema_name}.${c.table_name}.${c.column_name}`;

export function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div
      className={`w-3.5 h-3.5 flex-shrink-0 rounded border flex items-center justify-center transition-colors ${
        checked ? "bg-teal-600 border-teal-700" : "border-gray-300 bg-white"
      }`}
    >
      {checked && (
        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
          <path
            d="M1.5 5l2.5 2.5 4.5-4.5"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}

export function ColumnSearchPanel({
  registeredColumns,
  onRegister,
  onUnregister,
  onClearAll,
  onAnalyze,
  onRequestAccess,
}: {
  registeredColumns: MatchedColumn[];
  onRegister: (cols: MatchedColumn[]) => void;
  onUnregister: (col: MatchedColumn) => void;
  onClearAll: () => void;
  onAnalyze: () => void;
  onRequestAccess: (catalogName: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<{
    data: typeof search.data;
    cols: MatchedColumn[];
  }>({ data: undefined, cols: [] });
  const [showUnapplied, setShowUnapplied] = useState(true);
  const search = useCrossSearch();
  const { data: catalogsData } = useCatalogs();

  const checkedCols = checked.data === search.data ? checked.cols : [];

  const getCatalogStatus = (catalogName: string) =>
    catalogsData?.items.find((c) => c.catalog_name === catalogName);

  const hasAccess = (catalogName: string) => {
    const catInfo = getCatalogStatus(catalogName);
    if (!catInfo) return true;
    return ["owner", "editor", "viewer"].includes(catInfo.my_role);
  };

  const results = search.data?.matched_columns ?? [];

  const visibleResults = (
    showUnapplied
      ? results
      : results.filter((col) => {
          const catInfo = getCatalogStatus(col.catalog_name);
          if (!catInfo) return true;
          return ["owner", "editor", "viewer"].includes(catInfo.my_role);
        })
  ).filter((col) => !registeredColumns.some((r) => colKey(r) === colKey(col)));

  const isChecked = (col: MatchedColumn) =>
    checkedCols.some((c) => colKey(c) === colKey(col));

  const selectableResults = visibleResults.filter((col) =>
    hasAccess(col.catalog_name),
  );
  const allChecked =
    selectableResults.length > 0 &&
    selectableResults.every((c) => isChecked(c));

  const toggleCheck = (col: MatchedColumn) => {
    const key = colKey(col);
    const current = checked.data === search.data ? checked.cols : [];
    setChecked({
      data: search.data,
      cols: current.some((c) => colKey(c) === key)
        ? current.filter((c) => colKey(c) !== key)
        : [...current, col],
    });
  };

  const toggleSelectAll = () => {
    setChecked({
      data: search.data,
      cols: allChecked ? [] : [...selectableResults],
    });
  };

  const handleRegister = () => {
    onRegister(checkedCols);
    setChecked({ data: search.data, cols: [] });
  };

  const handleSearch = () => {
    if (query) search.mutate({ query });
  };

  return (
    <div className="w-72 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col h-full">
      {/* Search input */}
      <div className="p-4 border-b border-gray-100 space-y-2">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          カラム検索
        </p>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="例: 車速、加速度..."
            className="flex-1 h-8 px-3 text-xs border border-gray-200 rounded-md bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-teal-400"
          />
          <Button
            size="sm"
            variant="primary"
            onClick={handleSearch}
            loading={search.isPending}
          >
            検索
          </Button>
        </div>
        <button
          onClick={() => setShowUnapplied((v) => !v)}
          className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border transition-colors ${
            showUnapplied
              ? "bg-gray-100 text-gray-600 border-gray-200"
              : "bg-teal-50 text-teal-700 border-teal-200"
          }`}
        >
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 4a1 1 0 011-1h16a1 1 0 010 2H4a1 1 0 01-1-1zm3 4a1 1 0 011-1h10a1 1 0 010 2H7a1 1 0 01-1-1zm3 4a1 1 0 011-1h4a1 1 0 010 2h-4a1 1 0 01-1-1z"
            />
          </svg>
          {showUnapplied ? "未申請を含む" : "未申請を除く"}
        </button>
      </div>

      {/* Scrollable area: results + registry */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* ── Search results ── */}
        {search.isPending && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {!search.isPending && !search.data && (
          <p className="text-xs text-gray-400 text-center py-8">
            検索キーワードを入力してください
          </p>
        )}
        {visibleResults.length > 0 && (
          <div className="p-3 space-y-1">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-teal-600 transition-colors"
              >
                <Checkbox checked={allChecked} />
                {allChecked ? "すべて解除" : "すべて選択"}
              </button>
              <Button
                size="sm"
                variant="primary"
                disabled={checkedCols.length === 0}
                onClick={handleRegister}
              >
                {checkedCols.length > 0
                  ? `${checkedCols.length} 件を登録`
                  : "登録"}
              </Button>
            </div>

            {visibleResults.map((col, i) => (
              <button
                key={i}
                onClick={() => hasAccess(col.catalog_name) && toggleCheck(col)}
                className={`w-full text-left px-2.5 py-2.5 rounded-lg border transition-colors ${
                  !hasAccess(col.catalog_name)
                    ? "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
                    : isChecked(col)
                      ? "bg-teal-50 border-teal-300"
                      : "border-gray-100 hover:border-teal-200 hover:bg-teal-50/50"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    <Checkbox checked={isChecked(col)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-900 font-mono truncate">
                      {col.column_name}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {col.catalog_name}.{col.schema_name}.{col.table_name}
                    </p>
                    {col.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {col.description}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-500 rounded-full"
                          style={{ width: `${Math.round(col.score * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">
                        {Math.round(col.score * 100)}%
                      </span>
                    </div>
                    {col.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {col.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-1">
                      {col.owner_user_id && (
                        <span className="text-[10px] text-gray-400 truncate">
                          {col.owner_user_id}
                        </span>
                      )}
                      <Link
                        to="/catalogs/$catalogName"
                        params={{ catalogName: col.catalog_name }}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] text-teal-600 hover:underline flex-shrink-0 ml-auto"
                      >
                        詳細 →
                      </Link>
                    </div>
                    {(() => {
                      const catInfo = getCatalogStatus(col.catalog_name);
                      const accessOk =
                        catInfo &&
                        ["owner", "editor", "viewer"].includes(catInfo.my_role);
                      const isPending =
                        catInfo?.my_request_status === "PENDING";
                      const needsApply = catInfo && !accessOk && !isPending;
                      return (
                        <>
                          {isPending && (
                            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                              審査中
                            </span>
                          )}
                          {needsApply && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                                未申請
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRequestAccess(col.catalog_name);
                                }}
                                className="text-[10px] px-1.5 py-0.5 bg-teal-50 text-teal-600 border border-teal-200 rounded-full hover:bg-teal-100 transition-colors"
                              >
                                申請 →
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Registered columns ── */}
        {registeredColumns.length > 0 && (
          <div className="border-t border-gray-100 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-600">
                登録済みカラム ({registeredColumns.length})
              </p>
              <button
                onClick={onClearAll}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                すべて解除
              </button>
            </div>
            <div className="space-y-1">
              {registeredColumns.map((col, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-teal-50 border border-teal-100"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 font-mono truncate">
                      {col.column_name}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {col.catalog_name}.{col.schema_name}.{col.table_name}
                    </p>
                  </div>
                  <button
                    onClick={() => onUnregister(col)}
                    className="text-gray-300 hover:text-red-400 transition-colors text-base leading-none flex-shrink-0"
                    title="登録解除"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Analyze button */}
      <div className="p-3 border-t border-gray-100">
        <Button
          variant="primary"
          className="w-full"
          disabled={registeredColumns.length === 0}
          onClick={onAnalyze}
        >
          {registeredColumns.length > 0
            ? `${registeredColumns.length} 件で分析`
            : "カラムを登録してください"}
        </Button>
      </div>
    </div>
  );
}
