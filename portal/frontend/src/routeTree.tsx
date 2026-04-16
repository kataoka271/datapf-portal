import { useEffect } from "react";
import {
  createRootRoute,
  createRoute,
  Outlet,
  Navigate,
} from "@tanstack/react-router";
import { AppShell } from "./components/common/AppShell";
import { CatalogMarketplace } from "./components/catalog/CatalogMarketplace";
import { CatalogDetailPage } from "./components/catalog/CatalogDetailPage";
import { CrossSearch } from "./components/catalog/CrossSearch";
import { AccessRequestManagement } from "./components/catalog/AccessRequestManagement";
import { MouEditor } from "./components/catalog/MouEditor";
import { AppMarketplace } from "./components/apps/AppMarketplace";
import { VehicleAnalysis } from "./components/analysis/VehicleAnalysis";
import { StatisticsAnalysis } from "./components/analysis/StatisticsAnalysis";
import { CrossAnalysis } from "./components/analysis/CrossAnalysis";
import { SceneSearch } from "./components/analysis/SceneSearch";
import { GenieChatbot } from "./components/analysis/GenieChatbot";
import {
  NotificationList,
  AlertList,
} from "./components/notifications/NotificationList";
import { useAuthStore } from "./stores";
import { useCurrentUser } from "./hooks";

// ── Root ──────────────────────────────────────────────────────────────────────
function AuthenticatedRoot() {
  const setUser = useAuthStore((s) => s.setUser);
  const { data: user } = useCurrentUser();

  useEffect(() => {
    if (user) setUser(user);
  }, [user, setUser]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

// Auth is handled by the Databricks Apps proxy — render the app directly.
function RootComponent() {
  return <AuthenticatedRoot />;
}

const rootRoute = createRootRoute({ component: RootComponent });

// ── Index redirect ────────────────────────────────────────────────────────────
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <Navigate to="/catalogs/marketplace" />,
});

// ── Catalog routes ────────────────────────────────────────────────────────────
const catalogMarketplaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/catalogs/marketplace",
  component: CatalogMarketplace,
});

const crossSearchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/catalogs/search",
  component: CrossSearch,
});

const catalogDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/catalogs/$catalogName",
  component: () => {
    const { catalogName } = catalogDetailRoute.useParams();
    return <CatalogDetailPage catalogName={catalogName} />;
  },
});

const catalogRequestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/catalogs/$catalogName/requests",
  component: () => {
    const { catalogName } = catalogRequestsRoute.useParams();
    return <AccessRequestManagement catalogName={catalogName} />;
  },
});

const mouEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/catalogs/$catalogName/mou",
  component: () => {
    const { catalogName } = mouEditorRoute.useParams();
    return <MouEditor catalogName={catalogName} />;
  },
});

// ── App routes ────────────────────────────────────────────────────────────────
const appsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/apps",
  component: AppMarketplace,
});

// ── Analysis routes ───────────────────────────────────────────────────────────
const crossAnalysisRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/analysis/cross",
  component: CrossAnalysis,
});

const vehiclesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/analysis/vehicles",
  component: VehicleAnalysis,
});

const statisticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/analysis/statistics",
  component: StatisticsAnalysis,
});

const sceneSearchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/analysis/scene-search",
  component: SceneSearch,
});

const genieRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/analysis/genie",
  component: GenieChatbot,
});

// ── Notification & alert routes ───────────────────────────────────────────────
const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notifications",
  component: NotificationList,
});

const alertsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/alerts",
  component: AlertList,
});

// ── Route tree ────────────────────────────────────────────────────────────────
export const routeTree = rootRoute.addChildren([
  indexRoute,
  catalogMarketplaceRoute,
  crossSearchRoute,
  catalogDetailRoute,
  catalogRequestsRoute,
  mouEditorRoute,
  appsRoute,
  crossAnalysisRoute,
  vehiclesRoute,
  statisticsRoute,
  sceneSearchRoute,
  genieRoute,
  notificationsRoute,
  alertsRoute,
]);
