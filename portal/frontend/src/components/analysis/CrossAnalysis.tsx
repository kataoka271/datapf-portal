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
import { useAnalysisStore } from "@/stores";
import { useUIStore } from "@/stores";
import {
  useCrossSearch,
  useVehicles,
  useVehicleStatus,
  useVehicleTimeseries,
  useVehicleVideo,
  useStatistics,
} from "@/hooks";
import {
  Button,
  Spinner,
  EmptyState,
  PageHeader,
} from "@/components/common/ui";
import type { Region, MatchedColumn, StatResult } from "@/types";

const REGION_OPTIONS: { value: Region; label: string }[] = [
  { value: "japan", label: "日本" },
  { value: "europe", label: "欧州" },
  { value: "north_america", label: "北米" },
];

const COLORS = ["#1D9E75", "#185FA5", "#BA7517", "#993556", "#534AB7"];

const REGION_CENTERS: Record<Region, [number, number]> = {
  japan: [139.69, 35.68],
  europe: [2.35, 48.85],
  north_america: [-74.01, 40.71],
};

// ── Column search panel (left sidebar) ───────────────────────────────────────
function ColumnSearchPanel({
  selectedColumns,
  onToggle,
  onAnalyze,
}: {
  selectedColumns: MatchedColumn[];
  onToggle: (col: MatchedColumn) => void;
  onAnalyze: () => void;
}) {
  const [query, setQuery] = useState("");
  const search = useCrossSearch();

  const isSelected = (col: MatchedColumn) =>
    selectedColumns.some(
      (c) =>
        c.catalog_name === col.catalog_name &&
        c.schema_name === col.schema_name &&
        c.table_name === col.table_name &&
        c.column_name === col.column_name,
    );

  return (
    <div className="w-72 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col h-full">
      <div className="p-4 border-b border-gray-100 space-y-2">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          カラム検索
        </p>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && query && search.mutate({ query })
            }
            placeholder="例: 車速、加速度..."
            className="flex-1 h-8 px-3 text-xs border border-gray-200 rounded-md bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-teal-400"
          />
          <Button
            size="sm"
            variant="primary"
            onClick={() => query && search.mutate({ query })}
            loading={search.isPending}
          >
            検索
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
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
        {(search.data?.matched_columns ?? []).map((col, i) => {
          const selected = isSelected(col);
          return (
            <button
              key={i}
              onClick={() => onToggle(col)}
              className={`w-full text-left px-2.5 py-2.5 rounded-lg border transition-colors ${
                selected
                  ? "bg-teal-50 border-teal-300"
                  : "border-gray-100 hover:border-teal-200 hover:bg-teal-50/50"
              }`}
            >
              <div className="flex items-start gap-2">
                <div
                  className={`mt-0.5 w-3.5 h-3.5 flex-shrink-0 rounded border flex items-center justify-center ${
                    selected
                      ? "bg-teal-600 border-teal-700"
                      : "border-gray-300"
                  }`}
                >
                  {selected && (
                    <svg
                      className="w-2.5 h-2.5 text-white"
                      viewBox="0 0 10 10"
                      fill="none"
                    >
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
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-3 border-t border-gray-100">
        <Button
          variant="primary"
          className="w-full"
          disabled={selectedColumns.length === 0}
          onClick={onAnalyze}
        >
          {selectedColumns.length > 0
            ? `${selectedColumns.length} 件で分析`
            : "カラムを選択してください"}
        </Button>
      </div>
    </div>
  );
}

// ── Vehicle map ────────────────────────────────────────────────────────────────
function VehicleMap({
  vehicles,
  selectedId,
  onSelect,
  region,
}: {
  vehicles: { vehicle_id: string; latitude: number; longitude: number }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  region: Region;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const vehiclesRef = useRef(vehicles);
  vehiclesRef.current = vehicles;

  useEffect(() => {
    if (!containerRef.current) return;
    const center = REGION_CENTERS[region] ?? REGION_CENTERS.japan;
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
              '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center,
      zoom: 8,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    const populateSource = () => {
      const src = map.getSource("vehicles") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!src) return;
      src.setData({
        type: "FeatureCollection",
        features: vehiclesRef.current.map((v) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [v.longitude, v.latitude],
          },
          properties: { vehicle_id: v.vehicle_id },
        })),
      });
    };

    map.on("load", () => {
      map.addSource("vehicles", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "vehicles-dot",
        type: "circle",
        source: "vehicles",
        paint: {
          "circle-radius": 7,
          "circle-color": "#1D9E75",
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1.5,
        },
      });
      populateSource();
      map.on("click", "vehicles-dot", (e) => {
        const id = e.features?.[0]?.properties?.vehicle_id;
        if (id) onSelectRef.current(id);
      });
      map.on("mouseenter", "vehicles-dot", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "vehicles-dot", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("vehicles") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: vehicles.map((v) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [v.longitude, v.latitude],
        },
        properties: { vehicle_id: v.vehicle_id },
      })),
    });
  }, [vehicles]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("vehicles-dot")) return;
    const sid = selectedId ?? "";
    map.setPaintProperty("vehicles-dot", "circle-color", [
      "case",
      ["==", ["get", "vehicle_id"], sid],
      "#E24B4A",
      "#1D9E75",
    ]);
    map.setPaintProperty("vehicles-dot", "circle-radius", [
      "case",
      ["==", ["get", "vehicle_id"], sid],
      10,
      7,
    ]);
  }, [selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: REGION_CENTERS[region] ?? REGION_CENTERS.japan,
      zoom: 8,
      duration: 800,
    });
  }, [region]);

  return (
    <div
      className="rounded-xl overflow-hidden border border-gray-100"
      style={{ height: 400 }}
    >
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

// ── Vehicle status panel ───────────────────────────────────────────────────────
function VehicleStatusPanel({ atTime }: { atTime: string }) {
  const { selectedVehicleId } = useAnalysisStore();
  const { data: status, isLoading } = useVehicleStatus(
    selectedVehicleId,
    atTime + ":00Z",
  );
  const [videoOpen, setVideoOpen] = useState(false);
  const { data: video } = useVehicleVideo(
    selectedVehicleId,
    atTime + ":00Z",
    videoOpen,
  );

  if (!selectedVehicleId) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-center min-h-32">
        <EmptyState
          title="車両を選択してください"
          description="地図上の車両をクリックすると状態が表示されます"
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex justify-center items-center min-h-32">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
      <div>
        <p className="text-xs font-medium text-gray-900 font-mono">
          {selectedVehicleId}
        </p>
        <p className="text-xs text-gray-400">
          {status?.recorded_at
            ? new Date(status.recorded_at).toLocaleString("ja-JP")
            : ""}
        </p>
      </div>
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
      {status?.has_video && (
        <Button
          variant="secondary"
          className="w-full text-xs"
          onClick={() => setVideoOpen(true)}
        >
          動画を見る
        </Button>
      )}
      {videoOpen && video && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-black rounded-xl overflow-hidden w-full max-w-2xl">
            <div className="flex justify-between p-2">
              <span className="text-white/70 text-xs">
                {selectedVehicleId} — 車載動画
              </span>
              <button
                onClick={() => setVideoOpen(false)}
                className="text-white/70 hover:text-white"
              >
                ✕
              </button>
            </div>
            <video
              src={video.presigned_url}
              controls
              className="w-full"
              style={{ maxHeight: "60vh" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timeseries chart ──────────────────────────────────────────────────────────
function TimeseriesChart({
  columns,
  atTime,
}: {
  columns: MatchedColumn[];
  atTime: string;
}) {
  const { selectedVehicleId } = useAnalysisStore();
  const timeFrom = new Date(
    new Date(atTime).getTime() - 10 * 60_000,
  ).toISOString();
  const timeTo = new Date(atTime).toISOString();
  const columnKeys = columns.map(
    (c) => `${c.catalog_name}.${c.schema_name}.${c.table_name}.${c.column_name}`,
  );
  const { data, isLoading } = useVehicleTimeseries(
    selectedVehicleId,
    columnKeys,
    timeFrom,
    timeTo,
  );

  if (!selectedVehicleId || columns.length === 0) return null;

  const merged: Record<string, unknown>[] = [];
  if (data?.series) {
    const allTimes = Array.from(
      new Set(data.series.flatMap((s) => s.data.map((d) => d.timestamp))),
    ).sort();
    allTimes.forEach((t) => {
      const row: Record<string, unknown> = {
        timestamp: new Date(t).toLocaleTimeString("ja-JP"),
      };
      data.series.forEach((s) => {
        const pt = s.data.find((d) => d.timestamp === t);
        row[s.display_name] = pt?.value;
      });
      merged.push(row);
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-xs font-medium text-gray-700 mb-3">時系列チャート</p>
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={merged}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="timestamp" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {(data?.series ?? []).map((s, i) => (
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
  );
}

// ── Vehicle analysis panel ────────────────────────────────────────────────────
function VehiclePanel({ selectedColumns }: { selectedColumns: MatchedColumn[] }) {
  const {
    region,
    atTime,
    selectedVehicleId,
    setRegion,
    setAtTime,
    setSelectedVehicleId,
  } = useAnalysisStore();
  const { data: vehiclesData, isLoading } = useVehicles(region, atTime + ":00Z");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">車両分析</p>
        <div className="flex gap-2">
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as Region)}
            className="h-7 px-2 text-xs border border-gray-200 rounded-md bg-white text-gray-900 outline-none focus:border-teal-400"
          >
            {REGION_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <input
            type="datetime-local"
            value={atTime}
            onChange={(e) => setAtTime(e.target.value)}
            className="h-7 px-2 text-xs border border-gray-200 rounded-md bg-white text-gray-900 outline-none focus:border-teal-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <div className="col-span-3 space-y-3">
          {isLoading ? (
            <div
              className="bg-[#1a2d3a] rounded-xl flex items-center justify-center"
              style={{ height: 400 }}
            >
              <Spinner className="text-white" />
            </div>
          ) : (
            <VehicleMap
              vehicles={vehiclesData?.vehicles ?? []}
              selectedId={selectedVehicleId}
              onSelect={setSelectedVehicleId}
              region={region}
            />
          )}
          <TimeseriesChart columns={selectedColumns} atTime={atTime} />
        </div>
        <div className="col-span-2">
          <VehicleStatusPanel atTime={atTime} />
        </div>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
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

// ── Statistics panel ──────────────────────────────────────────────────────────
function StatisticsPanel({ selectedColumns }: { selectedColumns: MatchedColumn[] }) {
  const { region, selectedVehicleId, setSelectedVehicleId } = useAnalysisStore();
  const [timeFrom, setTimeFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 16);
  });
  const [timeTo, setTimeTo] = useState(() =>
    new Date().toISOString().slice(0, 16),
  );
  const stats = useStatistics();
  const { addToast } = useUIStore();

  const handleRun = () => {
    if (selectedColumns.length === 0) {
      addToast({ type: "error", message: "左パネルでカラムを選択してください" });
      return;
    }
    stats.mutate(
      {
        region,
        time_from: new Date(timeFrom).toISOString(),
        time_to: new Date(timeTo).toISOString(),
        columns: selectedColumns.map(
          (c) =>
            `${c.catalog_name}.${c.schema_name}.${c.table_name}.${c.column_name}`,
        ),
        vehicle_id: selectedVehicleId ?? undefined,
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
        <div className="flex gap-2 items-center flex-wrap">
          {selectedVehicleId && (
            <span className="flex items-center gap-1 px-2.5 py-1 bg-red-50 border border-red-200 rounded-full text-xs text-red-700 font-mono">
              選択中: {selectedVehicleId}
              <button
                onClick={() => setSelectedVehicleId(null)}
                className="text-red-400 hover:text-red-600 ml-0.5"
              >
                ×
              </button>
            </span>
          )}
          <input
            type="datetime-local"
            value={timeFrom}
            onChange={(e) => setTimeFrom(e.target.value)}
            className="h-7 px-2 text-xs border border-gray-200 rounded-md bg-white text-gray-900 outline-none focus:border-teal-400"
          />
          <span className="text-gray-400 text-xs">〜</span>
          <input
            type="datetime-local"
            value={timeTo}
            onChange={(e) => setTimeTo(e.target.value)}
            className="h-7 px-2 text-xs border border-gray-200 rounded-md bg-white text-gray-900 outline-none focus:border-teal-400"
          />
          <Button
            size="sm"
            variant="primary"
            onClick={handleRun}
            loading={stats.isPending}
            disabled={selectedColumns.length === 0}
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
          title={
            selectedColumns.length === 0
              ? "カラムを選択して分析を実行してください"
              : "「分析実行」ボタンを押してください"
          }
          description={
            selectedColumns.length === 0
              ? "左パネルの横断検索でカラムを選択してください"
              : selectedVehicleId
                ? `車両 ${selectedVehicleId} でフィルタして集計します`
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

// ── Main page ─────────────────────────────────────────────────────────────────
export function CrossAnalysis() {
  const [selectedColumns, setSelectedColumns] = useState<MatchedColumn[]>([]);
  const [analyzed, setAnalyzed] = useState(false);

  const toggleColumn = (col: MatchedColumn) => {
    setAnalyzed(false);
    setSelectedColumns((prev) => {
      const key = `${col.catalog_name}.${col.schema_name}.${col.table_name}.${col.column_name}`;
      const exists = prev.some(
        (c) =>
          `${c.catalog_name}.${c.schema_name}.${c.table_name}.${c.column_name}` ===
          key,
      );
      return exists ? prev.filter((c) => `${c.catalog_name}.${c.schema_name}.${c.table_name}.${c.column_name}` !== key) : [...prev, col];
    });
  };

  const handleAnalyze = () => {
    setAnalyzed(true);
  };

  return (
    <div className="flex h-full overflow-hidden">
      <ColumnSearchPanel
        selectedColumns={selectedColumns}
        onToggle={toggleColumn}
        onAnalyze={handleAnalyze}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <PageHeader title="横断分析" />

        {!analyzed && selectedColumns.length === 0 && (
          <div className="flex items-center justify-center py-24">
            <EmptyState
              title="横断検索でカラムを選択してください"
              description="左パネルでキーワードを入力し、分析に使うカラムを選択してください"
            />
          </div>
        )}

        {(analyzed || selectedColumns.length > 0) && (
          <>
            <section>
              <VehiclePanel selectedColumns={selectedColumns} />
            </section>

            <div className="border-t border-gray-100" />

            <section>
              <StatisticsPanel selectedColumns={selectedColumns} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
