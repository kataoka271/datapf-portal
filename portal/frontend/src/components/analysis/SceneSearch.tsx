import { useState, useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import {
  useSceneSearch,
  useVehicleStatus,
  useVehicleTimeseries,
  useVehicleVideo,
  useStatistics,
} from "@/hooks";
import { useUIStore } from "@/stores";
import {
  Button,
  Spinner,
  EmptyState,
  PageHeader,
} from "@/components/common/ui";
import { MouAgreementModal } from "@/components/catalog/MouAgreementModal";
import { ColumnSearchPanel, colKey } from "./ColumnSearchPanel";
import { SceneCard } from "./SceneCard";
import type { MatchedColumn, SceneResult, StatResult } from "@/types";

const COLORS = ["#1D9E75", "#185FA5", "#BA7517", "#993556", "#534AB7"];

type SelectedScene = {
  scene_id: string;
  vehicle_id: string;
  recorded_at: string;
};

// ── Scene map (maplibre-gl + OSM) ─────────────────────────────────────────────
function SceneMap({
  scenes,
  vehicleFilter,
  onClickVehicle,
}: {
  scenes: SceneResult[];
  vehicleFilter: string | null;
  onClickVehicle: (vehicleId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onClickRef = useRef(onClickVehicle);
  const scenesRef = useRef(scenes);
  const vehicleFilterRef = useRef(vehicleFilter);

  useEffect(() => {
    onClickRef.current = onClickVehicle;
    scenesRef.current = scenes;
    vehicleFilterRef.current = vehicleFilter;
  });

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution:
              '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [139.69, 35.68],
      zoom: 9,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    const updateSource = () => {
      const src = map.getSource("scenes") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!src) return;
      src.setData({
        type: "FeatureCollection",
        features: scenesRef.current.map((s) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [s.longitude, s.latitude],
          },
          properties: { vehicle_id: s.vehicle_id, scene_id: s.scene_id },
        })),
      });
    };

    map.on("load", () => {
      map.addSource("scenes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 30,
      });
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "scenes",
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": 14,
          "circle-color": "#1D9E75",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "scenes",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-size": 11,
        },
        paint: { "text-color": "#fff" },
      });
      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "scenes",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 7,
          "circle-color": [
            "case",
            ["==", ["get", "vehicle_id"], vehicleFilterRef.current ?? ""],
            "#0F6E56",
            "#1D9E75",
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#fff",
        },
      });
      updateSource();

      map.on("click", "unclustered-point", (e) => {
        const vid = e.features?.[0]?.properties?.vehicle_id;
        if (vid) onClickRef.current(vid);
      });
      map.on("mouseenter", "unclustered-point", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "unclustered-point", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // mount-only: map is initialized once

  // Update scene dots when scenes change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("scenes") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: scenes.map((s) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [s.longitude, s.latitude],
        },
        properties: { vehicle_id: s.vehicle_id, scene_id: s.scene_id },
      })),
    });
    // Fit bounds when scenes arrive
    if (scenes.length > 0) {
      const lons = scenes.map((s) => s.longitude);
      const lats = scenes.map((s) => s.latitude);
      map.fitBounds(
        [
          [Math.min(...lons) - 0.02, Math.min(...lats) - 0.02],
          [Math.max(...lons) + 0.02, Math.max(...lats) + 0.02],
        ],
        { padding: 30, maxZoom: 13, duration: 600 },
      );
    }
  }, [scenes]);

  // Update dot colors when vehicleFilter changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("unclustered-point")) return;
    map.setPaintProperty("unclustered-point", "circle-color", [
      "case",
      ["==", ["get", "vehicle_id"], vehicleFilter ?? ""],
      "#0F6E56",
      "#1D9E75",
    ]);
  }, [vehicleFilter]);

  return (
    <div
      className="rounded-xl overflow-hidden border border-gray-100"
      style={{ height: 340 }}
    >
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ stat, color }: { stat: StatResult; color: string }) {
  const [tab, setTab] = useState<"histogram" | "stats">("histogram");
  const histData = stat.histogram.map((b) => ({
    range: `${b.bin_start.toFixed(1)}–${b.bin_end.toFixed(1)}`,
    count: b.count,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-medium text-gray-900 font-mono">
            {stat.display_name}
          </p>
          <p className="text-xs text-gray-400 font-mono truncate max-w-xs">
            {stat.column_full_name}
          </p>
        </div>
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5"
          style={{ background: color }}
        />
      </div>
      <div className="flex gap-1 mb-3">
        {(["histogram", "stats"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
              tab === t
                ? "bg-teal-600 text-white border-teal-700"
                : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {t === "histogram" ? "ヒストグラム" : "統計値"}
          </button>
        ))}
      </div>
      {tab === "histogram" ? (
        histData.length === 0 ? (
          <EmptyState title="ヒストグラムデータなし" />
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart
              data={histData}
              margin={{ top: 0, right: 0, bottom: 20, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="range"
                tick={{ fontSize: 9 }}
                angle={-30}
                textAnchor="end"
              />
              <YAxis tick={{ fontSize: 9 }} width={30} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="count" fill={color} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "レコード数", value: stat.count.toLocaleString() },
            { label: "NULL 数", value: stat.null_count.toLocaleString() },
            { label: "平均", value: stat.mean.toFixed(3) },
            { label: "標準偏差", value: stat.stddev.toFixed(3) },
            { label: "最小", value: stat.min.toFixed(3) },
            { label: "25%", value: stat.p25.toFixed(3) },
            { label: "中央値", value: stat.p50.toFixed(3) },
            { label: "75%", value: stat.p75.toFixed(3) },
            { label: "最大", value: stat.max.toFixed(3) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-50 rounded-md p-2">
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-sm font-medium text-gray-900 font-mono">
                {value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Vehicle analysis panel ────────────────────────────────────────────────────
function VehicleAnalysisSection({
  vehicleId,
  atTime,
  columns,
}: {
  vehicleId: string;
  atTime: string;
  columns: MatchedColumn[];
}) {
  const { data: status, isLoading: statusLoading } = useVehicleStatus(
    vehicleId,
    atTime,
  );
  const { data: video } = useVehicleVideo(
    vehicleId,
    atTime,
    !!status?.has_video,
  );

  const columnKeys = columns.map(
    (c) =>
      `${c.catalog_name}.${c.schema_name}.${c.table_name}.${c.column_name}`,
  );
  const timeFrom = new Date(
    new Date(atTime).getTime() - 10 * 60_000,
  ).toISOString();
  const timeTo = atTime;
  const { data: tsData, isLoading: tsLoading } = useVehicleTimeseries(
    vehicleId,
    columnKeys,
    timeFrom,
    timeTo,
  );

  const merged: Record<string, unknown>[] = [];
  if (tsData?.series) {
    const allTimes = Array.from(
      new Set(tsData.series.flatMap((s) => s.data.map((d) => d.timestamp))),
    ).sort();
    allTimes.forEach((t) => {
      const row: Record<string, unknown> = {
        timestamp: new Date(t).toLocaleTimeString("ja-JP"),
      };
      tsData.series.forEach((s) => {
        const pt = s.data.find((d) => d.timestamp === t);
        row[s.display_name] = pt?.value;
      });
      merged.push(row);
    });
  }

  return (
    <div className="grid grid-cols-5 gap-4">
      {/* Status panel */}
      <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        {statusLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              {status?.status_fields.map((f) => (
                <div
                  key={f.column_name}
                  className="bg-gray-50 rounded-md px-2.5 py-2"
                >
                  <p className="text-xs text-gray-400">{f.display_name}</p>
                  <p className="text-xs font-medium text-gray-900 font-mono">
                    {String(f.value)} {f.unit ?? ""}
                  </p>
                </div>
              ))}
            </div>
            {video && (
              <div className="rounded-lg overflow-hidden bg-black">
                <video src={video.presigned_url} controls className="w-full" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Timeseries chart */}
      <div className="col-span-3 bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs font-medium text-gray-700 mb-3">時系列チャート</p>
        {columns.length === 0 ? (
          <EmptyState
            title="カラム未登録"
            description="左パネルで分析カラムを登録してください"
          />
        ) : tsLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={merged}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="timestamp" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {(tsData?.series ?? []).map((s, i) => (
                <Line
                  key={s.column_full_name}
                  type="monotone"
                  dataKey={s.display_name}
                  stroke={COLORS[i % COLORS.length]}
                  dot={false}
                  strokeWidth={1.5}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ── Statistics panel ──────────────────────────────────────────────────────────
function StatisticsSection({
  columns,
  selectedScene,
  sceneTimeFrom,
  sceneTimeTo,
}: {
  columns: MatchedColumn[];
  selectedScene: SelectedScene | null;
  sceneTimeFrom: string | undefined;
  sceneTimeTo: string | undefined;
}) {
  const stats = useStatistics();
  const { addToast } = useUIStore();
  const [vehicleOverride, setVehicleOverride] = useState<string | null>(
    selectedScene?.vehicle_id ?? null,
  );

  const handleRun = () => {
    if (!sceneTimeFrom || !sceneTimeTo) return;
    stats.mutate(
      {
        time_from: sceneTimeFrom,
        time_to: sceneTimeTo,
        columns: columns.map(
          (c) =>
            `${c.catalog_name}.${c.schema_name}.${c.table_name}.${c.column_name}`,
        ),
        vehicle_id: vehicleOverride ?? undefined,
      },
      {
        onError: () =>
          addToast({ type: "error", message: "統計分析に失敗しました" }),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-gray-700">統計分析</p>
        <div className="flex items-center gap-2 flex-wrap">
          {vehicleOverride && (
            <span className="flex items-center gap-1 px-2.5 py-1 bg-teal-50 border border-teal-200 rounded-full text-xs text-teal-700 font-mono">
              選択中: {vehicleOverride}
              <button
                onClick={() => setVehicleOverride(null)}
                className="text-teal-400 hover:text-teal-600 ml-0.5"
              >
                ×
              </button>
            </span>
          )}
          <Button
            size="sm"
            variant="primary"
            onClick={handleRun}
            loading={stats.isPending}
            disabled={columns.length === 0}
          >
            分析実行
          </Button>
        </div>
      </div>

      {stats.isPending ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : !stats.data ? (
        <EmptyState
          title="シーンを選択すると自動実行します"
          description={
            vehicleOverride
              ? `車両 ${vehicleOverride} でフィルタして集計します`
              : "全車両を対象に集計します"
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.data.stats.map((s, i) => (
            <StatCard
              key={s.column_full_name}
              stat={s}
              color={COLORS[i % COLORS.length]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main SceneSearch page ─────────────────────────────────────────────────────
export function SceneSearch() {
  const [query, setQuery] = useState("");
  const [, setSubmittedQuery] = useState("");
  const [selectedScene, setSelectedScene] = useState<SelectedScene | null>(
    null,
  );
  const [vehicleFilter, setVehicleFilter] = useState<string | null>(null);
  const [scoreThresholdUI, setScoreThresholdUI] = useState(50); // 0-100 for slider
  const [sortOrder, setSortOrder] = useState<"similarity" | "datetime">(
    "similarity",
  );
  const [registeredColumns, setRegisteredColumns] = useState<MatchedColumn[]>(
    [],
  );
  const [applyTarget, setApplyTarget] = useState<string | null>(null);

  const { addToast } = useUIStore();
  const search = useSceneSearch();

  const handleSearch = () => {
    if (!query.trim()) return;
    setSubmittedQuery(query.trim());
    setSelectedScene(null); // Reset selection on new search
    search.mutate(
      {
        query: query.trim(),
        limit: 50,
        score_threshold: scoreThresholdUI / 100,
      },
      {
        onError: () =>
          addToast({ type: "error", message: "シーン検索に失敗しました" }),
      },
    );
  };

  const allScenes: SceneResult[] = search.data?.scenes ?? [];

  // Client-side filter + sort
  const filteredScenes = allScenes
    .filter((s) => s.similarity_score >= scoreThresholdUI / 100)
    .filter((s) => !vehicleFilter || s.vehicle_id === vehicleFilter)
    .sort((a, b) =>
      sortOrder === "similarity"
        ? b.similarity_score - a.similarity_score
        : new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
    );

  // Time range from search results for statistics
  const times = allScenes.map((s) => new Date(s.recorded_at).getTime());
  const sceneTimeFrom =
    times.length > 0
      ? new Date(Math.min(...times) - 30 * 60_000).toISOString()
      : undefined;
  const sceneTimeTo =
    times.length > 0
      ? new Date(Math.max(...times) + 30 * 60_000).toISOString()
      : undefined;

  const toggleVehicleFilter = (vehicleId: string) => {
    setVehicleFilter((prev) => (prev === vehicleId ? null : vehicleId));
  };

  const handleSelectScene = (scene: SceneResult) => {
    setSelectedScene((prev) =>
      prev?.scene_id === scene.scene_id
        ? null
        : {
            scene_id: scene.scene_id,
            vehicle_id: scene.vehicle_id,
            recorded_at: scene.recorded_at,
          },
    );
  };

  const handleRegister = (cols: MatchedColumn[]) => {
    setRegisteredColumns((prev) => {
      const next = [...prev];
      cols.forEach((col) => {
        if (!next.some((c) => colKey(c) === colKey(col))) next.push(col);
      });
      return next;
    });
  };

  const handleUnregister = (col: MatchedColumn) => {
    setRegisteredColumns((prev) =>
      prev.filter((c) => colKey(c) !== colKey(col)),
    );
  };

  const handleClearAll = () => {
    setRegisteredColumns([]);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left sidebar ── */}
      <ColumnSearchPanel
        registeredColumns={registeredColumns}
        onRegister={handleRegister}
        onUnregister={handleUnregister}
        onClearAll={handleClearAll}
        onAnalyze={() => {}}
        onRequestAccess={setApplyTarget}
      />

      {applyTarget && (
        <MouAgreementModal
          catalogName={applyTarget}
          onClose={() => setApplyTarget(null)}
          onSuccess={() => setApplyTarget(null)}
        />
      )}

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <PageHeader
          title="動画シーンサーチ"
          description="自然言語でシーンを説明して走行動画から類似フレームを検索します"
        />

        {/* ── Scene search bar ── */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            シーン検索
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="シーンを説明してください..."
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
          </div>
          <p className="text-xs text-gray-400">
            例: 急ブレーキ / 交差点での一時停止 / 高速道路合流
          </p>
        </div>

        {/* ── Loading ── */}
        {search.isPending && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {/* ── Results ── */}
        {search.data && !search.isPending && (
          <>
            {/* Map + scene list */}
            <div className="grid grid-cols-5 gap-4">
              {/* Map (2/5) */}
              <div className="col-span-2 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  撮影位置
                  {vehicleFilter && (
                    <button
                      onClick={() => setVehicleFilter(null)}
                      className="ml-2 normal-case text-teal-600 hover:text-teal-800"
                    >
                      {vehicleFilter} ×
                    </button>
                  )}
                </p>
                <SceneMap
                  scenes={allScenes}
                  vehicleFilter={vehicleFilter}
                  onClickVehicle={toggleVehicleFilter}
                />
              </div>

              {/* Scene list (3/5) */}
              <div className="col-span-3 space-y-3">
                {/* List header */}
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-500">
                    <span className="font-semibold text-gray-800">
                      {filteredScenes.length}
                    </span>{" "}
                    件
                    {vehicleFilter && (
                      <span className="ml-1 text-teal-600">
                        ({vehicleFilter})
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 flex items-center gap-1.5">
                      類似度下限: {scoreThresholdUI}%
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={scoreThresholdUI}
                        onChange={(e) =>
                          setScoreThresholdUI(Number(e.target.value))
                        }
                        className="w-20 accent-teal-600"
                      />
                    </label>
                    <select
                      value={sortOrder}
                      onChange={(e) =>
                        setSortOrder(e.target.value as typeof sortOrder)
                      }
                      className="h-7 px-2 text-xs border border-gray-200 rounded-md bg-white text-gray-900 outline-none focus:border-teal-400"
                    >
                      <option value="similarity">類似度▼</option>
                      <option value="datetime">撮影日時▼</option>
                    </select>
                  </div>
                </div>

                {filteredScenes.length === 0 ? (
                  <EmptyState
                    title="マッチするシーンが見つかりませんでした"
                    description="別のキーワードや類似度下限を変えてお試しください"
                  />
                ) : (
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 max-h-[340px] overflow-y-auto pr-1">
                    {filteredScenes.map((scene) => (
                      <SceneCard
                        key={scene.scene_id}
                        scene={scene}
                        selected={selectedScene?.scene_id === scene.scene_id}
                        onSelect={handleSelectScene}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Vehicle analysis panel (shows on scene select, no columns required) ── */}
            {selectedScene && (
              <>
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3">
                    車両分析
                    <span className="ml-2 text-xs font-normal text-gray-400 font-mono">
                      {selectedScene.vehicle_id} |{" "}
                      {new Date(selectedScene.recorded_at).toLocaleString(
                        "ja-JP",
                      )}
                    </span>
                  </p>
                  <VehicleAnalysisSection
                    vehicleId={selectedScene.vehicle_id}
                    atTime={selectedScene.recorded_at}
                    columns={registeredColumns}
                  />
                </div>

                {/* ── Statistics panel (shown when columns are registered) ── */}
                {registeredColumns.length > 0 && (
                  <div className="border-t border-gray-100 pt-4">
                    <StatisticsSection
                      key={selectedScene?.scene_id}
                      columns={registeredColumns}
                      selectedScene={selectedScene}
                      sceneTimeFrom={sceneTimeFrom}
                      sceneTimeTo={sceneTimeTo}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Initial empty state ── */}
        {!search.data && !search.isPending && (
          <EmptyState
            title="シーンを説明して検索してください"
            description="上のフォームに自然言語クエリを入力して検索を開始します"
          />
        )}
      </div>
    </div>
  );
}
