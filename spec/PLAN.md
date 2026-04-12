# 動画シーンサーチ 実装プラン

仕様書: `spec/portal_scene_search.md`

---

## 実装フェーズ概要

```
Phase 0  前提リファクタリング（ColumnSearchPanel 抽出）
Phase 1  バックエンド基盤（config / models / mock / services）
Phase 2  バックエンド エンドポイント（routers / tests）
Phase 3  フロントエンド 型・API・フック
Phase 4  フロントエンド UI（SceneCard / SceneSearch）
Phase 5  ルーティング・ナビゲーション
```

フェーズ内のタスクは独立しているため並行作業可能。
フェーズ間には依存がある（Phase N が完了してから Phase N+1 を開始）。

---

## Phase 0 — 前提リファクタリング

**目的**: `ColumnSearchPanel` を `SceneSearch.tsx` から再利用できるようにする。

### タスク 0-1: `ColumnSearchPanel` を独立ファイルに抽出

**対象ファイル**
- `portal/frontend/src/components/analysis/CrossAnalysis.tsx`（変更）
- `portal/frontend/src/components/analysis/ColumnSearchPanel.tsx`（新規作成）

**手順**
1. `CrossAnalysis.tsx` の `function ColumnSearchPanel(...)` とその型定義（`line 79〜`）を切り出す
2. `ColumnSearchPanel.tsx` として export する
3. `CrossAnalysis.tsx` で `import { ColumnSearchPanel } from "./ColumnSearchPanel"` に置き換える
4. `npm run typecheck` でエラーがないことを確認

**注意**
- `ColumnSearchPanel` は `useCrossSearch` / `useCatalogs` に依存しているため、それらの import も移動する
- props 型（`registeredColumns`, `onRegister` など）も同ファイルに定義する

---

## Phase 1 — バックエンド基盤

### タスク 1-1: `pyproject.toml` の依存パッケージ更新

**対象ファイル**: `portal/backend/pyproject.toml`

追加・変更するパッケージ:
```toml
"boto3>=1.35.0",               # S3 Vectors 対応（1.34 → 1.35 以上）
"qdrant-client>=1.9.0",        # Qdrant バックエンド
"psycopg2-binary>=2.9.0",      # pgvector バックエンド
"pgvector>=0.3.0",             # psycopg2 用 vector 型アダプタ
"databricks-vectorsearch>=0.2.0",  # Databricks Vector Search SDK
```

`boto3` のバージョン上限に既存コードが依存していないことを確認してから変更する。

### タスク 1-2: `config.py` に新規環境変数を追加

**対象ファイル**: `portal/backend/app/config.py`

```python
# Vector Search
vector_search_backend: str = "s3vectors"
s3_vectors_bucket: str = "portal-scene-vectors"
s3_vectors_index: str = "video-frames"
qdrant_url: str = "http://localhost:6333"
qdrant_api_key: str = ""
qdrant_collection: str = "video-frames"
pgvector_connection_string: str = ""
databricks_vector_search_endpoint: str = ""
databricks_vector_search_index: str = ""

# Embedding
embedding_lambda_name: str = "portal-embedding"
frame_embed_mode: str = "image_clip"
embed_model_name: str = "openai/clip-vit-base-patch32"
frame_embed_dim: int = 512

# Video clip
clip_mode: str = "browser_seek"
```

### タスク 1-3: `models.py` に新規モデルを追加・変更

**対象ファイル**: `portal/backend/app/models.py`

追加:
```python
class SceneSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    limit: int = Field(default=50, ge=1, le=200)
    score_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    time_from: Optional[str] = None
    time_to: Optional[str] = None
    vehicle_ids: Optional[list[str]] = None
```

変更（`StatisticsRequest`）:
```python
# region: str  →  region: Optional[str] = None
region: Optional[str] = None   # None = 全リージョン（シーンサーチから呼ぶ場合）
```

### タスク 1-4: `mock_data.py` にモック関数を追加

**対象ファイル**: `portal/backend/app/services/mock_data.py`

