# 動画シーンサーチ機能 仕様

## 1. 概要・目的

自然言語でシーンを記述し、動画フレームの埋め込みベクトルを活用してマッチするシーンを一覧表示する機能。
シーン検索で特定した車両を起点に、**車両分析**と**統計分析**を一体的に実行できる。

埋め込みモデルは Hugging Face Hub の任意のモデルを使用でき、EC2 Auto Scaling Group による埋め込みパイプラインで動画フレームのベクトルを事前生成する。
ベクターサーチバックエンドは S3 Vectors / Qdrant / pgvector / Databricks Vector Search の4種を `VECTOR_SEARCH_BACKEND` 環境変数で切り替え可能。

埋め込み推論はポータル Lambda から独立した **Embedding Lambda**（プロビジョニング済みコンカレンシー）に切り出す。これにより CLIP / sentence-transformers のモデルロードによるコールドスタート問題をポータル本体から分離する。

**背景と課題:**
- 車載動画は時系列ログと紐付けて管理されているが、特定シーン（例: 急ブレーキ、交差点進入）を視覚的に探すには動画を逐一再生する必要がある
- シーンを発見しても、その前後の時系列データや同一シーンの統計分布を確認するには別ページへの遷移が必要だった

**ユーザーの流れ:**
1. 探したいシーンを自然言語で入力（例: 「高速道路での急ハンドル」）
2. 類似度スコア順にフレームサムネイル一覧を表示
3. サムネイルにホバーするとその前後の動画クリップが自動再生
4. 地図上でマッチした車両の位置を確認
5. シーンカードをクリックして車両を選択 → 車両分析パネルが展開
6. 検索結果の時間帯・選択車両で統計分析を自動実行

---

## 2. ページ仕様

| 項目 | 値 |
|---|---|
| URL | `/analysis/scene-search` |
| ページタイトル | 動画シーンサーチ |
| ナビゲーション | データ分析 > シーンサーチ |
| 必要権限 | データ閲覧者以上（`viewer` / `editor` / `owner`） |

---

## 3. UIレイアウト

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Header                                                                       │
├──────────────────────┬──────────────────────────────────────────────────────┤
│ Sidebar(nav)         │  動画シーンサーチ                    ← PageHeader    │
├──────────────────────┤                                                      │
│                      │  ─── シーン検索 ─────────────────────────────────── │
│  カラム検索  (w-72)  │                                                      │
│                      │  [ シーンを説明してください...          ] [検索]     │
│  [クエリ入力 ][検索] │  例: 急ブレーキ / 交差点での一時停止 / 高速道路合流  │
│  [未申請を含む]      │                                                      │
│                      │  ┌─ 地図 (左 2/5) ──────────┐ ┌─ シーン一覧 (右 3/5)┐│
│  [すべて選択][N件登録]│  │  OpenStreetMap + deck.gl  │ │ 42件 類似度▼       ││
│  ☐ vehicle_speed     │  │                           │ │ 類似度下限:[●] 50% ││
│    ████████░░ 94%    │  │  ● VH-0001  [18件]        │ │                    ││
│  ─ wheel_speed_fl    │  │  ● VH-0042  [24件]        │ │ ┌──┐ ┌──┐ ┌──┐    ││
│    ████░░░░░░ 65%    │  │                           │ │ │  │ │  │ │  │    ││
│    審査中            │  │  クリック → 車両フィルタ   │ │ │93%│ │88%│ │84%│   ││
│                      │  │  再クリック → 解除         │ │ │VH-1│ │VH-2│ │VH-1│││
│  ── 登録済み(1) ──   │  └───────────────────────────┘ │ │10:23│ │9:15│ │11:02│││
│  vehicle_speed  [×]  │                               │ └──┘ └──┘ └──┘    ││
│  [すべて解除]        │                               │ ↑ ホバー → 動画再生 ││
│                      │                               │ クリック → 車両選択  ││
│  [1件で分析]         │                               └────────────────────┘│
│                      │                                                      │
│                      │  ─── 車両分析（VH-0001 | 2026-04-09 10:23:45）────── │
│                      │  ← シーンカードクリックで展開                        │
│                      │  ┌── VehicleStatusPanel ─────┐  TimeseriesChart     │
│                      │  │  speed: 45 km/h            │  (登録カラムでプロット)│
│                      │  │  battery: 78 %             │                      │
│                      │  └────────────────────────────┘                      │
│                      │                                                      │
│                      │  ─── 統計分析（シーン時間帯で自動設定） ────────────  │
│                      │  [選択中: VH-0001 ×]  ※ 車両選択時に自動実行        │
│                      │  StatCard × N (ヒストグラム / 統計値タブ)            │
└──────────────────────┴──────────────────────────────────────────────────────┘
```

---

## 4. 機能仕様

### 4.1 シーン検索

1. テキストボックスにシーン説明を入力
2. [検索] ボタン押下または Enter キーで `POST /analysis/scene-search` を呼び出す
3. クエリテキストを Embedding Lambda に送信し、`FRAME_EMBED_MODE` に応じた埋め込みモデルでベクトルに変換
4. ベクターサーチバックエンドでコサイン類似度近傍探索（デフォルト上位 50 件）
5. 類似度スコア降順でサムネイル一覧を表示する

デフォルト取得件数は 50 件。`limit` パラメータで最大 200 件まで拡張可。

### 4.2 サムネイル一覧

各フレームカードに以下を表示:

| 表示要素 | 内容 |
|---|---|
| サムネイル画像 | S3 presigned URL（有効期限 1 時間） |
| 類似度スコア | パーセント表示。80% 以上 = 緑・60〜79% = 黄・60% 未満 = 赤 |
| 車両 ID | `VH-xxxx` |
| 撮影日時 | `YYYY-MM-DD HH:mm:ss` |
| 選択状態 | クリックで選択（teal ボーダー強調）。再クリックで解除 |

**並び替え**: 類似度順（デフォルト）/ 撮影日時順 をセレクトボックスで切り替え。

**類似度下限フィルタ**: スライダーで 0〜100% を指定（デフォルト: 50%）。クライアントサイドでフィルタリングする（再リクエスト不要）。

### 4.3 ホバー動画再生

1. サムネイルにマウスをホバーすると `GET /analysis/scene-search/{scene_id}/clip` を呼び出す
2. presigned URL 取得後、サムネイル上にオーバーレイで `<video>` を表示
3. 動画は自動再生（muted・loop）。フレーム前後 ±15 秒のクリップを再生する
4. ホバーが外れるとオーバーレイを非表示・動画を停止
5. 一度取得した clip URL は TanStack Query のキャッシュ（staleTime: 5分）で保持し、再ホバー時の再取得を防ぐ

### 4.4 地図表示

- マッチしたフレームの撮影位置（緯度・経度）を `deck.gl` の `ScatterplotLayer` でプロット
- 同一車両の複数フレームはクラスタリング表示（件数バッジ付き）
- 地図上のピンクリックで「その車両のシーンのみ表示」フィルタを適用（クライアントサイド）
- 選択中のシーンに対応する車両ピンは teal 色にハイライト
- フィルタ中は再クリックで解除

### 4.5 カラム登録フロー

横断分析ページと同様の ColumnSearchPanel を左パネルに配置する。
登録済みカラムが車両分析のタイムシリーズチャートと統計分析の両方に使われる。

```
1. 検索クエリ入力 → [検索] ボタン
      ↓ POST /catalogs/search
2. 検索結果一覧
   ├─ アクセス権ありのカラムにチェックボックス
   ├─ 未申請: gray バッジ + [申請→] ボタン → MouAgreementModal
   ├─ 審査中: amber バッジのみ
   └─ [N件を登録] → 登録済みカラムに追加

3. 登録済みカラム一覧
   ├─ [×] で個別解除
   └─ [すべて解除] で一括クリア

