# データ基盤ポータルサイト 仕様書

Databricks（AWS上）を中核とした自動車データ管理ポータル。
データカタログ管理・データアプリ管理・データ分析の3機能を提供する。

---

## 1. 技術スタック

| レイヤー | 技術・サービス |
|---|---|
| フロントエンド | TypeScript / React 19 + Vite 5、Tailwind CSS 4、TanStack Query v5、TanStack Router、Zustand、deck.gl / kepler.gl（地図）、Recharts + Plotly.js（チャート）、React Hook Form + Zod |
| バックエンド | Python 3.11 / AWS Lambda + API Gateway、FastAPI + Mangum |
| 認証 | AWS IAM Identity Center（SAML/OIDC SSO）、AWS Cognito（アプリ連携フェデレーション） |
| データ基盤 | Databricks on AWS（Unity Catalog、Delta Lake、Serverless SQL Warehouse、Vector Search、Lakehouse Monitoring） |
| ストレージ | Amazon S3（静的サイト・車載動画） |
| 配信 | Amazon CloudFront（CDN・HTTPS終端） |
| 通知 | AWS SES（申請・承認メール）、ポータル内通知（Delta Table） |

---

## 2. 扱うデータ

- **時系列データ**: 走行軌跡・車両状態・故障状態が時系列で記録されたデータ。車両からアップロードされ共通カタログとして登録済み。
- **ドメイン別データ**: 各ユーザーが業務ドメインで生成したデータ（実験データ等）。データカタログに登録することで他チームからも閲覧可能。

---

## 3. ユーザーロールと権限

ロールはカタログ単位で割り当てられる。同一ユーザーがカタログAではオーナー、カタログBでは一般ユーザーになりうる。

| ロール | Databricks グループ | Unity Catalog 権限 | 備考 |
|---|---|---|---|
| システムアドミン | `portal-admins` | Metastore Admin | システム全体管理 |
| データオーナー | `catalog-owner-{catalog}` | ALL PRIVILEGES on catalog | カタログごとにグループ作成 |
| データ編集者 | `catalog-editor-{catalog}` | USE CATALOG, READ VOLUME, WRITE VOLUME, MODIFY | |
| データ閲覧者 | `catalog-viewer-{catalog}` | USE CATALOG, SELECT | 個人情報含む閲覧可 |
| 一般ユーザー | `portal-users` | USE CATALOG, SELECT（マスク済みビューのみ） | 個人情報参照不可 |

ポータルは `system.information_schema` および Databricks Permissions API を使いカタログごとの実効権限を動的に取得する。

---

## 4. 認証フロー

1. 未認証ユーザーは IAM Identity Center のログイン画面にリダイレクト
2. 認証成功後、ID Token / Access Token をフロントエンドに返却
3. フロントは `Authorization: Bearer {token}` ヘッダで API Gateway に送信
4. Lambda 内で IAM Identity Center の JWKS を用いてトークン検証（JWKSはキャッシュ必須）
5. `sub` からユーザーIDを取得し、Databricks Permissions API でカタログ別ロールを構築
6. Access Token はブラウザのメモリのみ保持（`localStorage` 不使用）

### データアプリ連携（Cognito フェデレーション）

1. アプリ管理者がポータルに Cognito User Pool ARN を登録
2. Lambda が Cognito に IAM Identity Center を OIDC プロバイダーとして設定
3. アプリ側 Cognito がポータル Cognito を外部 IdP として信頼
4. 初回アクセス時にアプリ側 Cognito へユーザーが自動プロビジョニング

---

## 5. 機能仕様

### 5.1 データカタログ

#### マーケットプレイス（閲覧申請）

- カタログ一覧をカード形式で表示（名前・説明・オーナー・申請ステータス）
- 検索（カタログ名・説明の部分一致）・「閲覧中のみ」フィルタ
- カードから MOU 合意モーダルを開いて閲覧申請

#### 閲覧申請フロー

