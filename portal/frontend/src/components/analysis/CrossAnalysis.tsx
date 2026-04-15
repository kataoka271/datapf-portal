import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAnalysisStore } from "@/stores";
import { useUIStore } from "@/stores";
import { useVehicles, useStatistics } from "@/hooks";
import {
  Button,
  Spinner,
  EmptyState,
  PageHeader,
} from "@/components/common/ui";
import { MouAgreementModal } from "@/components/catalog/MouAgreementModal";
import { ColumnSearchPanel, colKey } from "./ColumnSearchPanel";
import { REGION_OPTIONS, CHART_COLORS } from "./analysisConstants";
import { VehicleMap } from "./VehicleMap";
import { VehicleStatusPanel } from "./VehicleStatusPanel";
import { TimeseriesChart } from "./TimeseriesChart";
import type { Region, MatchedColumn, StatResult } from "@/types";

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

  const timeFrom = new Date(
    new Date(atTime).getTime() - 10 * 60_000,
  ).toISOString();
  const timeTo = new Date(atTime).toISOString();
  const columnKeys = selectedColumns.map(
    (c) =>
      `${c.catalog_name}.${c.schema_name}.${c.table_name}.${c.column_name}`,
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
              height={400}
            />
          )}
          <TimeseriesChart
            vehicleId={selectedVehicleId}
            columnKeys={columnKeys}
            timeFrom={timeFrom}
            timeTo={timeTo}
            height={180}
          />
        </div>
        <div className="col-span-2">
          <VehicleStatusPanel
            vehicleId={selectedVehicleId}
            atTime={atTime + ":00Z"}
          />
        </div>
      </div>
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
              color={CHART_COLORS[i % CHART_COLORS.length]}
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
