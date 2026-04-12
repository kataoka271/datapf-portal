import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { clsx } from "clsx";
import { useAuthStore, useUIStore } from "@/stores";
import { useNotifications, useMarkAllRead } from "@/hooks";
import { NotifIcon } from "./ui";
import type { ReactNode } from "react";

// ── Sidebar nav items ─────────────────────────────────────────────────────────
const NAV = [
  {
    group: "データカタログ",
    items: [
      {
        label: "マーケットプレイス",
        to: "/catalogs/marketplace",
        icon: "M4 6h16M4 10h16M4 14h8",
      },
      {
        label: "横断検索",
        to: "/catalogs/search",
        icon: "M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z",
      },
    ],
  },
  {
    group: "データアプリ",
    items: [
      {
        label: "アプリ一覧",
        to: "/apps",
        icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2zm0 8a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2z",
      },
    ],
  },
  {
    group: "データ分析",
    items: [
      {
        label: "横断分析",
        to: "/analysis/cross",
        icon: "M4 6h16M4 12h16M4 18h7m4-6l3 3-3 3",
      },
      {
        label: "車両分析",
        to: "/analysis/vehicles",
        icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4",
      },
      {
        label: "統計分析",
        to: "/analysis/statistics",
        icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
      },
    ],
  },
  {
    group: "管理",
    items: [
      {
        label: "品質アラート",
        to: "/alerts",
        icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
      },
      {
        label: "通知",
        to: "/notifications",
        icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
      },
    ],
  },
];

// ── Header ────────────────────────────────────────────────────────────────────
function Header() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clear);
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { data: notifs } = useNotifications({ is_read: false, limit: 10 });
  const markAll = useMarkAllRead();

  const handleLogout = () => {
    clearAuth();
    window.location.href = "/";
  };

  return (
    <header className="h-14 bg-[#0C2340] flex items-center px-4 gap-3 flex-shrink-0">
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="text-white/60 hover:text-white transition-colors p-1 -ml-1"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      <span className="text-white text-base font-semibold flex-1">
        データ基盤ポータル
      </span>

      {/* Notification bell */}
      <div className="relative">
        <button
          onClick={() => setNotifOpen(!notifOpen)}
          className="relative text-white/70 hover:text-white transition-colors p-1.5"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          {(notifs?.unread_count ?? 0) > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center bg-red-500 text-white text-[10px] font-medium rounded-full px-0.5 border border-[#0C2340]">
              {notifs!.unread_count}
            </span>
          )}
        </button>

        {notifOpen && (
          <div className="absolute right-0 top-10 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-700">通知</span>
              <button
                onClick={() => markAll.mutate()}
                className="text-sm text-teal-600 hover:text-teal-700"
              >
                すべて既読
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
              {(notifs?.items ?? []).map((n) => (
                <div
                  key={n.notification_id}
                  className="flex gap-3 p-3.5 hover:bg-gray-50 cursor-pointer"
                >
                  <NotifIcon type={n.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {n.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {n.body}
                    </p>
                  </div>
                  {!n.is_read && (
                    <div className="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0 mt-1.5" />
                  )}
                </div>
              ))}
              {(notifs?.items ?? []).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">
                  未読の通知はありません
                </p>
              )}
            </div>
            <Link
              to="/notifications"
              onClick={() => setNotifOpen(false)}
              className="block text-center text-sm text-teal-600 hover:text-teal-700 py-2.5 border-t border-gray-100"
            >
              すべて見る
            </Link>
          </div>
        )}
      </div>

      {/* User menu */}
      <div className="relative">
        <button
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <span className="text-sm text-white/80 hidden sm:block">
            {user?.display_name ?? ""}
          </span>
          <div
            className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
            title={user?.display_name ?? ""}
          >
            {user?.display_name?.slice(0, 2).toUpperCase() ?? "US"}
          </div>
        </button>

        {userMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setUserMenuOpen(false)}
            />
            <div className="absolute right-0 top-10 w-48 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.display_name ?? ""}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user?.email ?? ""}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                ログアウト
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function NavItem({
  label,
  to,
  icon,
}: {
  label: string;
  to: string;
  icon: string;
}) {
  const state = useRouterState();
  const active = state.location.pathname.startsWith(to);

  return (
    <Link
      to={to}
      className={clsx(
        "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors border-l-2",
        active
          ? "text-teal-400 bg-teal-900/20 border-teal-500"
          : "text-white/60 hover:text-white/90 hover:bg-white/5 border-transparent",
      )}
    >
      <svg
        className="w-4 h-4 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      {label}
    </Link>
  );
}

function Sidebar() {
  return (
    <aside className="h-full w-56 bg-[#1A3A5C] flex flex-col py-3 gap-0.5 overflow-y-auto">
      {NAV.map((group) => (
        <div key={group.group}>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest px-4 pt-4 pb-2">
            {group.group}
          </p>
          {group.items.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </div>
      ))}
    </aside>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────
export function AppShell({ children }: { children: ReactNode }) {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const { setSidebarOpen } = useUIStore();

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile backdrop — closes sidebar on tap */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50 md:hidden"
            style={{ top: "56px" }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar — fixed overlay on mobile, in-flow on desktop */}
        <div
          className={clsx(
            "overflow-hidden transition-all duration-200 flex-shrink-0",
            "fixed top-14 bottom-0 left-0 z-30",
            "md:relative md:top-0 md:z-auto",
            sidebarOpen ? "w-56" : "w-0",
          )}
        >
          <Sidebar />
        </div>

        <main className="flex-1 overflow-y-auto bg-gray-50">{children}</main>
      </div>
    </div>
  );
}