| ステート | トリガー | 処理 |
|---|---|---|
| PENDING | ユーザーが MOU 合意して申請 | Delta Table INSERT、データオーナーにポータル通知 + SES メール |
| APPROVED | 自動承認 or データオーナー承認 | `catalog-viewer-{catalog}` グループにユーザー追加、Delta Table 更新、申請者に通知 |
| REJECTED | データオーナーが却下 | Delta Table 更新、申請者にポータル通知 + SES メール |
| REVOKED | ユーザーが解除 | グループから削除、データオーナーへの通知なし |

`requires_approval=false`（デフォルト）の場合は MOU 合意で即 APPROVED。`true` の場合は PENDING のままデータオーナーが承認するまで待機。

#### MOU・チェックリスト管理（データオーナー）

- MOU 本文（Markdown）とチェックリスト項目を編集・バージョン発行
- 新バージョン発行時は既存ユーザーの再合意は不要（オーナーが任意に促す運用）
- バージョン文字列は `v1`, `v2`, ... と採番

#### メンバー管理（データオーナー）

- メンバー一覧表示（Databricks Permissions API + IAM Identity Center）
- ロール変更: 旧グループから削除し新グループに追加（REVOKE → GRANT）
- メンバー削除: Databricks グループから削除 + `mou_agreements` を REVOKED に更新

#### 横断検索

- 自然言語クエリで複数カタログのカラムを検索（Databricks Vector Search）
- 検索対象はログインユーザーが閲覧権限を持つカタログのみ
- 検索結果カラムを `vehicle_id + timestamp` で JOIN した時系列プレビューを表示
- 結果を Unity Catalog 上に `CREATE VIEW` として保存可能

#### カタログ作成申請

- Lambda がサービスプリンシパルで Databricks Catalogs REST API を呼び出しカタログ作成
- 作成者を `catalog-owner-{catalog_name}` グループに追加し ALL PRIVILEGES を GRANT
- `portal.governance.catalog_definitions` に INSERT

---

### 5.2 データアプリ

| 機能 | 実装方針 |
|---|---|
| 登録申請 | アプリ名・説明・redirect_url・使用カタログ・Cognito User Pool ARN を入力して `portal.apps.app_registry` に記録 |
| マーケットプレイス表示 | Delta Table からアプリ一覧を取得しカード形式で表示。`is_subscribed` で操作ボタン切り替え |
| 使用開始申請 | `portal.apps.app_subscriptions` に記録、アプリ管理者に SES メール、Cognito 自動プロビジョニング |
| 使用解除 | Delta Table ステータス更新（REVOKED）+ Cognito からユーザー削除 |
| リダイレクト | Cognito で署名済みトークン付与 URL を生成してアプリに遷移。URL は外部に露出しないこと（有効期限 300 秒） |
| アプリ情報更新 | `PUT /apps/{app_id}` でオーナーが情報を更新 |

---

### 5.3 データ分析

#### 車両分析

1. 地域（japan / europe / north_america）と時刻を選択
2. 指定時刻の車両位置を deck.gl の ScatterplotLayer / IconLayer で地図にプロット
3. 地図上の車両クリックで右ペインに車両ステータスを表示（カラム名・値・単位は Unity Catalog タグから動的取得）
4. カラムを選択して時系列ラインチャートを表示（Recharts。dual Y-axis）
5. 車載動画を presigned URL（有効期限 1 時間）で埋め込み再生・ダウンロード
6. 取得行数が 10,000 件超の場合は `downsample_interval_sec` を自動調整

#### 統計分析

1. 地域・時刻範囲・カラム（横断検索で選択）を指定して「分析実行」
2. Databricks Serverless SQL Warehouse で `COUNT / AVG / STDDEV / PERCENTILE_CONT / WIDTH_BUCKET` を集計
3. カラムごとに StatCard（統計数値）+ ヒストグラム / 箱ひげ図（Plotly.js）を表示

---