追加する関数:
- `mock_scene_search(query, catalog_names, limit)` — 2〜3件の固定フレームデータを返す
- `mock_scene_clip(scene_id, window_sec)` — 固定の clip 情報を返す（静止画 URL、seek_to_sec=0）

仕様書 Section 11 のコード例をそのまま使用する。

### タスク 1-5: `services/embedding.py` を新規作成

**対象ファイル**: `portal/backend/app/services/embedding.py`（新規）

```python
import boto3, json
from app.config import get_settings

def embed_query(query_text: str) -> list[float]:
    settings = get_settings()
    if settings.dev_mode:
        return [0.0] * settings.frame_embed_dim  # dev モック
    # boto3 Lambda invoke（省略 → 仕様書 Section 11 参照）
    ...
```

### タスク 1-6: `services/vector_search.py` を新規作成

**対象ファイル**: `portal/backend/app/services/vector_search.py`（新規）

実装内容（仕様書 Section 11 参照）:
- `VectorSearchBackend` — ABC（`search` + `get_frame_by_id`）
- `S3VectorsBackend` — boto3 s3vectors クライアント（7.2 のコード例使用）
- `QdrantBackend` — qdrant-client（7.3 のコード例使用）
- `PgVectorBackend` — psycopg2（7.4 のコード例使用）
- `DatabricksVectorBackend` — databricks-vectorsearch SDK（7.5 のコード例使用）
- `get_vector_backend()` — ファクトリ関数

**注意**: dev モードでは `search()` がモックデータをそのまま返すのではなく `embed_query()` のゼロベクトルに対して空リストを返せばよい（mock_data.py 側でカバーするため `get_vector_backend()` はdev モードでは呼ばれない）。

---

## Phase 2 — バックエンド エンドポイント

### タスク 2-1: `routers.py` にエンドポイントを追加

**対象ファイル**: `portal/backend/app/routers.py`

追加内容:
1. `_offset_to_iso()` ヘルパー関数（仕様書 Section 11 のコード参照）
2. `get_statistics` の SQL に region Optional 対応（WHERE 句の条件分岐）
3. `@router_analysis.post("/scene-search")` — `scene_search` 関数
4. `@router_analysis.get("/scene-search/{scene_id}/clip")` — `get_scene_clip` 関数

**実装パターン**（既存エンドポイントに準拠）:
```python
@router_analysis.post("/scene-search")
def scene_search(body: SceneSearchRequest, user: CurrentUser = Depends(get_current_user)):
    settings = get_settings()
    scenes = mock.mock_scene_search(body.query, [], body.limit)
    if not settings.dev_mode:
        ...  # 仕様書 Section 11 参照
    return {"total": len(scenes), "scenes": scenes}
```

### タスク 2-2: `tests/test_api.py` にテストを追加

**対象ファイル**: `portal/backend/tests/test_api.py`

追加するテストケース:
```python
def test_scene_search():
    res = client.post("/v1/analysis/scene-search", json={"query": "急ブレーキ"})
    assert res.status_code == 200
    data = res.json()
    assert "scenes" in data
    assert len(data["scenes"]) > 0
    scene = data["scenes"][0]
    assert "scene_id" in scene
    assert "similarity_score" in scene
    assert "thumbnail_url" in scene

def test_scene_clip():
    scene_id = "f3a2b1c0-0000-0000-0000-000000000001"
    res = client.get(f"/v1/analysis/scene-search/{scene_id}/clip")
    assert res.status_code == 200
    data = res.json()
    assert "clip_url" in data
    assert "seek_to_sec" in data

def test_statistics_without_region():
    # region=None でも統計が取れること（scene search から呼ぶ場合）
    res = client.post("/v1/analysis/statistics", json={
        "time_from": "2026-04-01T00:00:00Z",
        "time_to": "2026-04-12T23:59:59Z",
        "columns": ["vehicle_timeseries.drive.metrics.vehicle_speed"],
    })
    assert res.status_code == 200
```

**検証コマンド**:
```bash
cd portal/backend
uv run pytest tests/ -v
```

---

## Phase 3 — フロントエンド 型・API・フック

### タスク 3-1: `types/index.ts` に型を追加

**対象ファイル**: `portal/frontend/src/types/index.ts`

