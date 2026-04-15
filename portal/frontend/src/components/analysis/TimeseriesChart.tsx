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
import { useVehicleTimeseries } from "@/hooks";
import { Spinner } from "@/components/common/ui";
import { CHART_COLORS } from "./analysisConstants";

export interface TimeseriesChartProps {
  vehicleId: string | null;
  /** Column keys in "catalog.schema.table.column" format */
  columnKeys: string[];
  timeFrom: string;
  timeTo: string;
  height?: number;
}

export function TimeseriesChart({
  vehicleId,
  columnKeys,
  timeFrom,
  timeTo,
  height = 200,
}: TimeseriesChartProps) {
  const { data, isLoading } = useVehicleTimeseries(
    vehicleId,
    columnKeys,
    timeFrom,
    timeTo,
  );

  if (!vehicleId || columnKeys.length === 0) return null;

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
        <ResponsiveContainer width="100%" height={height}>
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
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
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