### 5.4 通知・アラート

| 種別 | 送信元 | チャネル |
|---|---|---|
| 閲覧申請通知（データオーナー宛） | Lambda | `portal.notifications.inbox` INSERT + SES メール |
| 承認・却下通知（申請者宛） | Lambda | `portal.notifications.inbox` INSERT + SES メール |
| データ品質アラート（データオーナー宛） | Databricks Job | Lakehouse Monitoring 評価 → `quality_alerts` INSERT → `inbox` INSERT |
| システム連絡事項（全ユーザー / 指定ユーザー宛） | Lambda（管理者操作） | `portal.notifications.inbox` 一括 INSERT |

- 通知はリアルタイム性不要。フロントエンドが 30 秒ポーリングで未読数を取得。
- `email_sent` フラグで SES 重複送信を防止。

---

## 6. API エンドポイント

Base URL: `https://api.{domain}/v1`  
認証: `Authorization: Bearer {OIDC_Access_Token}`（IAM Identity Center 発行）  
ページネーション: `limit`（デフォルト 50・最大 200）/ `offset`

| メソッド | パス | 概要 | 最低必要ロール |
|---|---|---|---|
| GET | `/auth/me` | ログインユーザー情報・カタログ別ロール一覧 | 全ロール |
| GET | `/notifications` | 通知一覧（`is_read` / `limit` / `offset`） | 全ロール |
| PATCH | `/notifications/{id}/read` | 通知を既読に更新 | 本人のみ |
| PATCH | `/notifications/read-all` | 全未読通知を一括既読 | 全ロール |
| GET | `/catalogs` | カタログ一覧（`q` / `subscribed`） | 全ロール |
| GET | `/catalogs/{catalog_name}` | カタログ詳細（スキーマ一覧含む） | 全ロール |
| POST | `/catalogs` | カタログ作成申請 | 全ロール |
| GET | `/catalogs/{catalog_name}/mou` | MOU・チェックリスト取得（`version` 省略で最新） | 全ロール |
| PUT | `/catalogs/{catalog_name}/mou` | MOU・チェックリスト更新（新バージョン発行） | データオーナー |
| GET | `/catalogs/{catalog_name}/members` | メンバー一覧（`role` フィルタ） | データオーナー |
| PATCH | `/catalogs/{catalog_name}/members/{user_id}` | メンバーのロール変更 | データオーナー |
| DELETE | `/catalogs/{catalog_name}/members/{user_id}` | メンバー削除（権限剥奪） | データオーナー |
| GET | `/catalogs/{catalog_name}/access-requests` | 閲覧申請一覧（`status` フィルタ） | データオーナー |
| POST | `/catalogs/{catalog_name}/access-requests` | 閲覧申請（MOU 合意記録・権限付与） | 全ロール |
| PATCH | `/catalogs/{catalog_name}/access-requests/{id}` | 申請の承認・却下 | データオーナー |
| DELETE | `/catalogs/{catalog_name}/access-requests/{id}` | 申請取消（PENDING）/ 購読解除（APPROVED） | 申請者本人 |
| POST | `/catalogs/search` | 横断検索（Vector Search・時系列結合プレビュー） | 全ロール |
| POST | `/catalogs/search/views` | 検索結果を CREATE VIEW として保存 | データ閲覧者以上 |
| GET | `/apps` | データアプリ一覧（`q` / `subscribed`） | 全ロール |
| GET | `/apps/{app_id}` | データアプリ詳細 | 全ロール |
| POST | `/apps` | データアプリ登録申請 | 全ロール |
| PUT | `/apps/{app_id}` | データアプリ情報更新 | アプリオーナー |
| POST | `/apps/{app_id}/subscriptions` | アプリ使用開始申請 | 全ロール |
| DELETE | `/apps/{app_id}/subscriptions` | アプリ使用解除 | 利用登録済みユーザー |
| POST | `/apps/{app_id}/redirect-token` | リダイレクト用認証トークン発行（有効期限 300 秒） | 利用登録済みユーザー |
| POST | `/analysis/vehicles` | 指定時刻の地域内車両位置一覧 | データ閲覧者以上 |
| GET | `/analysis/vehicles/{vehicle_id}/status` | 個別車両ステータス（`at_time` 必須） | データ閲覧者以上 |
| POST | `/analysis/vehicles/{vehicle_id}/timeseries` | 車両時系列データ（カラム指定・ダウンサンプリング） | データ閲覧者以上 |
| GET | `/analysis/vehicles/{vehicle_id}/video` | 車載動画 presigned URL（有効期限 1 時間） | データ閲覧者以上 |
| POST | `/analysis/statistics` | 統計分析データ（地域・時刻範囲・カラム指定） | データ閲覧者以上 |
| GET | `/alerts` | データ品質アラート一覧（`catalog_name` / `status`） | データオーナー（自分のカタログのみ） |
| GET | `/alerts/{alert_id}` | アラート詳細（実測値・閾値・詳細メッセージ） | データオーナー |
| GET | `/admin/users` | 全ユーザー一覧（`q` / `limit` / `offset`） | システムアドミン |
| POST | `/admin/notifications` | システム連絡事項送信（全員 or 指定ユーザー） | システムアドミン |