4. [N件で分析] ボタン → 車両分析・統計分析パネルを表示
```

### 4.6 車両分析パネル

シーンカードをクリックすると、シーン結果セクションの下に車両分析パネルが展開する。

- `selectedScene.recorded_at` を `at_time` として使用
- `GET /analysis/vehicles/{id}/status` でステータスパネルを表示
- `POST /analysis/vehicles/{id}/timeseries` で登録済みカラムのチャートを表示
- 動画は `GET /analysis/vehicles/{id}/video` で presigned URL を取得して埋め込み再生

**連携ポイント**: シーンカードのクリックで `selectedScene`（`vehicle_id` + `recorded_at`）が更新される。
この更新が車両分析パネルの `at_time` と、統計分析パネルの `vehicle_id` フィルタに伝播する。

### 4.7 統計分析パネル

車両分析パネルの下に統計分析パネルを配置する。

- **時間範囲**: シーン検索結果の `recorded_at` の最小値〜最大値を自動設定（前後 30 分マージン付き）
- **車両フィルタ**: `selectedScene.vehicle_id` を自動適用。バッジ `[選択中: VH-xxxx ×]` を表示。`×` を押すと全車両対象に戻る（統計は自動再実行しない）
- **自動実行条件**: カラムが 1 件以上登録されており、かつ `selectedScene` が変化した場合に自動実行
- **手動実行**: [分析実行] ボタンでも任意に実行可能

---

## 5. データフロー

```
シーン検索結果 (scenes: SceneResult[])
    │
    ├─ [シーン一覧・地図]
    │   カードクリック → selectedScene: { scene_id, vehicle_id, recorded_at }
    │   地図ピンクリック → vehicleFilter (表示フィルタのみ)
    │
    ├─ [車両分析パネル]（selectedScene 選択後かつ [N件で分析] 実行後に表示）
    │   selectedScene.vehicle_id → GET /analysis/vehicles/{id}/status?at_time=recorded_at
    │   selectedScene.vehicle_id + registeredColumns
    │       → POST /analysis/vehicles/{id}/timeseries
    │   selectedScene.vehicle_id → GET /analysis/vehicles/{id}/video?at_time=recorded_at
    │
    └─ [統計分析パネル]（カラム登録済み + selectedScene 変化時に自動実行）
        registeredColumns
        + time_from = min(scenes[].recorded_at) - 30min
        + time_to   = max(scenes[].recorded_at) + 30min
        + vehicle_id = selectedScene.vehicle_id（null = 全車両）
            → POST /analysis/statistics