```typescript
// ── Scene Search ──────────────────────────────────────────────────────────────
export interface SceneSearchRequest {
  query: string;
  limit?: number;
  score_threshold?: number;
  time_from?: string;
  time_to?: string;
  vehicle_ids?: string[];
}

export interface SceneResult {
  scene_id: string;
  vehicle_id: string;
  recorded_at: string;
  similarity_score: number;
  latitude: number;
  longitude: number;
  thumbnail_url: string;
}

export interface SceneSearchResponse {
  total: number;
  query_embedding_ms?: number;
  search_ms?: number;
  scenes: SceneResult[];
}

export interface SceneClip {
  scene_id: string;
  clip_url: string;
  clip_start_at: string;
  clip_end_at: string;
  seek_to_sec: number;
}
```

また `StatisticsRequest` に対応する型（`api/index.ts` 内のインラインで十分）の `region` を `region?: Region` に変更する。

### タスク 3-2: `api/index.ts` に API 関数を追加

**対象ファイル**: `portal/frontend/src/api/index.ts`

`analysisApi` オブジェクトに追記:
```typescript
sceneSearch: (body: SceneSearchRequest) =>
  post<SceneSearchResponse>("/analysis/scene-search", body),

getSceneClip: (sceneId: string, windowSec?: number) => {
  const q = windowSec ? `?window_sec=${windowSec}` : "";
  return get<SceneClip>(`/analysis/scene-search/${sceneId}/clip${q}`);
},
```

`statistics` 関数の `region` を `region?: Region` に変更（オプション化）。

### タスク 3-3: `hooks/index.ts` にカスタムフックを追加

**対象ファイル**: `portal/frontend/src/hooks/index.ts`

```typescript
export function useSceneSearch(
  body: SceneSearchRequest | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["analysis", "scene-search", body?.query, {
      scoreThreshold: body?.score_threshold,
      timeFrom: body?.time_from,
      timeTo: body?.time_to,
      vehicleIds: body?.vehicle_ids,
    }],
    queryFn: () => analysisApi.sceneSearch(body!),
    enabled: !!body && (options?.enabled ?? true),
    staleTime: 5 * 60_000,
  });
}

export function useSceneClip(
  sceneId: string | null,
  options?: { enabled?: boolean; windowSec?: number }
) {
  return useQuery({
    queryKey: ["analysis", "scene-clip", sceneId, { windowSec: options?.windowSec }],
    queryFn: () => analysisApi.getSceneClip(sceneId!, options?.windowSec),
    enabled: !!sceneId && (options?.enabled ?? true),
    staleTime: 5 * 60_000,   // presigned URL の有効期限（1h）より十分短く設定
  });
}
```

**検証コマンド**:
```bash
cd portal/frontend
npm run typecheck
```

---

## Phase 4 — フロントエンド UI

### タスク 4-1: `SceneCard.tsx` を作成

**対象ファイル**: `portal/frontend/src/components/analysis/SceneCard.tsx`（新規）

責務:
- サムネイル画像の表示
- 類似度スコアのバッジ（緑 / 黄 / 赤）
- ホバーで `useSceneClip({ enabled: isHovering })` を呼び出し
- clip URL 取得後に `<video autoPlay muted loop>` をオーバーレイ表示
- `browser_seek` 時は `video.currentTime = data.seek_to_sec` にセット
- クリックで `onSelect(scene)` コールバック呼び出し
- 選択状態の teal ボーダー表示

```tsx
export function SceneCard({
  scene,
  isSelected,
  onSelect,
}: {
  scene: SceneResult;
  isSelected: boolean;
  onSelect: (scene: SceneResult) => void;
}) {
  const [isHovering, setIsHovering] = useState(false);
  const { data: clip, isPending } = useSceneClip(scene.scene_id, { enabled: isHovering });
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (clip && videoRef.current) {
      videoRef.current.currentTime = clip.seek_to_sec;
    }
  }, [clip]);

  // ... JSX
}
```

### タスク 4-2: `SceneSearch.tsx` を作成

**対象ファイル**: `portal/frontend/src/components/analysis/SceneSearch.tsx`（新規）