### 共通エラーレスポンス

| ステータス | 説明 |
|---|---|
| 400 | バリデーションエラー。`errors[]` に詳細 |
| 401 | トークン未設定または期限切れ |
| 403 | 操作に必要なロールなし |
| 404 | 指定リソースが存在しない |
| 500 | Lambda 内部エラー（CloudWatch Logs に詳細） |

---

## 7. Delta Table スキーマ

Unity Catalog: `portal` / 5 スキーマ / 10 テーブル

### 設計方針

- PK は STRING 型の UUID（`uuid.uuid4()`）
- タイムスタンプは TIMESTAMP 型・UTC。カラム名は `_at` サフィックス
- 物理削除なし。削除は `status` カラムで表現
- 参照整合性は Lambda 側ロジックで保証（Delta Table は外部キー制約を強制しない）
- Delta Change Data Feed（CDF）は `mou_agreements` と `operation_log` で有効化

### portal.governance スキーマ

#### catalog_definitions
| カラム | 型 | 説明 |
|---|---|---|
| catalog_name (PK) | STRING | Unity Catalog 上の識別子 |
| display_name | STRING | ポータル表示名 |
| description | STRING | 説明文（Markdown 可）|
| owner_user_id (FK) | STRING | データオーナーのユーザー ID |
| requires_approval | BOOLEAN | 承認フェーズの要否（default: false） |
| status | STRING | ACTIVE / SUSPENDED |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

ZORDER: `owner_user_id`

#### mou_definitions
| カラム | 型 | 説明 |
|---|---|---|
| mou_id (PK) | STRING | UUID |
| catalog_name (FK) | STRING | |
| version | STRING | v1, v2, ... 同一カタログ内で一意 |
| mou_text | STRING | MOU 本文（Markdown） |
| checklist_json | STRING | `[{"item_id":"...","label":"...","required":true}]` |
| is_current | BOOLEAN | 現行バージョンフラグ |
| created_by | STRING | データオーナーのユーザー ID |
| created_at | TIMESTAMP | |

ZORDER: `catalog_name` / VACUUM: 90日（過去バージョン参照のため延長）

#### mou_agreements（Delta CDF 有効）
| カラム | 型 | 説明 |
|---|---|---|
| agreement_id (PK) | STRING | UUID |
| catalog_name (FK) | STRING | |
| user_id | STRING | 申請者 ID |
| mou_id (FK) | STRING | 合意した MOU |
| mou_version | STRING | 合意時バージョン（非正規化・監査用） |
| checklist_responses_json | STRING | `[{"item_id":"...","checked":true}]` |
| status | STRING | PENDING / APPROVED / REJECTED / REVOKED |
| agreed_at | TIMESTAMP | |
| decided_at | TIMESTAMP | NULL = 審査中 |
| decided_by | STRING | 自動承認時は `'SYSTEM'` |
| revoked_at | TIMESTAMP | REVOKED 時のみ |
| notes | STRING | データオーナーのコメント（任意） |