```

**状態の分離:**

| 状態 | 保持場所 | 役割 |
|---|---|---|
| `query` | `SceneSearch` ローカル | 入力中のシーン検索テキスト |
| `submittedQuery` | `SceneSearch` ローカル | 実行済みクエリ（TanStack Query キーに使う） |
| `scenes` | TanStack Query | シーン検索結果 |
| `selectedScene` | `SceneSearch` ローカル | 選択中シーン（vehicle_id + recorded_at） |
| `vehicleFilter` | `SceneSearch` ローカル | 地図クリックによる表示フィルタ（シーン一覧・地図のみ） |
| `checkedCols` | `ColumnSearchPanel` ローカル | チェック中の検索結果カラム（一時的） |
| `registeredColumns` | `SceneSearch` | 分析に使う登録済みカラム（永続） |
| `applyTarget` | `SceneSearch` | MouAgreementModal に渡すカタログ名 |

- `vehicleFilter` は表示フィルタのみで、分析には影響しない。分析に使う車両は `selectedScene.vehicle_id`
- 新規シーン検索を実行すると `selectedScene` をリセット（分析パネルを閉じる）

---

## 6. API 仕様

### `POST /analysis/scene-search`

シーン検索を実行し、マッチしたフレームの一覧を返す。

**リクエスト**

```json
{
  "query": "急ブレーキをかけている場面",
  "limit": 50,
  "score_threshold": 0.5,
  "time_from": "2026-04-01T00:00:00Z",
  "time_to": "2026-04-12T23:59:59Z",
  "vehicle_ids": ["VH-0001", "VH-0042"]
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `query` | string | ✓ | 検索クエリ（自然言語、最大 500 文字） |
| `limit` | integer | | 最大取得件数（デフォルト: 50、最大: 200） |
| `score_threshold` | float | | 類似度下限（0.0〜1.0、デフォルト: 0.5） |
| `time_from` | string | | 撮影日時フィルタ開始（ISO 8601 UTC） |
| `time_to` | string | | 撮影日時フィルタ終了（ISO 8601 UTC） |
| `vehicle_ids` | string[] | | 車両 ID フィルタ（省略時は全車両対象） |

**レスポンス**

```json
{
  "total": 42,
  "query_embedding_ms": 120,
  "search_ms": 85,
  "scenes": [
    {
      "scene_id": "f3a2b1c0-1234-5678-abcd-000000000001",
      "vehicle_id": "VH-0001",
      "recorded_at": "2026-04-09T10:23:45Z",
      "similarity_score": 0.93,
      "latitude": 35.6895,
      "longitude": 139.6917,
      "thumbnail_url": "https://portal-vehicle-videos.s3.amazonaws.com/..."
    }
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `total` | integer | マッチ総件数（`limit` 適用前） |
| `query_embedding_ms` | integer | テキスト埋め込み変換時間（ms） |
| `search_ms` | integer | Vector Search 探索時間（ms） |
| `scenes[].scene_id` | string | フレーム固有 ID |
| `scenes[].vehicle_id` | string | 車両 ID |
| `scenes[].recorded_at` | string | 撮影日時（ISO 8601 UTC） |
| `scenes[].similarity_score` | float | コサイン類似度スコア（0.0〜1.0） |
| `scenes[].latitude` | float | 撮影時の車両緯度 |
| `scenes[].longitude` | float | 撮影時の車両経度 |
| `scenes[].thumbnail_url` | string | フレームサムネイル S3 presigned URL（有効期限 1 時間） |

**バックエンド処理フロー**

```
1. query テキスト → 埋め込みモデルでベクトル化
   - FRAME_EMBED_MODE=image_clip: CLIP テキストエンコーダを使用
   - FRAME_EMBED_MODE=text_vlm:  テキスト埋め込みモデル（EMBED_MODEL_NAME）を使用
2. CurrentUser.catalog_roles から閲覧可能な catalog_name リストを構築
3. ベクターサーチバックエンドでコサイン類似度検索
   - VECTOR_SEARCH_BACKEND=s3vectors:   S3 Vectors boto3 クライアントで query_vectors
   - VECTOR_SEARCH_BACKEND=qdrant:      qdrant-client で query_points
   - VECTOR_SEARCH_BACKEND=pgvector:    RDS に SQL クエリ
   - VECTOR_SEARCH_BACKEND=databricks:  Vector Search Python SDK を使用
   - フィルタ: catalog_name IN (...), score >= score_threshold
   - time_from / time_to / vehicle_ids が指定された場合は追加条件
4. 返却フレームごとに S3 presigned URL（サムネイル）を生成
5. similarity_score 降順にソートして返却
```

---

### `GET /analysis/scene-search/{scene_id}/clip`

指定フレームの動画クリップ（前後 ±15 秒）の presigned URL を返す。
サムネイルホバー時にフロントエンドが呼び出す。

**パスパラメータ**

| パラメータ | 説明 |
|---|---|
| `scene_id` | `POST /analysis/scene-search` レスポンスの `scene_id` |

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|---|---|---|
| `window_sec` | integer | クリップ長さの片側秒数（デフォルト: 15、最大: 60） |

**レスポンス**

```json
{
  "scene_id": "f3a2b1c0-1234-5678-abcd-000000000001",
  "clip_url": "https://portal-vehicle-videos.s3.amazonaws.com/...",
  "clip_start_at": "2026-04-09T10:23:30Z",
  "clip_end_at": "2026-04-09T10:24:00Z",
  "seek_to_sec": 608.0
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `clip_url` | string | `browser_seek` 時: 元動画の presigned URL / `pre_cut` 時: クリップ動画の presigned URL |
| `clip_start_at` | string | クリップ開始日時（ISO 8601 UTC） |
| `clip_end_at` | string | クリップ終了日時（ISO 8601 UTC） |
| `seek_to_sec` | float | `browser_seek` 時のみ: フロントエンドが `video.currentTime` にセットする秒数（`clip_offset_sec - window_sec`）。`pre_cut` 時は `0.0` |

**バックエンド処理**
- `VectorSearchBackend.get_frame_by_id(scene_id)` でフレームメタデータ（`video_s3_key` / `clip_s3_key` / `clip_offset_sec`）を取得
- `clip_offset_sec ± window_sec` を `clip_start_at` / `clip_end_at` として算出してレスポンスに含める
- クリップの提供方式は `CLIP_MODE` 設定に従う（下記 Section 8.6 参照）

---

### 車両分析・統計分析 API（既存エンドポイントを再利用）

| エンドポイント | 用途 | 変更 |
|---|---|---|
| `POST /catalogs/search` | カラム検索（左パネル） | 変更なし |
| `GET /analysis/vehicles/{id}/status` | 選択シーン時刻のステータス取得 | 変更なし |
| `POST /analysis/vehicles/{id}/timeseries` | 登録カラムの時系列チャート | 変更なし |
| `GET /analysis/vehicles/{id}/video` | 車両動画 presigned URL | 変更なし |
| `POST /analysis/statistics` | 統計分析 | **`vehicle_id` フィールドは横断分析仕様で追加済み** |
| `POST /catalogs/{name}/access-requests` | MOU 申請モーダル | 変更なし |

---

## 7. データ基盤仕様

### 7.1 ベクターサーチバックエンドの選択

`VECTOR_SEARCH_BACKEND` 環境変数でバックエンドを切り替える。

| バックエンド | 設定値 | 適用規模の目安 | 月額費用目安 | 備考 |
|---|---|---|---|---|
| Amazon S3 Vectors | `s3vectors` | 〜数百万フレーム | 従量課金のみ（固定費ゼロ） | **最小スタート推奨**。インフラ管理不要 |
| Qdrant（セルフホスト） | `qdrant` | 〜数千万フレーム | $10〜$50（EC2） | オープンソース。高度なフィルタ・量子化対応 |
| pgvector（Amazon RDS） | `pgvector` | 〜数百万フレーム | $30〜$100 | 高頻度クエリ時にコスト効率が良い |
| Databricks Vector Search | `databricks` | 数百万フレーム〜 | $300〜 | 既存 Databricks 環境との統合時 |

すべてのバックエンドを Lambda から同一インターフェースで呼び出す（Section 10.3 参照）。

---

### 7.2 Amazon S3 Vectors バックエンド（最小スタート推奨）

固定費ゼロのサーバーレス型ベクターストア。AWS ネイティブサービスのため IAM 認証のみで利用でき、インフラ管理が不要。
クエリ頻度が低い PoC・開発初期に最適。高頻度クエリ（毎時数千回〜）になると pgvector の方がコスト効率が良くなる。

**リソース構成**

| リソース | 値 |
|---|---|
| Vector バケット名 | `portal-scene-vectors`（`S3_VECTORS_BUCKET` で設定） |
| インデックス名 | `video-frames` |
| データ型 | `float32` |
| 次元数 | `FRAME_EMBED_DIM` と合わせる |
| 距離指標 | コサイン類似度 |

**パイプラインからの書き込み（boto3）**

```python
import boto3

client = boto3.client("s3vectors", region_name="ap-northeast-1")

# フレーム登録（パイプライン Worker から呼び出す）
client.put_vectors(
    VectorBucketName="portal-scene-vectors",
    IndexName="video-frames",
    Vectors=[
        {
            "Key": frame_id,
            "Data": {"Float32": embedding},
            "Metadata": {
                "vehicle_id":       vehicle_id,
                "recorded_at":      recorded_at_iso,   # "2026-04-09T10:23:45Z"
                "latitude":         str(latitude),
                "longitude":        str(longitude),
                "thumbnail_s3_key": thumbnail_s3_key,
                "video_s3_key":     video_s3_key,      # 元動画（browser_seek 用）
                "clip_s3_key":      clip_s3_key,       # 切り出しクリップ（pre_cut 用）
                "clip_offset_sec":  str(clip_offset_sec),
                "catalog_name":     catalog_name,
                "embed_mode":       embed_mode,
            },
        }
    ],
)
```

**Lambda からの検索クエリ**

```python
# フィルタ式は SQL like の構文（S3 Vectors 仕様）
catalog_filter = " OR ".join(
    [f"catalog_name = '{c}'" for c in catalog_names]
)
time_filter = ""
if time_from and time_to:
    time_filter = f" AND recorded_at >= '{time_from}' AND recorded_at <= '{time_to}'"
vehicle_filter = ""
if vehicle_ids:
    vehicle_filter = " AND (" + " OR ".join(
        [f"vehicle_id = '{v}'" for v in vehicle_ids]
    ) + ")"

result = client.query_vectors(
    VectorBucketName="portal-scene-vectors",
    IndexName="video-frames",
    QueryVector={"Float32": query_vector},
    TopK=limit,
    Filter=f"({catalog_filter}){time_filter}{vehicle_filter}",
    ReturnMetadata=True,
    ReturnDistance=True,
)

scenes = [
    {
        "scene_id":        v["Key"],
        "vehicle_id":      v["Metadata"]["vehicle_id"],
        "recorded_at":     v["Metadata"]["recorded_at"],
        "similarity_score": 1 - v["Distance"],   # コサイン距離 → 類似度スコアに変換
        "latitude":        float(v["Metadata"]["latitude"]),
        "longitude":       float(v["Metadata"]["longitude"]),
        "thumbnail_s3_key": v["Metadata"]["thumbnail_s3_key"],
        "video_s3_key":     v["Metadata"]["video_s3_key"],
        "clip_s3_key":      v["Metadata"]["clip_s3_key"],
        "clip_offset_sec":  float(v["Metadata"]["clip_offset_sec"]),
    }
    for v in result["Vectors"]
    if 1 - v["Distance"] >= score_threshold
]
```

**単一フレーム取得**

```python
result = client.get_vectors(
    VectorBucketName="portal-scene-vectors",
    IndexName="video-frames",
    Keys=[scene_id],
    ReturnMetadata=True,
)
frame = result["Vectors"][0]["Metadata"]
```

**費用目安**

| 項目 | 単価（目安） |
|---|---|
| ベクター保存 | ~$0.10 / 100 万ベクター / 月 |
| クエリ | ~$0.40 / 100 万クエリ |
| 100 万フレーム × 月 1 万クエリ | ~$0.14 / 月 |

---

### 7.3 Qdrant バックエンド（セルフホスト）

オープンソースのベクターデータベース。pgvector より高度なフィルタ機能（ペイロードインデックス・量子化・オンディスクストレージ）を持ち、数千万フレーム規模まで対応できる。
EC2 上に Docker で起動するセルフホスト構成が最もコストを抑えられる。Qdrant Cloud（マネージド）への移行も容易。

**デプロイ構成**

| 構成 | 用途 | 費用目安 |
|---|---|---|
| EC2 + Docker（`t3.medium`） | 〜1000 万フレーム | ~$30/月 |
| EC2 + Docker（`r6g.large`）| 〜5000 万フレーム | ~$80/月 |
| Qdrant Cloud（Free Tier） | 開発・PoC（1 GB 上限） | 無料 |
| Qdrant Cloud（Managed） | 本番移行時 | $25〜 |

**コレクション設計**

```python
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

client = QdrantClient(
    url=settings.qdrant_url,           # "http://localhost:6333" など
    api_key=settings.qdrant_api_key,   # Qdrant Cloud 時のみ
)

# コレクション作成（初回のみ）
client.create_collection(
    collection_name="video-frames",
    vectors_config=VectorParams(
        size=settings.frame_embed_dim,   # FRAME_EMBED_DIM と合わせる
        distance=Distance.COSINE,
    ),
)

# ペイロードインデックス（フィルタ高速化）
client.create_payload_index("video-frames", "catalog_name", "keyword")
client.create_payload_index("video-frames", "vehicle_id",   "keyword")
client.create_payload_index("video-frames", "recorded_at",  "datetime")
```

**パイプラインからの書き込み**

```python
from qdrant_client.models import PointStruct

client.upsert(
    collection_name="video-frames",
    points=[
        PointStruct(
            id=frame_id,          # UUID 文字列（Qdrant は UUID をそのまま受け付ける）
            vector=embedding,
            payload={
                "vehicle_id":       vehicle_id,
                "recorded_at":      recorded_at_iso,  # RFC 3339 形式
                "latitude":         latitude,
                "longitude":        longitude,
                "thumbnail_s3_key": thumbnail_s3_key,
                "video_s3_key":     video_s3_key,     # 元動画（browser_seek 用）
                "clip_s3_key":      clip_s3_key,      # 切り出しクリップ（pre_cut 用）
                "clip_offset_sec":  clip_offset_sec,
                "catalog_name":     catalog_name,
                "embed_mode":       embed_mode,
            },
        )
    ],
)
```

**Lambda からの検索クエリ**

```python
from qdrant_client.models import Filter, FieldCondition, MatchAny, DatetimeRange

must_conditions = [
    FieldCondition(key="catalog_name", match=MatchAny(any=catalog_names)),
]
if time_from and time_to:
    must_conditions.append(
        FieldCondition(
            key="recorded_at",
            range=DatetimeRange(gte=time_from, lte=time_to),
        )
    )
if vehicle_ids:
    must_conditions.append(
        FieldCondition(key="vehicle_id", match=MatchAny(any=vehicle_ids))
    )

results = client.query_points(
    collection_name="video-frames",
    query=query_vector,
    limit=limit,
    score_threshold=score_threshold,
    query_filter=Filter(must=must_conditions),
    with_payload=True,
)

scenes = [
    {
        "scene_id":         str(r.id),
        "vehicle_id":       r.payload["vehicle_id"],
        "recorded_at":      r.payload["recorded_at"],
        "similarity_score": r.score,
        "latitude":         r.payload["latitude"],
        "longitude":        r.payload["longitude"],
        "thumbnail_s3_key": r.payload["thumbnail_s3_key"],
        "video_s3_key":     r.payload["video_s3_key"],
        "clip_s3_key":      r.payload["clip_s3_key"],
        "clip_offset_sec":  r.payload["clip_offset_sec"],
    }
    for r in results.points
]
```

**単一フレーム取得**

```python
points = client.retrieve(
    collection_name="video-frames",
    ids=[scene_id],
    with_payload=True,
)
frame = points[0].payload
```

---

### 7.4 pgvector バックエンド（Amazon RDS for PostgreSQL）

スモールスタート向け。Databricks 不要で低コストから運用できる。

**スキーマ**

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE video_frames (
    frame_id         UUID PRIMARY KEY,
    video_id         TEXT NOT NULL,
    vehicle_id       TEXT NOT NULL,
    recorded_at      TIMESTAMPTZ NOT NULL,
    latitude         DOUBLE PRECISION,
    longitude        DOUBLE PRECISION,
    thumbnail_s3_key TEXT,
    video_s3_key     TEXT,          -- 元動画 S3 キー（browser_seek 用）
    clip_s3_key      TEXT,          -- 切り出しクリップ S3 キー（pre_cut 用）
    clip_offset_sec  DOUBLE PRECISION,
    embedding        vector(512),   -- FRAME_EMBED_DIM と合わせる
    catalog_name     TEXT NOT NULL,
    embed_mode       TEXT NOT NULL  -- 'image_clip' | 'text_vlm'
);

-- コサイン類似度インデックス
CREATE INDEX ON video_frames
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- フィルタ用インデックス
CREATE INDEX ON video_frames (catalog_name, recorded_at);
CREATE INDEX ON video_frames (vehicle_id);
```

**検索クエリ**

`time_from` / `time_to` / `vehicle_ids` はオプション引数のため、Python 側で動的に WHERE 句を組み立てる。

```python
# pgvector 検索（PgVectorBackend.search() 内）
conditions = ["catalog_name = ANY(%s)", "1 - (embedding <=> %s::vector) >= %s"]
params: list = [catalog_names, query_vector, score_threshold]

if time_from and time_to:
    conditions.append("recorded_at BETWEEN %s AND %s")
    params.extend([time_from, time_to])

if vehicle_ids:
    conditions.append("vehicle_id = ANY(%s)")
    params.append(vehicle_ids)

params.append(limit)  # LIMIT 用

sql = f"""
    SELECT frame_id, vehicle_id, recorded_at, latitude, longitude,
           thumbnail_s3_key, video_s3_key, clip_s3_key, clip_offset_sec,
           1 - (embedding <=> %s::vector) AS similarity_score
    FROM video_frames
    WHERE {" AND ".join(conditions)}
    ORDER BY embedding <=> %s::vector
    LIMIT %s
"""
# %s の順序に注意: SELECT 句の embedding %s と WHERE 句の embedding %s で
# query_vector を 2 回バインドする必要がある
```

**RDS インスタンス推奨**

| 規模 | インスタンス | ストレージ |
|---|---|---|
| 〜100 万フレーム | `db.t3.medium` | gp3 100 GB |
| 〜500 万フレーム | `db.r6g.large` | gp3 500 GB |

---

### 7.5 Databricks Vector Search バックエンド

大規模・スケールアウトが必要な段階で移行する。

| 項目 | 値 |
|---|---|
| インデックス種別 | Delta Sync Index |
| ソーステーブル | `{data_catalog}.video.frame_embeddings` |
| 距離指標 | コサイン類似度 |
| 同期方式 | Triggered（パイプライン完了後に Lambda がトリガー） |

**ソース Delta Table スキーマ**

| カラム | 型 | 説明 |
|---|---|---|
| frame_id (PK) | STRING | UUID |
| video_id | STRING | 元動画の ID |
| vehicle_id | STRING | 車両 ID |
| recorded_at | TIMESTAMP | 撮影日時（UTC） |
| latitude | DOUBLE | 撮影時の車両緯度 |
| longitude | DOUBLE | 撮影時の車両経度 |
| thumbnail_s3_key | STRING | サムネイル画像の S3 キー |
| video_s3_key | STRING | 元動画ファイルの S3 キー（`browser_seek` 用） |
| clip_s3_key | STRING | 切り出しクリップ動画の S3 キー（`pre_cut` 用） |
| clip_offset_sec | DOUBLE | 動画ファイル内でのフレーム位置（秒） |
| embedding | ARRAY\<FLOAT\> | フレーム埋め込みベクトル（次元数はモデル依存） |
| catalog_name | STRING | アクセス制御に使うカタログ名 |
| embed_mode | STRING | `image_clip` / `text_vlm` |

PARTITION: `DATE(recorded_at)` / ZORDER: `vehicle_id`

**パイプラインからの書き込み**

```python
from databricks.sdk import WorkspaceClient

# Delta Table に Spark DataFrame として書き込む（パイプライン Worker 内）
df = spark.createDataFrame(frame_rows)
(df.write
   .format("delta")
   .mode("append")
   .option("mergeSchema", "false")
   .saveAsTable(f"{data_catalog}.video.frame_embeddings"))

# Vector Search インデックスを手動トリガー（Triggered Sync）
ws = WorkspaceClient()
ws.vector_search_indexes.sync(index_name=settings.databricks_vector_search_index)
```

**Lambda からの検索クエリ**

```python
from databricks.vector_search.client import VectorSearchClient

client = VectorSearchClient()
index = client.get_index(
    endpoint_name=settings.databricks_vector_search_endpoint,
    index_name=settings.databricks_vector_search_index,
)

filters = {"catalog_name": catalog_names}  # ANY(list) はリストで渡す
if time_from and time_to:
    filters["recorded_at >="] = time_from
    filters["recorded_at <="] = time_to
if vehicle_ids:
    filters["vehicle_id"] = vehicle_ids

results = index.similarity_search(
    query_vector=query_vector,
    columns=["frame_id", "vehicle_id", "recorded_at", "latitude", "longitude",
             "thumbnail_s3_key", "video_s3_key", "clip_s3_key", "clip_offset_sec"],
    filters=filters,
    num_results=limit,
    score_threshold=score_threshold,
)

scenes = [
    {
        "scene_id":         row["frame_id"],
        "vehicle_id":       row["vehicle_id"],
        "recorded_at":      row["recorded_at"],
        "similarity_score": row["score"],
        "latitude":         row["latitude"],
        "longitude":        row["longitude"],
        "thumbnail_s3_key": row["thumbnail_s3_key"],
        "video_s3_key":     row["video_s3_key"],
        "clip_s3_key":      row["clip_s3_key"],
        "clip_offset_sec":  row["clip_offset_sec"],
    }
    for row in results.get("result", {}).get("data_array", [])
]
```

**単一フレーム取得**

```python
# Delta Table から直接取得（Vector Search index 経由では ID 検索できないため）
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import StatementState

ws = WorkspaceClient()
stmt = ws.statement_execution.execute_statement(
    warehouse_id=settings.databricks_warehouse_id,
    statement=f"SELECT * FROM {data_catalog}.video.frame_embeddings WHERE frame_id = '{scene_id}'",
)
frame = stmt.result.data_array[0]
```

---

### 7.6 アクセス制御

バックエンド共通。

- `CurrentUser.catalog_roles` から `role in ("viewer", "editor", "owner")` の `catalog_name` リストを取得
- 検索クエリの WHERE / filters に `catalog_name IN (...)` を渡す
- 閲覧権限のないカタログのフレームは結果に含まれない

---

## 8. 埋め込みパイプライン仕様

### 8.1 概要

S3 に動画がアップロードされると自動的に起動し、フレーム分割・（オプション）テキスト変換・埋め込みベクトル生成をバッチ実行する。
EC2 Auto Scaling Group が SQS のキュー深さに応じてスケールアウト・ゼロスケールする。

### 8.2 アーキテクチャ

```
S3 (動画アップロード)
  └─ S3 Event Notification ─► SQS: VideoEmbeddingQueue
                                     │
                          EC2 Auto Scaling Group
                          (SQS キュー深さでスケール)
                                     │
                          ┌──────────┴──────────────────┐
                          │  Worker（1 メッセージ = 1 動画） │
                          │                               │
                          │  1. S3 から動画をダウンロード   │
                          │  2. ffmpeg でフレーム分割       │
                          │     (FRAME_INTERVAL_SEC 毎)   │
                          │  3. [Optional] VLM でキャプション生成  │
                          │     (FRAME_EMBED_MODE=text_vlm 時)    │
                          │  4. 埋め込みモデルでベクトル生成 │
                          │     (HuggingFace Hub からロード) │
                          │  5. S3 にサムネイル・クリップ保存│
                          │  6. ベクターバックエンドに書き込み│
                          │     S3 Vectors / Qdrant /     │
                          │     pgvector / Databricks     │
                          │  7. SQS メッセージ削除          │
                          └───────────────────────────────┘
```

### 8.3 埋め込みモード

`FRAME_EMBED_MODE` 環境変数で切り替える。

| モード | 設定値 | 処理フロー | 特徴 |
|---|---|---|---|
| 画像埋め込み | `image_clip` | フレーム画像 → CLIP 画像エンコーダ → ベクトル | 高速。テキストと画像を同一空間で比較（CLIP の特性）。日本語クエリは翻訳が必要な場合あり |
| テキスト埋め込み | `text_vlm` | フレーム画像 → VLM（キャプション生成）→ テキスト埋め込みモデル → ベクトル | 日本語クエリと高い整合性。VLM 処理分だけ時間・コスト増 |

### 8.4 埋め込みモデル設定

HuggingFace Hub の任意のモデルを `EMBED_MODEL_NAME` で指定する。

| モード | 環境変数例 | 次元数 | 備考 |
|---|---|---|---|
| `image_clip` | `openai/clip-vit-base-patch32` | 512 | 軽量・汎用 |
| `image_clip` | `openai/clip-vit-large-patch14` | 768 | 高精度 |
| `image_clip` | `laion/CLIP-ViT-H-14-laion2B-s32B-b79K` | 1024 | 最高精度 |
| `text_vlm`（キャプション） | `Salesforce/blip2-opt-2.7b` | — | GPU 必須 |
| `text_vlm`（埋め込み） | `sentence-transformers/paraphrase-multilingual-mpnet-base-v2` | 768 | 日本語対応 |

モデルは EC2 起動時に HuggingFace Hub からキャッシュ（`/opt/models/`）し、2 回目以降はダウンロード不要。

### 8.5 EC2 Auto Scaling 設定

| 項目 | 設定 |
|---|---|
| 最小台数 | 0（アイドル時はゼロスケール） |
| 最大台数 | `MAX_PIPELINE_INSTANCES`（デフォルト: 4） |
| スケールアウト指標 | SQS `ApproximateNumberOfMessagesVisible > 0` |
| スケールイン条件 | キュー空 + 15 分後に終了 |
| インスタンスタイプ（GPU） | `g4dn.xlarge`（VLM・大型 CLIP 使用時） |
| インスタンスタイプ（CPU） | `c5.2xlarge`（小型 CLIP 使用時） |
| ウォームアップ時間 | 300 秒（モデルロード込み） |
| ヘルスチェック | SQS ポーリング成功を CloudWatch カスタムメトリクスで監視 |

### 8.6 フレーム分割・クリップ生成

| 設定項目 | 環境変数 | デフォルト | 説明 |
|---|---|---|---|
| フレーム抽出間隔 | `FRAME_INTERVAL_SEC` | `1.0` | ffmpeg `-vf fps=1/N` に渡す |
| サムネイル幅 | `THUMBNAIL_WIDTH_PX` | `320` | 高さはアスペクト比維持 |
| クリップ方式 | `CLIP_MODE` | `browser_seek` | `browser_seek` / `pre_cut` |
| クリップ長さ（片側） | `CLIP_WINDOW_SEC` | `15` | `pre_cut` 時のみ有効。フレーム前後 ±N 秒を S3 に保存 |

#### クリップ方式の選択

**`browser_seek`（推奨）**: 元動画の presigned URL をそのまま返し、フロントエンドが `video.currentTime = clip_offset_sec - window_sec` でシークする。
EC2 パイプラインでの追加処理・追加ストレージが不要。S3 は HTTP Range リクエストに対応しているためブラウザが必要範囲だけ取得する。

**前提条件**: 元動画が **web-optimized MP4**（moov atom が先頭）であること。EC2 パイプラインの取り込み時に ffmpeg の `-movflags +faststart` で変換する。

```
# パイプラインでの取り込み変換（browser_seek モード時）
ffmpeg -i input.mp4 -movflags +faststart -c copy output.mp4
```

**`pre_cut`**: EC2 パイプラインが動画ローカルダウンロード済みのタイミングで ffmpeg によりクリップを切り出して S3 に保存する。元動画フォーマットが保証できない場合や、クリップだけを配信したい場合に使用する。Databricks Job では行わない。

```
# パイプラインでのクリップ切り出し（pre_cut モード時）
ffmpeg -ss {offset - window} -i input.mp4 -t {window * 2} -c copy clip.mp4
```

---

## 9. エラー・ローディング状態

| 状態 | 表示 |
|---|---|
| 検索前（初期状態） | EmptyState「シーンを説明して検索してください」 |
| 検索中 | Spinner（全幅）+ 「検索中...」テキスト |
| 検索結果なし | EmptyState「マッチするシーンが見つかりませんでした。別のキーワードをお試しください」 |
| クリップ URL 取得中 | サムネイル上にスピナーオーバーレイ |
| クリップ URL 取得エラー | `useUIStore.addToast({ type: "error", message: "動画の取得に失敗しました" })` |
| presigned URL 期限切れ | バナーで「検索結果が期限切れです。再検索してください」と案内 |
| カラム未登録でシーン選択 | 車両分析・統計分析パネルに EmptyState「左パネルで分析カラムを登録してください」 |
| 車両ステータス取得中 | StatusPanel に Spinner |
| 統計分析実行中 | StatCard エリアに Spinner |
| 統計分析エラー | `useUIStore.addToast({ type: "error" })` |

---

## 10. フロントエンド実装仕様

### 新規ファイル

| ファイル | 役割 |
|---|---|
| `frontend/src/components/analysis/SceneSearch.tsx` | ページコンポーネント全体 |
| `frontend/src/components/analysis/SceneCard.tsx` | サムネイルカード（ホバー動画再生ロジック含む） |

### 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `frontend/src/routeTree.ts` | `/analysis/scene-search` ルート追加 |
| `frontend/src/components/common/AppShell.tsx` | NAV に「シーンサーチ」追加（データ分析グループ） |
| `frontend/src/api/index.ts` | `analysisApi.sceneSearch()` / `analysisApi.getSceneClip()` 追加 |
| `frontend/src/hooks/index.ts` | `useSceneSearch()` / `useSceneClip()` カスタムフック追加 |
| `frontend/src/types/index.ts` | `SceneSearchRequest` / `SceneResult` / `SceneClip` 型追加 |

### 状態管理

| 状態 | 保持場所 | 説明 |
|---|---|---|
| `query` | `SceneSearch` ローカル | 入力中のシーン検索テキスト |
| `submittedQuery` | `SceneSearch` ローカル | 実行済みクエリ（TanStack Query キーに使う） |
| `selectedScene` | `SceneSearch` ローカル | 選択シーン（vehicle_id + recorded_at） |
| `vehicleFilter` | `SceneSearch` ローカル | 地図ピンクリックの表示フィルタ |
| `checkedCols` | `ColumnSearchPanel` ローカル | チェック中カラム（一時的） |
| `registeredColumns` | `SceneSearch` | 分析に使う登録済みカラム（永続） |
| `applyTarget` | `SceneSearch` | MouAgreementModal に渡すカタログ名 |
| `scenes` | TanStack Query | シーン検索結果 |
| clip URL | TanStack Query | staleTime: 300_000 ms でキャッシュ |

### TanStack Query キー

```typescript
// シーン検索結果
["analysis", "scene-search", submittedQuery, { scoreThreshold, timeFrom, timeTo, vehicleIds }]

// クリップ URL（ホバー時に enabled: true にして遅延フェッチ）
["analysis", "scene-clip", sceneId, { windowSec }]

// 車両ステータス（selectedScene 変化時）
["analysis", "vehicle", selectedScene.vehicle_id, "status", selectedScene.recorded_at]

// 時系列（selectedScene + registeredColumns 変化時）
["analysis", "vehicle", selectedScene.vehicle_id, "timeseries", columns, timeFrom, timeTo]

// 動画（selectedScene 変化時）
["analysis", "vehicle", selectedScene.vehicle_id, "video", selectedScene.recorded_at]

// 統計分析（selectedScene + registeredColumns 変化時に自動実行）
["analysis", "statistics", columns, sceneTimeFrom, sceneTimeTo, selectedScene.vehicle_id]
```

### ホバー動画再生の実装方針

```
SceneCard
  ├─ <img> サムネイル（常時表示）
  ├─ teal ボーダー: selected === scene_id
  ├─ onMouseEnter: setIsHovering(true)
  ├─ onMouseLeave: setIsHovering(false)
  ├─ onClick: onSelect(scene) → selectedScene を更新
  └─ useSceneClip(sceneId, { enabled: isHovering })
       ├─ isPending → サムネイル上にスピナーオーバーレイ
       └─ data → <div overlay>
                   <video src={data.clip_url} autoPlay muted loop />
                 </div>
```

### 統計分析の時間範囲自動設定

```typescript
// scenes から時間範囲を算出（検索結果が存在する場合のみ）
const sceneTimeFrom = scenes.length > 0
  ? new Date(Math.min(...scenes.map(s => new Date(s.recorded_at).getTime())) - 30 * 60 * 1000).toISOString()
  : undefined;

const sceneTimeTo = scenes.length > 0
  ? new Date(Math.max(...scenes.map(s => new Date(s.recorded_at).getTime())) + 30 * 60 * 1000).toISOString()
  : undefined;
```

---

## 11. バックエンド実装仕様

### 新規エンドポイント（routers.py に追加）

```python
router_analysis.post("/scene-search")                # scene_search
router_analysis.get("/scene-search/{scene_id}/clip")  # get_scene_clip
```

### Pydantic モデル（models.py に追加）

```python
class SceneSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    limit: int = Field(default=50, ge=1, le=200)
    score_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    time_from: Optional[str] = None
    time_to: Optional[str] = None
    vehicle_ids: Optional[list[str]] = None
```

### モックデータ（mock_data.py に追加）

```python
def mock_scene_search(query: str, catalog_names: list[str], limit: int) -> list[dict]:
    return [
        {
            "scene_id": "f3a2b1c0-0000-0000-0000-000000000001",
            "vehicle_id": "VH-0001",
            "recorded_at": "2026-04-09T10:23:45Z",
            "similarity_score": 0.93,
            "latitude": 35.6895,
            "longitude": 139.6917,
            "thumbnail_url": "https://picsum.photos/seed/scene1/320/180",
        },
        {
            "scene_id": "f3a2b1c0-0000-0000-0000-000000000002",
            "vehicle_id": "VH-0042",
            "recorded_at": "2026-04-09T09:15:10Z",
            "similarity_score": 0.88,
            "latitude": 35.6812,
            "longitude": 139.7671,
            "thumbnail_url": "https://picsum.photos/seed/scene2/320/180",
        },
        # ... 合計 10〜20 件
    ]

def mock_scene_clip(scene_id: str, window_sec: int) -> dict:
    # dev モードでは実際の動画がないため seek_to_sec=0 の静止画 URL を返す。
    # フロントエンドは <video> で読み込みエラーになるが、動作確認上は許容する。
    # 実動画でのテストは DEV_MODE=false + 実 S3 環境で行うこと。
    return {
        "scene_id": scene_id,
        "clip_url": f"https://picsum.photos/seed/{scene_id}/320/180",  # 静止画 URL（<video> 非対応）
        "clip_start_at": "2026-04-09T10:23:30Z",
        "clip_end_at": "2026-04-09T10:24:00Z",
        "seek_to_sec": 0.0,
    }
```

### ベクターサーチ抽象層（services/vector_search.py を新規追加）

```python
from abc import ABC, abstractmethod

class VectorSearchBackend(ABC):
    @abstractmethod
    def search(
        self,
        query_vector: list[float],
        catalog_names: list[str],
        limit: int,
        score_threshold: float,
        time_from: Optional[str] = None,
        time_to: Optional[str] = None,
        vehicle_ids: Optional[list[str]] = None,
    ) -> list[dict]: ...

    @abstractmethod
    def get_frame_by_id(self, scene_id: str) -> dict: ...


class S3VectorsBackend(VectorSearchBackend):
    """Amazon S3 Vectors バックエンド（最小スタート推奨）"""
    def search(self, query_vector, catalog_names, limit, score_threshold, ...):
        # boto3 s3vectors client で query_vectors を呼び出す
        # catalog_names を Filter 式に変換して渡す
        ...

    def get_frame_by_id(self, scene_id: str) -> dict:
        # client.get_vectors(Keys=[scene_id], ReturnMetadata=True)
        ...


class QdrantBackend(VectorSearchBackend):
    """Qdrant バックエンド（セルフホスト / Qdrant Cloud）"""
    def search(self, query_vector, catalog_names, limit, score_threshold, ...):
        # qdrant_client で query_points + Filter(must=[...]) を呼び出す
        ...

    def get_frame_by_id(self, scene_id: str) -> dict:
        # client.retrieve(ids=[scene_id], with_payload=True)
        ...


class PgVectorBackend(VectorSearchBackend):
    """pgvector (Amazon RDS) バックエンド"""
    def search(self, query_vector, catalog_names, limit, score_threshold, ...):
        # psycopg2 で RDS に接続し ivfflat コサイン類似度クエリを実行
        ...

    def get_frame_by_id(self, scene_id: str) -> dict:
        # SELECT * FROM video_frames WHERE frame_id = $1
        ...


class DatabricksVectorBackend(VectorSearchBackend):
    """Databricks Vector Search バックエンド"""
    def search(self, query_vector, catalog_names, limit, score_threshold, ...):
        # Vector Search Python SDK を使用
        ...

    def get_frame_by_id(self, scene_id: str) -> dict:
        # Delta Table から直接 SELECT
        ...


def get_vector_backend() -> VectorSearchBackend:
    settings = get_settings()
    if settings.vector_search_backend == "s3vectors":
        return S3VectorsBackend(settings.s3_vectors_bucket)
    if settings.vector_search_backend == "qdrant":
        return QdrantBackend(settings.qdrant_url, settings.qdrant_api_key)
    if settings.vector_search_backend == "pgvector":
        return PgVectorBackend(settings.pgvector_connection_string)
    return DatabricksVectorBackend()
```

### Embedding Lambda（新規 Lambda 関数として分離）

CLIP / sentence-transformers のモデルロードはコールドスタートで 10〜60 秒かかるため、ポータル Lambda とは独立した Lambda 関数として分離する。
**プロビジョニング済みコンカレンシー**を設定してモデルをウォームに保ち、ユーザー向けレイテンシを確保する。

```
ポータル Lambda                     Embedding Lambda
  ①  認証・catalog_names 構築            ← 分離
  ②  boto3.client('lambda').invoke() →  ③  CLIP / sentence-transformers で
       { "query": "...",                      text → vector を返す
         "embed_mode": "image_clip" }     ← プロビジョニング済みコンカレンシー
  ④  query_vector を受け取り               （コールドスタートなし）
  ⑤  ベクターバックエンド検索
  ⑥  S3 presigned URL 付与
  ⑦  レスポンス返却
```

**Embedding Lambda の設定**

| 項目 | 値 |
|---|---|
| メモリ | 2048〜4096 MB（モデルサイズに依存） |
| タイムアウト | 30 秒 |
| プロビジョニング済みコンカレンシー | 1〜2（ウォームインスタンス数） |
| Lambda Layer / Container Image | torch + transformers をパッケージ（Container Image 推奨） |

```python
# services/embedding.py（ポータル Lambda 側: Embedding Lambda の呼び出しクライアント）

import boto3, json

def embed_query(query_text: str) -> list[float]:
    """Embedding Lambda を同期 invoke してベクトルを取得する"""
    client = boto3.client("lambda")
    response = client.invoke(
        FunctionName=settings.embedding_lambda_name,
        InvocationType="RequestResponse",
        Payload=json.dumps({
            "query": query_text,
            "embed_mode": settings.frame_embed_mode,
            "model_name": settings.embed_model_name,
        }),
    )
    return json.loads(response["Payload"].read())["vector"]
```

### 新規ルーターエンドポイント（routers.py に追加）

```python
@router_analysis.post("/scene-search")
def scene_search(body: SceneSearchRequest, user: CurrentUser = Depends(get_current_user)):
    settings = get_settings()

    # dev モード
    scenes = mock.mock_scene_search(body.query, [], body.limit)

    # 本番モード
    if not settings.dev_mode:
        catalog_names = [r.catalog_name for r in user.catalog_roles
                         if r.role in ("viewer", "editor", "owner")]
        query_vector = embed_query(body.query)          # Embedding Lambda を呼び出す
        backend = get_vector_backend()
        scenes = backend.search(
            query_vector, catalog_names, body.limit,
            body.score_threshold, body.time_from, body.time_to, body.vehicle_ids
        )
        for s in scenes:
            s["thumbnail_url"] = db_svc.get_video_presigned_url(s.pop("thumbnail_s3_key"))

    return {"total": len(scenes), "scenes": scenes}


@router_analysis.get("/scene-search/{scene_id}/clip")
def get_scene_clip(scene_id: str, window_sec: int = 15,
                   user: CurrentUser = Depends(get_current_user)):
    settings = get_settings()

    result = mock.mock_scene_clip(scene_id, window_sec)

    if not settings.dev_mode:
        backend = get_vector_backend()
        frame = backend.get_frame_by_id(scene_id)    # 抽象層経由で取得
        offset = frame["clip_offset_sec"]
        if settings.clip_mode == "pre_cut":
            clip_url = db_svc.get_video_presigned_url(frame["clip_s3_key"])
        else:  # browser_seek: 元動画の presigned URL を返す
            clip_url = db_svc.get_video_presigned_url(frame["video_s3_key"])
        result = {
            "scene_id":     scene_id,
            "clip_url":     clip_url,
            "clip_start_at": _offset_to_iso(frame["recorded_at"], offset - window_sec),
            "clip_end_at":   _offset_to_iso(frame["recorded_at"], offset + window_sec),
            "seek_to_sec":  offset - window_sec,  # browser_seek 時にフロントで使用
        }

    return result
```

### 環境変数（新規追加分）

| 変数名 | デフォルト | 説明 |
|---|---|---|
| `VECTOR_SEARCH_BACKEND` | `s3vectors` | `s3vectors` / `qdrant` / `pgvector` / `databricks` |
| `S3_VECTORS_BUCKET` | `portal-scene-vectors` | S3 Vectors バケット名（s3vectors 時のみ） |
| `S3_VECTORS_INDEX` | `video-frames` | S3 Vectors インデックス名（s3vectors 時のみ） |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant エンドポイント URL（qdrant 時のみ） |
| `QDRANT_API_KEY` | — | Qdrant Cloud API キー（Qdrant Cloud 時のみ） |
| `QDRANT_COLLECTION` | `video-frames` | Qdrant コレクション名（qdrant 時のみ） |
| `PGVECTOR_CONNECTION_STRING` | — | RDS 接続文字列（pgvector 時のみ） |
| `EMBEDDING_LAMBDA_NAME` | `portal-embedding` | Embedding Lambda 関数名 |
| `FRAME_EMBED_MODE` | `image_clip` | `image_clip` / `text_vlm` |
| `EMBED_MODEL_NAME` | `openai/clip-vit-base-patch32` | HuggingFace モデル ID |
| `FRAME_EMBED_DIM` | `512` | 埋め込みベクトルの次元数（モデルと合わせる） |
| `CLIP_MODE` | `browser_seek` | `browser_seek` / `pre_cut` |
| `DATABRICKS_VECTOR_SEARCH_ENDPOINT` | — | Vector Search エンドポイント名（databricks 時のみ） |
| `DATABRICKS_VECTOR_SEARCH_INDEX` | — | Vector Search インデックス名（databricks 時のみ） |

---

## 12. ディレクトリ構成

`pipeline/` と `embedding_lambda/` は `backend/` と独立したデプロイ単位のため `portal/` 直下に並列配置する。
`backend/` に混在させると Lambda パッケージに torch / ffmpeg が混入してサイズ上限（250 MB）を超えるため。

```
datapf-portal/
├── portal/
│   ├── backend/                        ポータル Lambda（既存・変更あり）
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── config.py               VECTOR_SEARCH_BACKEND / CLIP_MODE など追加
│   │   │   ├── models.py               SceneSearchRequest 追加
│   │   │   ├── routers.py              scene_search / get_scene_clip 追加
│   │   │   └── services/
│   │   │       ├── databricks.py
│   │   │       ├── mock_data.py        mock_scene_search / mock_scene_clip 追加
│   │   │       ├── vector_search.py    新規: VectorSearchBackend 抽象 + 4実装
│   │   │       └── embedding.py        新規: embed_query()（Embedding Lambda 呼び出し）
│   │   ├── tests/
│   │   │   └── test_api.py             シーンサーチテスト追加
│   │   ├── Dockerfile
│   │   ├── pyproject.toml
│   │   └── requirements.txt            qdrant-client / psycopg2-binary 追加
│   │
│   ├── frontend/                       React SPA（既存・変更あり）
│   │   └── src/
│   │       ├── components/analysis/
│   │       │   ├── SceneSearch.tsx     新規
│   │       │   └── SceneCard.tsx       新規
│   │       ├── routeTree.ts            /analysis/scene-search 追加
│   │       ├── components/common/
│   │       │   └── AppShell.tsx        NAV 項目追加
│   │       ├── api/index.ts            sceneSearch / getSceneClip 追加
│   │       ├── hooks/index.ts          useSceneSearch / useSceneClip 追加
│   │       └── types/index.ts          SceneSearchRequest / SceneResult / SceneClip 追加
│   │
│   ├── pipeline/                       EC2 パイプライン Worker（新規）
│   │   ├── worker.py                   SQS ポーリング → 処理 → 書き込みのメインループ
│   │   ├── frame_extractor.py          ffmpeg フレーム分割・-movflags +faststart 変換
│   │   ├── embed_image.py              image_clip モード: CLIP 画像エンコーダ
│   │   ├── embed_text_vlm.py           text_vlm モード: VLM キャプション + テキスト埋め込み
│   │   ├── writer.py                   S3 Vectors / Qdrant / pgvector / Databricks 書き込み
│   │   ├── config.py                   FRAME_INTERVAL_SEC / EMBED_MODEL_NAME / CLIP_MODE など
│   │   ├── Dockerfile                  torch + transformers + ffmpeg（GPU 対応）
│   │   └── requirements.txt            ffmpeg-python / torch / transformers / qdrant-client など
│   │
│   ├── embedding_lambda/               Embedding Lambda（新規）
│   │   ├── handler.py                  text → vector ハンドラ（CLIP / sentence-transformers）
│   │   ├── Dockerfile                  Container Image（torch + transformers + モデルキャッシュ）
│   │   └── requirements.txt            torch / transformers / sentence-transformers
│   │
│   ├── infra/
│   │   └── terraform/
│   │       └── modules/
│   │           ├── pipeline/           新規: EC2 ASG + SQS + Launch Template + IAM
│   │           └── embedding_lambda/   新規: Lambda + Provisioned Concurrency + ECR + IAM
│   │
│   ├── Makefile                        pipeline / embedding_lambda のビルド・デプロイ追加
│   └── docker-compose.yml
└── spec/
```

### 各コンポーネントの依存関係

```
ブラウザ
  └─ portal/frontend/
        │ API calls (/v1/*)
  portal/backend/              ← FastAPI Lambda（軽量: boto3 / psycopg2 / qdrant-client のみ）
        ├─ services/vector_search.py  → S3 Vectors / Qdrant / pgvector / Databricks（検索のみ）
        └─ services/embedding.py      → portal/embedding_lambda/（boto3 Lambda invoke）

  portal/embedding_lambda/     ← torch + transformers（Container Image、Provisioned Concurrency）
        text → vector

  portal/pipeline/             ← torch + transformers + ffmpeg（EC2 Auto Scaling Worker）
        video → frames → embeddings → 各ベクターバックエンドへ書き込み
```

---

## 13. 変更ファイル一覧

### portal/backend/（ポータル Lambda）

| ファイル | 変更種別 |
|---|---|
| `app/models.py` | `SceneSearchRequest` 追加 |
| `app/routers.py` | `scene_search` / `get_scene_clip` エンドポイント追加 |
| `app/config.py` | `VECTOR_SEARCH_BACKEND` / `CLIP_MODE` / `EMBEDDING_LAMBDA_NAME` など追加 |
| `app/services/mock_data.py` | `mock_scene_search` / `mock_scene_clip` 追加 |
| `app/services/vector_search.py` | **新規**（`VectorSearchBackend` 抽象クラス + `S3VectorsBackend` + `QdrantBackend` + `PgVectorBackend` + `DatabricksVectorBackend`） |
| `app/services/embedding.py` | **新規**（`embed_query()` — Embedding Lambda の boto3 呼び出しクライアント） |
| `requirements.txt` | `qdrant-client` / `psycopg2-binary` / `pgvector` 追加（boto3 は既存） |
| `tests/test_api.py` | シーンサーチ関連テストケース追加 |

### portal/frontend/（React SPA）

| ファイル | 変更種別 |
|---|---|
| `src/components/analysis/SceneSearch.tsx` | **新規** |
| `src/components/analysis/SceneCard.tsx` | **新規** |
| `src/routeTree.ts` | `/analysis/scene-search` ルート追加 |
| `src/components/common/AppShell.tsx` | NAV 項目追加（データ分析グループ） |
| `src/api/index.ts` | `sceneSearch` / `getSceneClip` 追加 |
| `src/hooks/index.ts` | `useSceneSearch` / `useSceneClip` 追加 |
| `src/types/index.ts` | `SceneSearchRequest` / `SceneResult` / `SceneClip` 型追加 |

### portal/pipeline/（新規ディレクトリ）

| ファイル | 内容 |
|---|---|
| `worker.py` | SQS ポーリング → フレーム分割 → 埋め込み生成 → 書き込みのメインループ |
| `frame_extractor.py` | ffmpeg フレーム分割・`-movflags +faststart` 変換・クリップ切り出し |
| `embed_image.py` | `image_clip` モード: CLIP 画像エンコーダによる埋め込み生成 |
| `embed_text_vlm.py` | `text_vlm` モード: VLM キャプション生成 + テキスト埋め込み |
| `writer.py` | S3 Vectors / Qdrant / pgvector / Databricks Delta Table への書き込み |
| `config.py` | 環境変数読み込み（`FRAME_INTERVAL_SEC` / `EMBED_MODEL_NAME` / `CLIP_MODE` など） |
| `Dockerfile` | EC2 Worker 用 Container Image（ffmpeg + torch + transformers） |
| `requirements.txt` | `ffmpeg-python` / `torch` / `transformers` / `qdrant-client` / `psycopg2-binary` など |

### portal/embedding_lambda/（新規ディレクトリ）

| ファイル | 内容 |
|---|---|
| `handler.py` | Lambda ハンドラ（CLIP / sentence-transformers をロードして text → vector を返す） |
| `Dockerfile` | Container Image（torch + transformers + HuggingFace モデルキャッシュ） |
| `requirements.txt` | `torch` / `transformers` / `sentence-transformers` |

### portal/infra/（Terraform モジュール追加）

| ディレクトリ | 内容 |
|---|---|
| `terraform/modules/pipeline/` | EC2 Auto Scaling Group + SQS + Launch Template + IAM ロール |
| `terraform/modules/embedding_lambda/` | Lambda 関数 + Provisioned Concurrency + ECR リポジトリ + IAM ロール |
