import { useVehicleStatus, useVehicleVideo } from "@/hooks";
import { useAnalysisStore } from "@/stores";
import { Spinner, EmptyState } from "@/components/common/ui";

export interface VehicleStatusPanelProps {
  vehicleId: string | null;
  /** Pre-formatted ISO timestamp ready to pass to API hooks */
  atTime: string;
  /**
   * "detailed" – divide-y list with column-toggle buttons.
   *              Also reads selectedColumns/toggleColumn from useAnalysisStore.
   * "compact"  – grid-cols-2 tile layout with inline video player (default).
   */
  variant?: "detailed" | "compact";
}

// ── Detailed variant (used by VehicleAnalysis) ────────────────────────────────
function DetailedPanel({
  vehicleId,
  atTime,
}: {
  vehicleId: string;
  atTime: string;
}) {
  const { selectedColumns, toggleColumn } = useAnalysisStore();
  const { data: status, isLoading } = useVehicleStatus(vehicleId, atTime);

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
          {vehicleId}
        </p>
        <p className="text-xs text-gray-400">
          {status?.recorded_at
            ? new Date(status.recorded_at).toLocaleString("ja-JP")
            : ""}
        </p>
      </div>
      <div className="divide-y divide-gray-50">
        {status?.status_fields.map((f) => {
          const colKey = `${vehicleId}.${f.column_name}`;
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
    </div>
  );
}

// ── Compact variant (used by CrossAnalysis) ───────────────────────────────────
function CompactPanel({
  vehicleId,
  atTime,
}: {
  vehicleId: string;
  atTime: string;
}) {
  const { data: status, isLoading } = useVehicleStatus(vehicleId, atTime);
  const { data: video } = useVehicleVideo(
    vehicleId,
    atTime,
    !!status?.has_video,
  );

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
          {vehicleId}
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

// ── Public component ──────────────────────────────────────────────────────────
export function VehicleStatusPanel({
  vehicleId,
  atTime,
  variant = "compact",
}: VehicleStatusPanelProps) {
  if (!vehicleId) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-4 h-full flex items-center justify-center">
        <EmptyState
          title="車両を選択してください"
          description="地図上の車両をクリックすると状態が表示されます"
        />
      </div>
    );
  }

  if (variant === "detailed") {
    return <DetailedPanel vehicleId={vehicleId} atTime={atTime} />;
  }

  return <CompactPanel vehicleId={vehicleId} atTime={atTime} />;
}
