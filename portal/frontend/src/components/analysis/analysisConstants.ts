import type { Region } from "@/types";

export const REGION_OPTIONS: { value: Region; label: string }[] = [
  { value: "japan", label: "日本" },
  { value: "europe", label: "欧州" },
  { value: "north_america", label: "北米" },
];

export const REGION_CENTERS: Record<Region, [number, number]> = {
  japan: [139.69, 35.68],
  europe: [2.35, 48.85],
  north_america: [-74.01, 40.71],
};

export const CHART_COLORS = [
  "#1D9E75",
  "#185FA5",
  "#BA7517",
  "#993556",
  "#534AB7",
];
