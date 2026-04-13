import { useState, useRef, useEffect } from "react";
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
import { MouAgreementModal } from "@/components/catalog/MouAgreementModal";
import { ColumnSearchPanel, colKey } from "./ColumnSearchPanel";
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
  const { data: video } = useVehicleVideo(
    selectedVehicleId,
    atTime + ":00Z",
    !!status?.has_video,
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
      {video && (
        <div className="rounded-lg overflow-hidden bg-black">
          <video src={video.presigned_url} controls className="w-full" />
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
    (c) =>
      `${c.catalog_name}.${c.schema_name}.${c.table_name}.${c.column_name}`,
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
function VehiclePanel({
  selectedColumns,
}: {
  selectedColumns: MatchedColumn[];
}) {
  const {
    region,
    atTime,
    selectedVehicleId,
    setRegion,
    setAtTime,
    setSelectedVehicleId,
  } = useAnalysisStore();
  const { data: vehiclesData, isLoading } = useVehicles(
    region,
    atTime + ":00Z",
  );

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
function StatisticsPanel({
  selectedColumns,
}: {
  selectedColumns: MatchedColumn[];
}) {
  const { region, selectedVehicleId, setSelectedVehicleId } =
    useAnalysisStore();
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
      addToast({
        type: "error",
        message: "左パネルでカラムを登録してください",
      });
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

  // 車両選択時に自動実行
  useEffect(() => {
    if (!selectedVehicleId || selectedColumns.length === 0) return;
    handleRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVehicleId]);

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
              ? "カラムを登録して分析を実行してください"
              : "「分析実行」ボタンを押してください"
          }
          description={
            selectedColumns.length === 0
              ? "左パネルの横断検索でカラムを登録してください"
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
  const [registeredColumns, setRegisteredColumns] = useState<MatchedColumn[]>(
    [],
  );
  const [analyzed, setAnalyzed] = useState(false);
  const [applyTarget, setApplyTarget] = useState<string | null>(null);

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
    setAnalyzed(false);
  };

  const handleClearAll = () => {
    setRegisteredColumns([]);
    setAnalyzed(false);
  };

  const handleAnalyze = () => {
    setAnalyzed(true);
  };

  return (
    <div className="flex h-full overflow-hidden">
      <ColumnSearchPanel
        registeredColumns={registeredColumns}
        onRegister={handleRegister}
        onUnregister={handleUnregister}
        onClearAll={handleClearAll}
        onAnalyze={handleAnalyze}
        onRequestAccess={setApplyTarget}
      />
      {applyTarget && (
        <MouAgreementModal
          catalogName={applyTarget}
          onClose={() => setApplyTarget(null)}
          onSuccess={() => setApplyTarget(null)}
        />
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <PageHeader title="横断分析" />

        {!analyzed && registeredColumns.length === 0 && (
          <div className="flex items-center justify-center py-24">
            <EmptyState
              title="横断検索でカラムを登録してください"
              description="左パネルでキーワードを検索し、カラムを選択して登録してください"
            />
          </div>
        )}

        {(analyzed || registeredColumns.length > 0) && (
          <>
            <section>
              <VehiclePanel selectedColumns={registeredColumns} />
            </section>

            <div className="border-t border-gray-100" />

            <section>
              <StatisticsPanel selectedColumns={registeredColumns} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