大きく4つのセクションで構成:

**① 左パネル（カラム検索）**
```tsx
<ColumnSearchPanel
  registeredColumns={registeredColumns}
  onRegister={...}
  onUnregister={...}
  onClearAll={...}
  onAnalyze={() => setShowAnalysis(true)}
  onRequestAccess={...}
/>
```

**② シーン検索バー**
- テキストボックス + [検索] ボタン
- Enter キー対応

**③ 地図 + シーン一覧（2カラム）**
- 左: `maplibregl` の `Map` に `ScatterplotLayer` 相当をプロット（`deck.gl` の `ScatterplotLayer` を `MapLibreGL` コンポーネント経由で重ねる、または CrossAnalysis と同様のマーカー追加方式）
- 右: `SceneCard` のグリッド + 類似度スライダー

**④ 車両分析 / 統計分析パネル**（`selectedScene` が設定後 + `showAnalysis=true`）
- `CrossAnalysis.tsx` の車両分析・統計パネル実装を参考に実装
- 統計は `region: undefined` で呼び出す

**状態**:
```typescript
const [query, setQuery] = useState("");
const [submittedQuery, setSubmittedQuery] = useState<SceneSearchRequest | null>(null);
const [selectedScene, setSelectedScene] = useState<SceneResult | null>(null);
const [vehicleFilter, setVehicleFilter] = useState<string | null>(null);
const [registeredColumns, setRegisteredColumns] = useState<MatchedColumn[]>([]);
const [showAnalysis, setShowAnalysis] = useState(false);
const [scoreThreshold, setScoreThreshold] = useState(0.5);
```

---

## Phase 5 — ルーティング・ナビゲーション

### タスク 5-1: `routeTree.tsx` にルートを追加

**対象ファイル**: `portal/frontend/src/routeTree.tsx`

```typescript
import { SceneSearch } from "./components/analysis/SceneSearch";

const sceneSearchRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/analysis/scene-search",
  component: SceneSearch,
});

// routeTree に追加
const routeTree = rootRoute.addChildren([
  ...既存ルート,
  sceneSearchRoute,
]);
```

### タスク 5-2: `AppShell.tsx` の NAV に項目追加

**対象ファイル**: `portal/frontend/src/components/common/AppShell.tsx`

「データ分析」グループに追加:
```typescript
{
  label: "シーンサーチ",
  to: "/analysis/scene-search",
  icon: "M15 10l4.553-2.069A1 1 0 0121 8.882V15.12a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z",
},
```

**最終検証**:
```bash
cd portal/frontend
npm run typecheck
npm run build
```

---

## 実装順序サマリー

```
[Phase 0]
  0-1 ColumnSearchPanel 抽出 → typecheck 確認

[Phase 1]（並行可能）
  1-1 pyproject.toml 更新
  1-2 config.py 追加
  1-3 models.py 追加・変更
  1-4 mock_data.py 追加
  1-5 embedding.py 新規
  1-6 vector_search.py 新規

[Phase 2]（Phase 1 完了後）
  2-1 routers.py 追加
  2-2 tests 追加 → pytest 確認

[Phase 3]（Phase 0 完了後、Phase 1 と並行可能）
  3-1 types/index.ts 追加
  3-2 api/index.ts 追加
  3-3 hooks/index.ts 追加

[Phase 4]（Phase 3 完了後）
  4-1 SceneCard.tsx 作成
  4-2 SceneSearch.tsx 作成

[Phase 5]（Phase 4 完了後）
  5-1 routeTree.tsx 追加
  5-2 AppShell.tsx 追加
  → typecheck + build 確認
```

---

## スコープ外（このプランに含まない）

| 項目 | 理由 |
|---|---|
| EC2 パイプライン（`portal/pipeline/`）の実装 | インフラ構築を伴う独立作業 |
| Embedding Lambda（`portal/embedding_lambda/`）の実装 | ML モデル選定・チューニングが別途必要 |
| Terraform モジュール（`infra/`）の作成 | インフラ変更のため別 PR で管理 |
| S3 Vectors / Qdrant / pgvector の本番接続テスト | DEV_MODE=false 環境が必要 |
