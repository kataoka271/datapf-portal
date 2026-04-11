# フロントエンド — Claude Code 指示書

## 技術スタック

| ライブラリ            | バージョン  | 用途                             |
| --------------------- | ----------- | -------------------------------- |
| React                 | 19          | UI フレームワーク                |
| TypeScript            | 5.5         | 型安全                           |
| Vite                  | 5           | ビルド・HMR                      |
| Tailwind CSS          | 3.4         | スタイリング                     |
| TanStack Router       | 1.45        | 型安全ルーティング               |
| TanStack Query        | 5.45        | サーバー状態管理・キャッシュ     |
| Zustand               | 4.5         | クライアント状態管理             |
| React Hook Form + Zod | 7.52 / 3.23 | フォームバリデーション           |
| deck.gl + kepler.gl   | 9.0         | 地図・走行軌跡可視化             |
| Recharts              | 2.12        | 時系列ラインチャート             |
| clsx                  | 2.1         | 条件付きクラス名                 |
| oidc-client-ts        | 3.0         | OIDC 認証（IAM Identity Center） |

---

## ディレクトリ構成

```
src/
├── api/
│   └── index.ts          # 全 API クライアント関数（31 エンドポイント）
├── components/
│   ├── common/
│   │   ├── AppShell.tsx   # Header + Sidebar + レイアウト
│   │   └── ui.tsx         # 共通 UI コンポーネント群
│   ├── catalog/
│   │   ├── CatalogMarketplace.tsx
│   │   ├── MouAgreementModal.tsx
│   │   ├── AccessRequestManagement.tsx
│   │   ├── CrossSearch.tsx
│   │   └── MouEditor.tsx
│   ├── apps/
│   │   └── AppMarketplace.tsx  # AppCard + AppRegistrationForm を含む
│   ├── analysis/
│   │   ├── VehicleAnalysis.tsx  # VehicleMap + VehicleStatusPanel + TimeseriesChart
│   │   └── StatisticsAnalysis.tsx
│   └── notifications/
│       └── NotificationList.tsx  # NotificationList + AlertList を含む
├── hooks/
│   ├── index.ts           # TanStack Query カスタムフック全量（27 種）
│   └── useDebounce.ts
├── stores/
│   └── index.ts           # Zustand ストア: useAuthStore / useUIStore / useAnalysisStore
├── types/
│   └── index.ts           # 全 TypeScript 型定義（25 型）
├── routeTree.ts            # TanStack Router ルート定義・全画面
├── main.tsx                # アプリエントリポイント
└── index.css               # Tailwind ベーススタイル
```

---

## コンポーネント設計ルール

### 1. データ取得は必ずカスタムフックを使う

```typescript
// ✅ 正しい
import { useCatalogs } from "@/hooks";
const { data, isLoading } = useCatalogs({ q: query });

// ❌ 禁止（コンポーネント内で直接 fetch）
const data = await fetch("/v1/catalogs");
```

### 2. 変更操作は useMutation + useUIStore でトースト通知

```typescript
const mutation = useSomeMutation();
const { addToast } = useUIStore();

mutation.mutate(payload, {
  onSuccess: () => addToast({ type: "success", message: "保存しました" }),
  onError: () => addToast({ type: "error", message: "失敗しました" }),
});
```

### 3. ローディング状態は必ず表示する

```typescript
import { Spinner, Skeleton } from '@/components/common/ui'

if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>
if (!data) return <EmptyState title="データがありません" />
```

### 4. 確認が必要な破壊的操作は ConfirmDialog を使う

```typescript
import { ConfirmDialog } from '@/components/common/ui'

{showConfirm && (
  <ConfirmDialog
    title="削除しますか？"
    message="この操作は取り消せません。"
    onConfirm={handleDelete}
    onCancel={() => setShowConfirm(false)}
    loading={mutation.isPending}
  />
)}
```

### 5. フォームは React Hook Form + Zod

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({ name: z.string().min(1, "必須") });
type FormValues = z.infer<typeof schema>;

