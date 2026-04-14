import { useState } from "react";
import { useSceneClip } from "@/hooks";
import { Spinner } from "@/components/common/ui";
import type { SceneResult } from "@/types";

function formatScore(score: number) {
  return `${(score * 100).toFixed(0)}%`;
}

function scoreBadgeClass(score: number) {
  if (score >= 0.8) return "bg-green-600 text-white";
  if (score >= 0.6) return "bg-amber-500 text-white";
  return "bg-red-500 text-white";
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
  selected,
  onSelect,
}: {
  scene: SceneResult;
  selected?: boolean;
  onSelect?: (scene: SceneResult) => void;
}) {
  const [isHovering, setIsHovering] = useState(false);

  const { data: clip, isLoading: clipLoading } = useSceneClip(
    scene.scene_id,
    isHovering,
  );

  return (
    <div
      className={`bg-white rounded-xl border overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${
        selected ? "border-teal-500 ring-2 ring-teal-400/30" : "border-gray-100"
      }`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={() => onSelect?.(scene)}
    >
      {/* Thumbnail + hover video overlay */}
      <div className="relative aspect-video bg-gray-100">
        {scene.thumbnail_url ? (
          <img
            src={scene.thumbnail_url}
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
        <div
          className={`absolute top-2 right-2 text-xs font-semibold px-2 py-0.5 rounded-full ${scoreBadgeClass(scene.similarity_score)}`}
        >
          {formatScore(scene.similarity_score)}
        </div>

        {/* Hover overlay: spinner while loading, video when ready */}
        {isHovering && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            {clipLoading ? (
              <Spinner />
            ) : clip ? (
              <video
                key={clip.clip_url}
                src={clip.clip_url}
                autoPlay
                muted
                loop
                className="absolute inset-0 w-full h-full object-cover"
                onLoadedMetadata={(e) => {
                  if (clip.seek_to_sec > 0) {
                    (e.target as HTMLVideoElement).currentTime =
                      clip.seek_to_sec;
                  }
                }}
              />
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
  );
}
