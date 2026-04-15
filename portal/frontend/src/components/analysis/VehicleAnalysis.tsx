import { useAnalysisStore } from "@/stores";
import { useVehicles, useVehicleVideo } from "@/hooks";
import { Spinner, PageHeader } from "@/components/common/ui";
import { REGION_OPTIONS } from "./analysisConstants";
import { VehicleMap } from "./VehicleMap";
import { VehicleStatusPanel } from "./VehicleStatusPanel";
import { TimeseriesChart } from "./TimeseriesChart";
import type { Region } from "@/types";

export function VehicleAnalysis() {
  const {
    region,
    atTime,
    selectedVehicleId,
    selectedColumns,
    setRegion,
    setAtTime,
    setSelectedVehicleId,
  } = useAnalysisStore();
  const { data: vehiclesData, isLoading } = useVehicles(
    region,
    atTime + ":00Z",
  );
  const { data: videoData } = useVehicleVideo(
    selectedVehicleId,
    atTime + ":00Z",
    !!selectedVehicleId,
  );

  const timeFrom = new Date(
    new Date(atTime).getTime() - 10 * 60_000,
  ).toISOString();
  const timeTo = new Date(atTime).toISOString();

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
          <TimeseriesChart
            vehicleId={selectedVehicleId}
            columnKeys={selectedColumns}
            timeFrom={timeFrom}
            timeTo={timeTo}
          />
        </div>
        <div className="col-span-2 space-y-4">
          <VehicleStatusPanel
            vehicleId={selectedVehicleId}
            atTime={atTime + ":00Z"}
            variant="detailed"
          />
          {videoData && (
            <div className="w-full bg-black rounded-xl overflow-hidden">
              <video
                key={videoData.presigned_url}
                src={videoData.presigned_url}
                controls
                autoPlay
                className="w-full"
              />
              <div className="flex justify-end p-2">
                <a
                  href={videoData.presigned_url}
                  download
                  className="text-xs text-teal-400 hover:text-teal-300"
                >
                  ダウンロード
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