PARTITION: `DATE(agreed_at)` / ZORDER: `catalog_name, user_id` / VACUUM: 90日

---

### portal.apps スキーマ

#### app_registry
| カラム | 型 | 説明 |
|---|---|---|
| app_id (PK) | STRING | UUID |
| name | STRING | アプリ表示名 |
| description | STRING | |
| owner_user_id | STRING | 登録者ユーザー ID |
| redirect_url | STRING | アプリ遷移先 URL |
| used_catalog_names_json | STRING | JSON 配列 |
| published_catalog_names_json | STRING | JSON 配列（任意） |
| cognito_user_pool_arn | STRING | 自動登録用 ARN（NULL = 手動運用） |
| cognito_region | STRING | |
| status | STRING | ACTIVE / SUSPENDED / DELETED |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

#### app_subscriptions
| カラム | 型 | 説明 |
|---|---|---|
| subscription_id (PK) | STRING | UUID |
| app_id (FK) | STRING | |
| user_id | STRING | |
| status | STRING | ACTIVE / REVOKED |
| cognito_provisioned | BOOLEAN | Cognito 自動登録の成否 |
| cognito_username | STRING | プロビジョニング成功時のユーザー名 |
| subscribed_at | TIMESTAMP | |
| revoked_at | TIMESTAMP | REVOKED 時のみ |

---

### portal.notifications スキーマ

#### inbox
| カラム | 型 | 説明 |
|---|---|---|
| notification_id (PK) | STRING | UUID |
| recipient_user_id | STRING | 受信者ユーザー ID |
| type | STRING | ACCESS_REQUEST / APPROVAL / REJECTION / REVOCATION / QUALITY_ALERT / SYSTEM_MESSAGE |
| title | STRING | 最大 200 文字 |
| body | STRING | Markdown 可 |
| related_catalog | STRING | 任意 |
| related_entity_id | STRING | agreement_id / alert_id 等（任意） |
| is_read | BOOLEAN | default: false |
| email_sent | BOOLEAN | SES 送信済みフラグ（重複防止） |
| created_at | TIMESTAMP | |
| read_at | TIMESTAMP | |

PARTITION: `DATE(created_at)` / ZORDER: `recipient_user_id, is_read`

#### quality_alerts
| カラム | 型 | 説明 |
|---|---|---|
| alert_id (PK) | STRING | UUID（Databricks Job が生成） |
| catalog_name | STRING | |
| table_full_name | STRING | `{catalog}.{schema}.{table}` 形式 |
| metric_name | STRING | null_rate / row_count_drop / schema_change / duplicate_rate / freshness |
| severity | STRING | HIGH / MEDIUM / LOW |
| status | STRING | OPEN / RESOLVED |
| threshold | DOUBLE | |
| actual_value | DOUBLE | |
| detail_message | STRING | |
| monitoring_run_id | STRING | トレーサビリティ用 |
| triggered_at | TIMESTAMP | |
| resolved_at | TIMESTAMP | RESOLVED 時のみ |

書き込み: Databricks Job のみ（Lambda は読み取りのみ）

---

### portal.search スキーマ

#### search_history
`search_id`, `user_id`, `query_text`, `target_catalogs_json`, `result_count`, `time_from`, `time_to`, `searched_at`
- Row-Level Security: ユーザーは自分の履歴のみ参照可

#### saved_views
`view_id`, `user_id`, `view_full_name`（UNIQUE）, `source_search_id`, `ddl`, `description`, `status`（ACTIVE / DROPPED）, `created_at`, `dropped_at`
- Unity Catalog 側で DROP された場合、Lambda が次回参照時に `system.information_schema.views` で確認し DROPPED に更新

