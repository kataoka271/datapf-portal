import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useStatistics } from "@/hooks";
import { useUIStore } from "@/stores";
import {
  Button,
  Spinner,
  EmptyState,
  PageHeader,
} from "@/components/common/ui";
import { MouAgreementModal } from "@/components/catalog/MouAgreementModal";
import { ColumnSearchPanel, colKey } from "./ColumnSearchPanel";
import { REGION_OPTIONS, CHART_COLORS } from "./analysisConstants";
import type { Region, StatResult, MatchedColumn } from "@/types";

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  stat,
  color,
  onRemove,
}: {
  stat: StatResult;
  color: string;
  onRemove: () => void;
}) {
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
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: color }}
          />
          <button
            onClick={onRemove}
            className="text-gray-300 hover:text-gray-500 text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* Tab selector */}
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

// ── Main page ─────────────────────────────────────────────────────────────────
export function StatisticsAnalysis() {
  const [region, setRegion] = useState<Region>("japan");
  const [timeFrom, setTimeFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 16);
  });
  const [timeTo, setTimeTo] = useState(() =>
    new Date().toISOString().slice(0, 16),
  );
  const [registeredColumns, setRegisteredColumns] = useState<MatchedColumn[]>(
    [],
  );
  const [applyTarget, setApplyTarget] = useState<string | null>(null);
  const stats = useStatistics();
  const { addToast } = useUIStore();

  const handleRegister = (cols: MatchedColumn[]) => {
    setRegisteredColumns((prev) => {
      const next = [...prev];
      for (const col of cols) {
        if (!next.some((c) => colKey(c) === colKey(col))) {
          next.push(col);
        }
      }
      return next;
    });
  };

  const handleUnregister = (col: MatchedColumn) =>
    setRegisteredColumns((prev) => prev.filter((c) => colKey(c) !== colKey(col)));

  const handleClearAll = () => setRegisteredColumns([]);

  const handleAnalyze = () => {
    if (registeredColumns.length === 0) {
      addToast({ type: "error", message: "カラムを追加してください" });
      return;
    }
    stats.mutate(
      {
        region,
        time_from: new Date(timeFrom).toISOString(),
        time_to: new Date(timeTo).toISOString(),
        columns: registeredColumns.map((c) => colKey(c)),
      },
      {
        onError: () =>
          addToast({ type: "error", message: "統計分析に失敗しました" }),
      },
    );
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

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <PageHeader title="統計分析" />

        {/* Toolbar */}
        <div className="flex gap-2 flex-wrap items-center">
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
            value={timeFrom}
            onChange={(e) => setTimeFrom(e.target.value)}
            className="h-8 px-3 text-sm border border-gray-200 rounded-md bg-white text-gray-900 outline-none focus:border-teal-400"
          />
          <span className="text-gray-400 text-sm">〜</span>
          <input
            type="datetime-local"
            value={timeTo}
            onChange={(e) => setTimeTo(e.target.value)}
            className="h-8 px-3 text-sm border border-gray-200 rounded-md bg-white text-gray-900 outline-none focus:border-teal-400"
          />
          <Button
            size="sm"
            variant="primary"
            onClick={handleAnalyze}
            loading={stats.isPending}
            className="ml-auto"
          >
            分析実行
          </Button>
        </div>

        {/* Results */}
        {stats.isPending ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !stats.data ? (
          registeredColumns.length === 0 ? (
            <EmptyState
              title="カラムを追加して分析を実行してください"
              description="左パネルの横断検索でカラムを選択し、「分析」ボタンを押してください"
            />
          ) : (
            <EmptyState title="「分析」ボタンを押してください" />
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.data.stats.map((s, i) => (
              <StatCard
                key={s.column_full_name}
                stat={s}
                color={CHART_COLORS[i % CHART_COLORS.length]}
                onRemove={() =>
                  handleUnregister(
                    registeredColumns.find(
                      (c) => colKey(c) === s.column_full_name,
                    ) ?? registeredColumns[i],
                  )
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
