import {
  createRootRoute, createRoute, Outlet, Navigate,
} from '@tanstack/react-router'
import { AppShell } from './components/common/AppShell'
import { CatalogMarketplace } from './components/catalog/CatalogMarketplace'
import { CrossSearch } from './components/catalog/CrossSearch'
import { AccessRequestManagement } from './components/catalog/AccessRequestManagement'
import { MouEditor } from './components/catalog/MouEditor'
import { AppMarketplace, AppRegistrationForm } from './components/apps/AppMarketplace'
import { VehicleAnalysis } from './components/analysis/VehicleAnalysis'
import { StatisticsAnalysis } from './components/analysis/StatisticsAnalysis'
import { NotificationList, AlertList } from './components/notifications/NotificationList'
import { useAuthStore } from './stores'

// ── Root ──────────────────────────────────────────────────────────────────────
function RootComponent() {
  const token = useAuthStore((s) => s.token)
  if (!token) return <LoginPage />
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

const rootRoute = createRootRoute({ component: RootComponent })

// ── Login ─────────────────────────────────────────────────────────────────────
function LoginPage() {
  const setToken = useAuthStore((s) => s.setToken)
  // In production: replace with oidc-client-ts signinRedirect()
  const handleLogin = () => {
    setToken('dev-mock-token')
    window.location.href = '/catalogs/marketplace'
  }
  return (
    <div className="min-h-screen bg-[#0C2340] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-sm text-center space-y-6">
        <div className="w-14 h-14 bg-teal-600 rounded-xl flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-medium text-gray-900">データ基盤ポータル</h1>
          <p className="text-sm text-gray-500 mt-1">Databricks × AWS</p>
        </div>
        <button
          onClick={handleLogin}
          className="w-full h-10 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          シングルサインオンでログイン
        </button>
        <p className="text-xs text-gray-400">AWS IAM Identity Center</p>
      </div>
    </div>
  )
}

// ── Index redirect ────────────────────────────────────────────────────────────
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <Navigate to="/catalogs/marketplace" />,
})

// ── Catalog routes ────────────────────────────────────────────────────────────
const catalogMarketplaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/catalogs/marketplace',
  component: CatalogMarketplace,
})

const crossSearchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/catalogs/search',
  component: CrossSearch,
})

const catalogRequestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/catalogs/requests',
  component: () => <AccessRequestManagement catalogName="vehicle_timeseries" />,
})

const mouEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/catalogs/$catalogName/mou',
  component: () => {
    const { catalogName } = mouEditorRoute.useParams()
    return <MouEditor catalogName={catalogName} />
  },
})

// ── App routes ────────────────────────────────────────────────────────────────
const appsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/apps',
  component: AppMarketplace,
})

const appsRegisterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/apps/register',
  component: () => <AppRegistrationForm onSuccess={() => window.history.back()} />,
})

// ── Analysis routes ───────────────────────────────────────────────────────────
const vehiclesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/analysis/vehicles',
  component: VehicleAnalysis,
})

const statisticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/analysis/statistics',
  component: StatisticsAnalysis,
})

// ── Notification & alert routes ───────────────────────────────────────────────
const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notifications',
  component: NotificationList,
})

const alertsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/alerts',
  component: AlertList,
})

// ── Route tree ────────────────────────────────────────────────────────────────
export const routeTree = rootRoute.addChildren([
  indexRoute,
  catalogMarketplaceRoute,
  crossSearchRoute,
  catalogRequestsRoute,
  mouEditorRoute,
  appsRoute,
  appsRegisterRoute,
  vehiclesRoute,
  statisticsRoute,
  notificationsRoute,
  alertsRoute,
])
