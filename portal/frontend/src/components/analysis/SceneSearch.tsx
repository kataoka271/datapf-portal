import { useState } from "react";
import { useSceneSearch } from "@/hooks";
import { useCatalogs } from "@/hooks";
import { useUIStore } from "@/stores";
import {
  Button,
  Spinner,
  EmptyState,
  PageHeader,
} from "@/components/common/ui";
import { SceneCard } from "./SceneCard";
import type { SceneResult } from "@/types";

const DEFAULT_LIMIT = 50;
const DEFAULT_THRESHOLD = 0.5;

export function SceneSearch() {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [scoreThreshold, setScoreThreshold] = useState(DEFAULT_THRESHOLD);
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [vehicleIds, setVehicleIds] = useState("");
  const [selectedCatalogs, setSelectedCatalogs] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const { addToast } = useUIStore();
  const { data: catalogsData } = useCatalogs({ subscribed: true });
  const search = useSceneSearch();

  const catalogs = catalogsData?.items ?? [];

  const handleSearch = () => {
    if (!query.trim()) return;
    const body: Parameters<typeof search.mutate>[0] = {
      query: query.trim(),
      limit,
      score_threshold: scoreThreshold,
    };
    if (timeFrom) body.time_from = timeFrom;
    if (timeTo) body.time_to = timeTo;
    if (vehicleIds.trim()) {
      body.vehicle_ids = vehicleIds
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    }
    search.mutate(body, {
      onError: () =>
        addToast({ type: "error", message: "シーン検索に失敗しました" }),
    });
  };

  const scenes: SceneResult[] = search.data?.scenes ?? [];

  const toggleCatalog = (name: string) => {
    setSelectedCatalogs((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name],
    );
  };

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="動画シーンサーチ"
        description="自然言語クエリで走行動画の類似シーンを検索します"
      />

      {/* Search bar */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="例: 夜間の高速道路、歩行者が横断、渋滞"
            className="flex-1 h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
          <Button
            variant="primary"
            loading={search.isPending}
            onClick={handleSearch}
            disabled={!query.trim()}
          >
            検索
          </Button>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="h-10 px-3 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            絞り込み
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="border-t border-gray-100 pt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Time range */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">
                期間 (開始)
              </label>
              <input
                type="datetime-local"
                value={timeFrom}
                onChange={(e) => setTimeFrom(e.target.value)}
                className="w-full h-8 px-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">
                期間 (終了)
              </label>
              <input
                type="datetime-local"
                value={timeTo}
                onChange={(e) => setTimeTo(e.target.value)}
                className="w-full h-8 px-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {/* Vehicle IDs */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">
                車両 ID (カンマ区切り)
              </label>
              <input
                type="text"
                value={vehicleIds}
                onChange={(e) => setVehicleIds(e.target.value)}
                placeholder="VH-001, VH-002"
                className="w-full h-8 px-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {/* Limit */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">
                取得件数 (最大 200)
              </label>
              <input
                type="number"
                value={limit}
                min={1}
                max={200}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full h-8 px-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {/* Score threshold */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">
                類似度しきい値: {scoreThreshold.toFixed(2)}
              </label>
              <input
                type="range"
                value={scoreThreshold}
                min={0}
                max={1}
                step={0.05}
                onChange={(e) => setScoreThreshold(Number(e.target.value))}
                className="w-full accent-teal-600"
              />
            </div>

            {/* Catalog filter */}
            {catalogs.length > 0 && (
              <div className="space-y-1 md:col-span-2 lg:col-span-3">
                <label className="text-xs font-medium text-gray-600">
                  カタログ絞り込み
                </label>
                <div className="flex flex-wrap gap-2">
                  {catalogs.map((cat) => {
                    const selected = selectedCatalogs.includes(
                      cat.catalog_name,
                    );
                    return (
                      <button
                        key={cat.catalog_name}
                        onClick={() => toggleCatalog(cat.catalog_name)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          selected
                            ? "bg-teal-600 text-white border-teal-600"
                            : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {cat.display_name || cat.catalog_name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {search.isPending && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {search.data && !search.isPending && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">
                {search.data.total}
              </span>{" "}
              件のシーンが見つかりました
              <span className="ml-2 text-gray-400">
                「{search.data.query}」
              </span>
            </p>
          </div>

          {scenes.length === 0 ? (
            <EmptyState
              title="シーンが見つかりませんでした"
              description="クエリや絞り込み条件を変えてお試しください"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {scenes.map((scene) => (
                <SceneCard
                  key={scene.scene_id}
                  scene={scene}
                  thumbnailUrl={scene.thumbnail_url}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!search.data && !search.isPending && (
        <EmptyState
          title="シーンを検索してください"
          description="上のフォームに自然言語クエリを入力して検索を開始します"
        />
      )}
    </div>
  );
}