---

### portal.audit スキーマ

#### operation_log（Delta CDF 有効）
`log_id`, `user_id`, `method`, `path`, `action`, `target_entity`, `request_body_json`（秘匿フィールドはマスク）, `status_code`, `error_message`, `duration_ms`, `operated_at`

Lambda の全 API 呼び出しで共通ミドルウェアが書き込む。PARTITION: `DATE(operated_at)` / VACUUM: 90日

---

## 8. フロントエンド画面一覧

| ルート | 画面名 | 最低必要ロール |
|---|---|---|
| `/login` | ログイン | 未認証 |
| `/catalogs/marketplace` | カタログマーケットプレイス | 全ロール |
| `/catalogs/:name` | カタログ詳細 | 全ロール |
| `/catalogs/:name/edit` | MOU エディタ（データオーナー） | データオーナー |
| `/catalogs/:name/requests` | 閲覧申請管理 | データオーナー |
| `/catalogs/search` | 横断検索 | 全ロール |
| `/apps` | データアプリマーケットプレイス | 全ロール |
| `/apps/register` | アプリ登録フォーム | 全ロール |
| `/analysis/vehicles` | 車両分析 | データ閲覧者以上 |
| `/analysis/statistics` | 統計分析 | データ閲覧者以上 |
| `/notifications` | 通知一覧 | 全ロール |
| `/alerts` | データ品質アラート一覧 | データオーナー |

### 主要な状態管理

| Zustand ストア | 保持状態 |
|---|---|
| `authStore` | `currentUser`, `token`, `isAuthenticated` |
| `uiStore` | `sidebarOpen`, `toasts[]`, `modals[]` |
| `analysisStore` | `region`, `atTime`, `selectedVehicleId`, `selectedColumns` |

### TanStack Query staleTime

| queryKey | staleTime |
|---|---|
| `['auth', 'me']` | 5分 |
| `['catalogs', params]` | 2分 |
| `['catalogs', name, 'mou']` | 10分 |
| `['notifications', params]` | 30秒（refetchInterval） |
| `['analysis', 'vehicles', ...]` | 1分 |
| `['analysis', 'vehicle', id, 'timeseries', ...]` | 5分 |

---

## 9. インフラ・セキュリティ

### AWS リソース

| サービス | 用途 |
|---|---|
| IAM Identity Center | SSO・ユーザーディレクトリ |
| Amazon Cognito | データアプリ向けフェデレーション IdP |
| Amazon S3 | React 静的サイト・車載動画ストレージ |
| Amazon CloudFront | S3 エッジ配信・HTTPS 終端（OAC） |
| AWS Lambda (Python 3.11) | バックエンド API |
| Amazon API Gateway (HTTP API) | Lambda フロントエンド（JWT オーソライザー） |
| AWS SES | 申請・承認・却下メール通知 |
| AWS Secrets Manager | Databricks 認証情報 |

### セキュリティ方針

| 観点 | 対応方針 |
|---|---|
| 通信暗号化 | CloudFront で HTTPS 強制。Lambda ↔ Databricks は TLS 1.2 以上 |
| トークン管理 | Access Token はブラウザのメモリのみ保持（`localStorage` 不使用） |
| S3 動画アクセス | パブリックアクセスブロック。Lambda が presigned URL（有効期限 1 時間）を発行 |
| Databricks API 認証 | Lambda はサービスプリンシパルの OAuth2 M2M トークンのみ使用（PAT 禁止） |
| 個人情報マスキング | 一般ユーザー向けは Unity Catalog の Row/Column Filter でマスク済みビューを提供 |
| 監査ログ | `system.access.audit`（Databricks 標準）+ `portal.audit.operation_log`（ポータル固有） |
| presigned URL | フロントエンドは URL を外部に露出しないこと。有効期限内は認証なしでアクセス可能 |
