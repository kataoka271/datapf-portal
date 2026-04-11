import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CurrentUser, Region } from "@/types";

// ── Auth Store ────────────────────────────────────────────────────────────────
interface AuthState {
  user: CurrentUser | null;
  token: string | null;
  setUser: (user: CurrentUser | null) => void;
  setToken: (token: string | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      clear: () => set({ user: null, token: null }),
    }),
    { name: "auth-store", partialize: (s) => ({ token: s.token }) },
  ),
);

// ── UI Store ──────────────────────────────────────────────────────────────────
interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

interface UIState {
  sidebarOpen: boolean;
  toasts: Toast[];
  setSidebarOpen: (v: boolean) => void;
  addToast: (t: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toasts: [],
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  addToast: (t) =>
    set((s) => ({
      toasts: [...s.toasts, { ...t, id: crypto.randomUUID() }],
    })),
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
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
