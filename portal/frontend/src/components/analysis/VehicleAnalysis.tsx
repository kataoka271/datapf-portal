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
} from "recharts";
import { useAnalysisStore } from "@/stores";
import {
  useVehicles,
  useVehicleStatus,
  useVehicleTimeseries,
  useVehicleVideo,
} from "@/hooks";
import {
  Button,
  Spinner,
  EmptyState,
  PageHeader,
} from "@/components/common/ui";
import type { Region } from "@/types";

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

// ── Vehicle map (maplibre-gl + OpenStreetMap tiles) ───────────────────────────
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
  const vehiclesRef = useRef(vehicles);

  useEffect(() => {
    onSelectRef.current = onSelect;
    vehiclesRef.current = vehicles;
  });

  // ── Initialize map once ──────────────────────────────────────────────────
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

  // ── Update GeoJSON when vehicles change ──────────────────────────────────
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

  // ── Update paint when selectedId changes ─────────────────────────────────
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

  // ── Fly to region center on region change ─────────────────────────────────
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
      style={{ height: 520 }}
    >
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

// ── Vehicle status right panel ─────────────────────────────────────────────────
function VehicleStatusPanel() {
  const { selectedVehicleId, atTime, selectedColumns, toggleColumn } =
    useAnalysisStore();
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
      <div className="bg-white rounded-xl border border-gray-100 p-4 h-full flex items-center justify-center">
        <EmptyState
          title="車両を選択してください"
          description="地図上の車両をクリックすると状態が表示されます"
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="bg-white rounded-xl border border-gray-100 p-4 flex justify-center items-center"
        style={{ minHeight: 200 }}
      >
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
      <div className="divide-y divide-gray-50">
        {status?.status_fields.map((f) => {
          const colKey = `${selectedVehicleId}.${f.column_name}`;
          const isSelected = selectedColumns.includes(colKey);
          return (
            <div key={f.column_name} className="flex items-center gap-2 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 truncate">
                  {f.display_name}
                </p>
                <p className="text-xs font-medium text-gray-900">
                  {String(f.value)} {f.unit ?? ""}
                </p>
              </div>
              <button
                onClick={() => toggleColumn(colKey)}
                className={`text-xs px-2 py-0.5 rounded border transition-colors flex-shrink-0 ${
                  isSelected
                    ? "bg-teal-600 text-white border-teal-700"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                {isSelected ? "✓" : "+"}
              </button>
            </div>
          );
        })}
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
            <div className="flex justify-end p-2">
              <a
                href={video.presigned_url}
                download
                className="text-xs text-teal-400 hover:text-teal-300"
              >
                ダウンロード
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timeseries chart ──────────────────────────────────────────────────────────
function TimeseriesChart() {
  const { selectedVehicleId, selectedColumns, atTime } = useAnalysisStore();
  const timeFrom = new Date(
    new Date(atTime).getTime() - 10 * 60_000,
  ).toISOString();
  const timeTo = new Date(atTime).toISOString();
  const { data, isLoading } = useVehicleTimeseries(
    selectedVehicleId,
    selectedColumns,
    timeFrom,
    timeTo,
  );

  if (!selectedVehicleId || selectedColumns.length === 0) return null;

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
        <ResponsiveContainer width="100%" height={200}>
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

// ── Main page ─────────────────────────────────────────────────────────────────
export function VehicleAnalysis() {
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
    <div className="p-6 space-y-4">
      <PageHeader title="車両分析" />

      <div className="flex gap-2 flex-wrap">
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value as Region)}
          className="h-8 px-3 text-sm border border-gray-200 rounded-md bg-white text-gray-900 outline-none focus:border-teal-400"
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
          className="h-8 px-3 text-sm border border-gray-200 rounded-md bg-white text-gray-900 outline-none focus:border-teal-400 flex-1"
        />
      </div>

      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3 space-y-4">
          {isLoading ? (
            <div
              className="bg-[#1a2d3a] rounded-xl flex items-center justify-center"
              style={{ height: 520 }}
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
          <TimeseriesChart />
        </div>
        <div className="col-span-2">
          <VehicleStatusPanel />
        </div>
      </div>
    </div>
  );
}
