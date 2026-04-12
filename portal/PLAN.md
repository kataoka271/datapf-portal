# 横断分析ページ 仕様書

## 1. 概要・目的

横断検索で選択したカラムを使い、**車両分析**と**統計分析**を一体的に行えるページ。

現状の課題：
- 車両分析・統計分析ページはそれぞれ独立しており、カラム選択のフローが分断されている
- 統計分析には独自の横断検索UIが組み込まれているが、車両分析と連携しない

本ページの目的：
- 「どのカラムを使うか（横断検索 → カラム登録）」と「どう分析するか（車両/統計）」を一画面に統合
- マップで選択した車両を統計分析の車両フィルタとして自動連携させる

---

## 2. ページ仕様

| 項目 | 値 |
|---|---|
| URL | `/analysis/cross` |
| ページタイトル | 横断分析 |
| ナビゲーション | データ分析 > 横断分析 |
| 必要権限 | ログイン済みユーザー全員 |

---

## 3. UIレイアウト

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Header                                                                        │
├────────────────────────┬─────────────────────────────────────────────────────┤
│ Sidebar (nav)          │                                                      │
├────────────────────────┤                                                      │
│                        │  横断分析               ← PageHeader                │
│  カラム検索 (左, w-72) │                                                      │
│                        │  ─── 車両分析 ─────────────────────────────────── │
│  [クエリ入力  ] [検索] │  リージョン / 時刻フィルタ                          │
│                        │  ┌──── VehicleMap (3/5) ────────┐ ┌── Status ──┐   │
│  [すべて選択] [N件を登録]  │   OpenStreetMap + 車両点      │ │ 車両ID     │   │
│  ☐ vehicle_speed       │  │   クリックで選択 (赤くなる)   │ │ 各メトリクス│   │
│    ████████░░ 94%      │  └─────────────────────────────┘ └────────────┘   │
│  ☐ accel_x             │  TimeseriesChart (登録カラムでプロット)              │
│    ██████░░░░ 81%      │                                                      │
│                        │  ─── 統計分析 ─────────────────────────────────── │
│  ── 登録済みカラム(2) ──  時間範囲フィルタ  [選択中: VH-0042 ×]  [分析実行] │
│  vehicle_speed    [×]  │  StatCard × N (ヒストグラム / 統計値タブ)           │
│  accel_x          [×]  │                                                      │
│  [すべて解除]          │                                                      │
│                        │                                                      │
│  [2件で分析]           │                                                      │
└────────────────────────┴─────────────────────────────────────────────────────┘
```

---

## 4. カラム登録フロー

```
1. 検索クエリ入力 → [検索] ボタン (または Enter)
      ↓ POST /catalogs/search
2. 検索結果一覧表示
   ├─ 各カラムにチェックボックス
   ├─ [すべて選択 / すべて解除] ボタン (検索結果を一括チェック)
   └─ [N件を登録] ボタン → 登録済みカラム一覧に追加・checkedCols クリア

3. 登録済みカラム一覧
   ├─ 各カラムに [×] ボタン → 個別登録解除
   └─ [すべて解除] ボタン → 一括クリア

4. [N件で分析] ボタン → 車両分析 + 統計分析パネルを表示
```

**状態の分離:**

| 状態 | 保持場所 | 役割 |
|---|---|---|
| `checkedCols` | `ColumnSearchPanel` ローカル | 現在の検索結果でチェック中（一時的） |
| `registeredColumns` | `CrossAnalysis` | 分析に使う登録済みカラム（永続） |

- 新規検索を実行すると `checkedCols` はリセット（登録済みカラムは維持）
- 「登録」でチェック済みカラムを重複なく登録リストに追加し、チェックをクリア

---

## 5. データフロー

```
登録済みカラム (registeredColumns: MatchedColumn[])
    │
    ├─ [車両分析パネル]
    │   region, atTime → POST /analysis/vehicles → VehicleMap
    │   マップクリック → selectedVehicleId (useAnalysisStore)
    │   selectedVehicleId → GET /analysis/vehicles/{id}/status
    │   selectedVehicleId + registeredColumns.column_full_name
    │       → POST /analysis/vehicles/{id}/timeseries
    │
    └─ [統計分析パネル]
        registeredColumns + region + time_from + time_to + selectedVehicleId
            → POST /analysis/statistics → StatCard × N
```

**連携ポイント**: `selectedVehicleId` (Zustand `useAnalysisStore`) が車両分析・統計分析の両パネルで共有される。マップで車両を選択すると、統計パネルの「選択中: VH-xxxx」バッジが自動更新される。バッジの [×] を押すと全車両対象に戻る。

---

## 6. API連携

| エンドポイント | 使用パネル | 変更 |
|---|---|---|
| `POST /catalogs/search` | カラム検索 | 変更なし |
| `POST /analysis/vehicles` | 車両分析 | 変更なし |
| `GET /analysis/vehicles/{id}/status` | 車両分析 | 変更なし |
| `POST /analysis/vehicles/{id}/timeseries` | 車両分析 | 変更なし |
| `POST /analysis/statistics` | 統計分析 | **`vehicle_id` フィールド追加** |

### `POST /analysis/statistics` の変更点

```json
{
  "region": "japan",
  "time_from": "2026-04-05T00:00:00Z",
  "time_to": "2026-04-12T00:00:00Z",
  "columns": ["vehicle_timeseries.drive.metrics.vehicle_speed"],
  "vehicle_id": "VH-0042"
}
```

`vehicle_id` が指定された場合、Databricks SQL の WHERE 句に `vehicle_id = ?` を追加する（モックでは無視、`null` / 未指定 = 全車両）。

---

## 7. エラー・ローディング状態

| 状態 | 表示 |
|---|---|
| 横断検索中 | Spinner |
| 検索結果なし（未検索） | グレーテキスト「検索キーワードを入力してください」 |
| カラム未登録でページ表示 | EmptyState「横断検索でカラムを登録してください」 |
| 車両未選択 | Status パネルに EmptyState「地図上の車両をクリック…」 |
| 統計未実行 | EmptyState「分析実行ボタンを押してください」 |
| 統計実行中 | Spinner |
| 統計エラー | `useUIStore.addToast({ type: "error" })` |

---

## 8. 変更ファイル一覧

| ファイル | 変更種別 |
|---|---|
| `frontend/src/components/analysis/CrossAnalysis.tsx` | 新規作成 |
| `frontend/src/routeTree.tsx` | ルート追加 (`/analysis/cross`) |
| `frontend/src/components/common/AppShell.tsx` | NAV 項目追加 |
| `frontend/src/api/index.ts` | `statistics` 引数に `vehicle_id?` 追加 |
| `backend/app/models.py` | `StatisticsRequest` に `vehicle_id` フィールド追加 |
| `backend/app/services/mock_data.py` | `mock_statistics` に `vehicle_id` 引数追加 |
| `backend/app/routers.py` | `vehicle_id` を `mock_statistics` に渡す |
