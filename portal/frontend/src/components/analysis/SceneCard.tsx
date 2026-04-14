import { useState } from "react";
import { useSceneClip } from "@/hooks";
import { Spinner } from "@/components/common/ui";
import type { SceneResult } from "@/types";

function formatScore(score: number) {
  return `${(score * 100).toFixed(0)}%`;
}

function formatDatetime(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function SceneCard({
  scene,
  thumbnailUrl,
}: {
  scene: SceneResult;
  thumbnailUrl?: string;
}) {
  const [isHovering, setIsHovering] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: clip, isLoading: clipLoading } = useSceneClip(
    scene.scene_id,
    isHovering || modalOpen,
  );

  return (
    <>
      <div
        className="bg-white rounded-xl border border-gray-100 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onClick={() => setModalOpen(true)}
      >
        {/* Thumbnail */}
        <div className="relative aspect-video bg-gray-100">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={`scene-${scene.scene_id}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg
                className="w-10 h-10 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
                />
              </svg>
            </div>
          )}

          {/* Similarity badge */}
          <div className="absolute top-2 right-2 bg-teal-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
            {formatScore(scene.similarity_score)}
          </div>

          {/* Play overlay on hover */}
          {(isHovering || clipLoading) && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              {clipLoading ? (
                <Spinner />
              ) : (
                <div className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-teal-700 ml-0.5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7L8 5z" />
                  </svg>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3 space-y-1">
          <p className="text-xs font-medium text-gray-900 font-mono truncate">
            {scene.vehicle_id}
          </p>
          <p className="text-xs text-gray-500">
            {formatDatetime(scene.recorded_at)}
          </p>
          <p className="text-xs text-gray-400 font-mono">
            {scene.latitude.toFixed(5)}, {scene.longitude.toFixed(5)}
          </p>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  シーン詳細
                </p>
                <p className="text-xs text-gray-500 font-mono">
                  {scene.scene_id}
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="p-4">
              {clip ? (
                <video
                  key={clip.presigned_url}
                  src={clip.presigned_url}
                  controls
                  autoPlay
                  className="w-full rounded-lg bg-black aspect-video"
                  onLoadedMetadata={(e) => {
                    (e.target as HTMLVideoElement).currentTime =
                      clip.seek_to_sec;
                  }}
                />
              ) : (
                <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                  <Spinner />
                </div>
              )}

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div>
                  <dt className="text-gray-400">車両 ID</dt>
                  <dd className="font-mono text-gray-700">
                    {scene.vehicle_id}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400">類似度</dt>
                  <dd className="font-semibold text-teal-700">
                    {formatScore(scene.similarity_score)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400">記録日時</dt>
                  <dd className="text-gray-700">
                    {formatDatetime(scene.recorded_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400">位置</dt>
                  <dd className="font-mono text-gray-700">
                    {scene.latitude.toFixed(5)}, {scene.longitude.toFixed(5)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
