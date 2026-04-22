import { create } from "zustand";
import type { CurrentUser, Region } from "@/types";

// ── Auth Store ────────────────────────────────────────────────────────────────
// Auth is handled by the Databricks Apps proxy. User info is fetched from /v1/auth/me on startup.
interface AuthState {
  user: CurrentUser | null;
  setUser: (user: CurrentUser | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clear: () => set({ user: null }),
}));

// ── UI Store ──────────────────────────────────────────────────────────────────
interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

interface UIState {
  sidebarOpen: boolean;
  toasts: Toast[];
  language: "ja" | "en";
  setSidebarOpen: (v: boolean) => void;
  addToast: (t: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  setLanguage: (lang: "ja" | "en") => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toasts: [],
  language: navigator.language.startsWith("ja") ? "ja" : "en",
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  addToast: (t) =>
    set((s) => ({
      toasts: [...s.toasts, { ...t, id: crypto.randomUUID() }],
    })),
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setLanguage: (language) => set({ language }),
}));

// ── Analysis Store ────────────────────────────────────────────────────────────
interface AnalysisState {
  region: Region;
  atTime: string;
  selectedVehicleId: string | null;
  selectedColumns: string[];
  setRegion: (r: Region) => void;
  setAtTime: (t: string) => void;
  setSelectedVehicleId: (id: string | null) => void;
  toggleColumn: (col: string) => void;
  clearColumns: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  region: "japan",
  atTime: new Date().toISOString().slice(0, 16),
  selectedVehicleId: null,
  selectedColumns: [],
  setRegion: (region) => set({ region }),
  setAtTime: (atTime) => set({ atTime }),
  setSelectedVehicleId: (selectedVehicleId) => set({ selectedVehicleId }),
  toggleColumn: (col) =>
    set((s) => ({
      selectedColumns: s.selectedColumns.includes(col)
        ? s.selectedColumns.filter((c) => c !== col)
        : [...s.selectedColumns, col],
    })),
  clearColumns: () => set({ selectedColumns: [] }),
}));
