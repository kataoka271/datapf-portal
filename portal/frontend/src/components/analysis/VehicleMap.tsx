import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { REGION_CENTERS } from "./analysisConstants";
import type { Region } from "@/types";

export interface VehicleMapProps {
  vehicles: { vehicle_id: string; latitude: number; longitude: number }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  region: Region;
  height?: number;
}

export function VehicleMap({
  vehicles,
  selectedId,
  onSelect,
  region,
  height = 520,
}: VehicleMapProps) {
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
      style={{ height }}
    >
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