const {
  register,
  handleSubmit,
  formState: { errors },
} = useForm<FormValues>({
  resolver: zodResolver(schema),
});
```

---

## 状態管理の使い分け

| 状態の種類                           | 使う手段           | 例                            |
| ------------------------------------ | ------------------ | ----------------------------- |
| サーバーから取得したデータ           | TanStack Query     | カタログ一覧、通知一覧        |
| 認証情報・トークン                   | `useAuthStore`     | `user`, `token`               |
| UI の一時状態                        | `useState`         | モーダル開閉、フィルタ値      |
| トースト・サイドバー開閉             | `useUIStore`       | `addToast()`, `sidebarOpen`   |
| 分析画面の選択状態（ページをまたぐ） | `useAnalysisStore` | `selectedVehicleId`, `region` |

---

## TanStack Query キー体系

```typescript
// 一覧
["catalogs", { q, subscribed }][("apps", { q, subscribed })][
  ("notifications", { is_read, limit })
][("alerts", { catalog_name, status })][
  // 単体
  ("catalogs", catalogName)
][("catalogs", catalogName, "mou")][("catalogs", catalogName, "members")][
  ("catalogs", catalogName, "access-requests", statusFilter)
][
  // 分析
  ("analysis", "vehicles", region, atTime)
][("analysis", "vehicle", vehicleId, "status", atTime)][
  ("analysis", "vehicle", vehicleId, "timeseries", columns, timeFrom, timeTo)
][("analysis", "vehicle", vehicleId, "video", atTime)];

// 変更後に invalidate するキー
qc.invalidateQueries({ queryKey: ["catalogs"] }); // カタログ関連を全無効化
qc.invalidateQueries({ queryKey: ["notifications"] });
```

---

## スタイリングルール

### Tailwind クラスの基本方針

```typescript
// ✅ clsx で条件付きスタイル
import { clsx } from 'clsx'
className={clsx(
  'base-class',
  condition && 'conditional-class',
  variant === 'primary' && 'bg-teal-600 text-white',
)}

// ✅ 共通 UI コンポーネントを使う
import { Button, Badge, Spinner } from '@/components/common/ui'
<Button variant="primary" loading={mutation.isPending}>保存</Button>

// ❌ インラインスタイルは使わない（Tailwind で表現できる場合）
style={{ backgroundColor: '#0F6E56' }}
```

### カラーパレット（テーマカラー）

| 用途                     | Tailwind クラス                              | HEX       |
| ------------------------ | -------------------------------------------- | --------- |
| プライマリ（アクション） | `bg-teal-600` / `text-teal-600`              | `#0F6E56` |
| 成功                     | `bg-green-100 text-green-800`                | —         |
| 警告                     | `bg-amber-100 text-amber-800`                | —         |
| エラー                   | `bg-red-100 text-red-800`                    | —         |
| ナビゲーション背景       | `bg-[#0C2340]` / `bg-[#1A3A5C]`              | 直接指定  |
| カード背景               | `bg-white border border-gray-100 rounded-xl` | —         |

### レスポンシブグリッド

```typescript
// カードグリッドの標準パターン
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
```

---

## API クライアントの使い方

`src/api/index.ts` からドメインごとのオブジェクトをインポートする。
**直接呼び出しは mutation や特殊ケース（リダイレクトトークン取得など）のみ。**
通常のデータ取得は `src/hooks/index.ts` のカスタムフック経由を使う。

```typescript
import { catalogsApi, appsApi, analysisApi } from "@/api";

// mutation 内での直接呼び出し例
const handleRedirect = async () => {
  const { redirect_url } = await appsApi.redirectToken(app.app_id);
  window.location.href = redirect_url;
};
```

---

## 新しいページを追加する手順

1. `src/components/{domain}/NewPage.tsx` を作成
2. `src/routeTree.ts` にルートを追加
3. `src/components/common/AppShell.tsx` の `NAV` 配列にメニュー項目を追加
4. 必要なら `src/hooks/index.ts` に新しいカスタムフックを追加
5. 必要なら `src/types/index.ts` に型定義を追加

---

## 既知の TODO・未実装箇所

| 箇所                                     | 内容                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `VehicleAnalysis.tsx` の `VehicleMap`    | `<svg>` プレースホルダー → 実際の `DeckGL` コンポーネントに置き換える              |
| `main.tsx` のログイン処理                | `setToken('dev-mock-token')` → `oidc-client-ts` の `signinRedirect()` に置き換える |
| `routeTree.ts` の `catalogRequestsRoute` | `catalogName` をハードコードしている → URL パラメータから取得する                  |
| 統計分析の BoxPlot                       | `recharts` に BoxPlot がないため Plotly.js への切替を検討                          |
| `AppShell` のモバイル対応                | `width: 0` でサイドバーを隠しているが Drawer コンポーネントへの置換推奨            |

---

## テスト方針

```bash
npm run typecheck   # 型エラーを先に確認
npm run build       # ビルドが通ることを確認
```

Vitest + Testing Library でのテスト例：

```typescript
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
)

test('カタログカードが表示される', () => {
  render(<CatalogCard catalog={mockCatalog} onApply={vi.fn()} onRevoke={vi.fn()} />, { wrapper })
  expect(screen.getByText('vehicle_timeseries')).toBeInTheDocument()
})
```
