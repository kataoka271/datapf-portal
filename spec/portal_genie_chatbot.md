# Genie チャットボット機能 仕様

## 1. 概要・目的

Databricks AI/BI Genie を活用し、自然言語でカタログのデータに問い合わせができるチャットボット機能。
ユーザーはカタログを選択し、データに関する質問を入力するだけで、Genie が SQL を生成・実行して結果を返す。

**背景と課題:**
- データカタログに含まれるテーブルの内容を確認するためには、SQL の知識が必要だった
- テーブル構造を把握してからでないとデータの探索ができなかった

**ユーザーの流れ:**
1. サイドバーの「Genie」をクリック
2. カタログセレクタで問い合わせ対象カタログを選択
3. 自然言語で質問を入力して送信
4. Genie が SQL を生成・実行し、テキスト回答とクエリ結果テーブルを返す
5. 続けて追加の質問を入力することで同一会話を継続できる
6. カタログを切り替えると会話がリセットされ新しい会話が始まる

---

## 2. ページ仕様

| 項目 | 値 |
|---|---|
| URL | `/analysis/genie` |
| ページタイトル | Genie チャット |
| ナビゲーション | データ分析 > Genie |
| 必要権限 | 対象カタログに対して `viewer` / `editor` / `owner` いずれかのロール |

---

## 3. UI レイアウト

```
┌──────────────────────────────────────────────────────────────┐
│ Header                                                        │
├──────────────┬───────────────────────────────────────────────┤
│ Sidebar(nav) │ Genie チャット                    ← PageHeader │
│              │ 自然言語でカタログのデータに質問できます        │
│              │                      [カタログを選択... ▼]    │
│              ├───────────────────────────────────────────────┤
│              │                                               │
│              │  （カタログ未選択）                            │
│              │   カタログを選択してください                   │
│              │   上のセレクタから対象カタログを選んで...       │
│              │                                               │
│              │  ─────── 会話中 ────────────────────────────  │
│              │                                               │
│              │                   [user] 車速の平均を教えて    │
│              │                                      ↑右寄せ  │
│              │  [ai] 以下の結果が得られました。               │
│              │  ┌──────────────────────────────────────┐     │
│              │  │ vehicle_id │ event_time   │ value    │     │
│              │  │ VH-001     │ 2025-01-01.. │ 42.5     │     │
│              │  │ VH-002     │ 2025-01-01.. │ 38.2     │     │
│              │  └──────────────────────────────────────┘     │
│              │                                               │
│              │  [ai 応答待ち中] ⬤⬤⬤ (Spinner)              │
│              ├───────────────────────────────────────────────┤
│              │ [質問を入力...(Enter送信 / Shift+Enter改行)] [送信] │
└──────────────┴───────────────────────────────────────────────┘
```

---

## 4. 機能仕様

### 4.1 カタログ選択

- ページ右上のセレクタに「アクセス中（subscribed）のカタログ」を表示する
- `GET /catalogs?subscribed=true` で取得したカタログ一覧から生成
- カタログを切り替えると会話 ID がリセットされ、メッセージ履歴も消去される

### 4.2 メッセージ送信

1. テキストエリアに質問を入力
2. `[送信]` ボタンまたは `Enter` キーで送信（`Shift + Enter` で改行）
3. **初回メッセージ**: `POST /v1/genie/conversations` を呼び出し新規会話を開始
4. **2回目以降**: `POST /v1/genie/conversations/{conversation_id}/messages` で同一会話を継続
5. 送信中はテキストエリアと送信ボタンを無効化し、チャット欄に Spinner を表示
6. エラー発生時はトースト通知を表示し、送信したユーザーメッセージを取り消す

### 4.3 メッセージ表示

| 種別 | 表示スタイル | 内容 |
|---|---|---|
| ユーザーメッセージ | 右寄せ・teal 背景 | 入力したテキスト |
| AI 回答（テキスト） | 左寄せ・白背景・ボーダー | Genie のテキスト回答 |
| AI 回答（クエリ結果） | テキスト直下にテーブル表示 | SQL 実行結果（列名 + 行データ） |

クエリ結果テーブルはスクロール可能な横スクロール対応テーブルとして表示する。
`null` 値は `—` で表示する。

### 4.4 アクセス制御

- カタログセレクタには `subscribed: true` （アクセス中）のカタログのみ表示する
- バックエンドでも `user.catalog_roles` を確認し、対象カタログに対するロールがない場合は `403 Forbidden` を返す

---

## 5. API 仕様

### `POST /v1/genie/conversations`

新規会話を開始する（初回メッセージ）。

**リクエスト:**
```json
{
  "catalog_name": "vehicle_timeseries",
  "message": "車速の平均を教えて"
}
```

**レスポンス:**
```json
{
  "conversation_id": "01abc...",
  "message_id": "msg-001",
  "reply": "以下の結果が得られました。",
  "query_result": {
    "columns": ["vehicle_id", "event_time", "value"],
    "rows": [
      ["VH-001", "2025-01-01T00:00:00Z", 42.5],
      ["VH-002", "2025-01-01T00:01:00Z", 38.2]
    ]
  },
  "status": "COMPLETED"
}
```

`query_result` はクエリ結果がない場合は `null`。

**エラー:**
| ステータス | 条件 |
|---|---|
| 403 | 対象カタログへのロールがない |
| 404 | 本番環境で `GENIE_SPACE_IDS` に対象カタログのスペース ID が未設定 |
| 422 | `message` が空文字または 2000 文字超 |

---

### `POST /v1/genie/conversations/{conversation_id}/messages`

既存会話を継続してメッセージを送る。

**リクエスト:** `POST /v1/genie/conversations` と同一。

**レスポンス:** `POST /v1/genie/conversations` と同一。`conversation_id` は `{conversation_id}` パスパラメータと同値。

---

## 6. バックエンド実装

### 6.1 Genie Space の対応関係

各カタログに対して Databricks ワークスペースに Genie Space を事前作成しておく。
カタログ名と Space ID のマッピングを環境変数 `GENIE_SPACE_IDS` に JSON 文字列で指定する。

```bash
GENIE_SPACE_IDS='{"vehicle_timeseries":"01abc...","fault_diagnostics":"02def..."}'
```

Space が設定されていないカタログへの本番アクセスは `404` を返す。
開発モード（`DEV_MODE=true`）では Space ID を参照せずモックデータを返す。

### 6.2 Databricks SDK の利用

`databricks-sdk` の `WorkspaceClient.genie` 経由で API を呼び出す。
バックエンドが内部でポーリングを行い、完了後にレスポンスを返す同期的な設計とする。

```python
# 新規会話
result = w.genie.start_conversation_and_wait(space_id, content=message)

# 会話継続
result = w.genie.create_message_and_wait(space_id, conversation_id, content=message)
```

レスポンスの `attachments` からテキスト回答とクエリ結果を抽出して返す。

### 6.3 モックデータ（DEV_MODE）

`app/services/mock_data.py` の `mock_genie_reply()` が以下を返す。

```json
{
  "conversation_id": "conv-mock-001",
  "message_id": "msg-mock-001",
  "reply": "カタログ「{catalog_name}」に関するご質問「{message}」を分析しました。以下にサンプルデータを示します。",
  "query_result": {
    "columns": ["vehicle_id", "event_time", "value"],
    "rows": [
      ["VH-001", "2025-01-01T00:00:00Z", 42.5],
      ["VH-002", "2025-01-01T00:01:00Z", 38.2],
      ["VH-003", "2025-01-01T00:02:00Z", 51.0]
    ]
  },
  "status": "COMPLETED"
}
```

---

## 7. フロントエンド実装

### 7.1 コンポーネント構成

```
GenieChatbot.tsx          ← メインページコンポーネント
  └─ QueryResultTable     ← クエリ結果テーブル（内部コンポーネント）
  └─ ChatBubble           ← メッセージバブル（内部コンポーネント）
```

### 7.2 状態管理

| 状態 | 型 | 説明 |
|---|---|---|
| `selectedCatalog` | `string` | 選択中のカタログ名 |
| `input` | `string` | テキストエリアの入力値 |
| `messages` | `GenieMessage[]` | 表示中のメッセージ履歴（ローカル） |
| `conversationId` | `string \| null` | 進行中の Genie 会話 ID |

会話履歴はローカル `useState` で管理する（ページリロードで消去される）。

### 7.3 型定義

```typescript
// src/types/index.ts
export interface GenieQueryResult {
  columns: string[];
  rows: (string | number | null)[][];
}

export interface GenieMessage {
  role: "user" | "assistant";
  content: string;
  query_result?: GenieQueryResult;
}
```

### 7.4 カスタムフック

```typescript
// src/hooks/index.ts
export function useGenieChat() {
  return useMutation({
    mutationFn: ({ conversationId, catalogName, message }) =>
      conversationId
        ? genieApi.sendMessage(conversationId, { catalog_name: catalogName, message })
        : genieApi.startConversation({ catalog_name: catalogName, message }),
  });
}
```

---

## 8. 環境変数

| 変数名 | デフォルト | 説明 |
|---|---|---|
| `GENIE_SPACE_IDS` | `{}` | カタログ名 → Genie Space ID のマッピング（JSON 文字列） |

---

## 9. 既知の制約・TODO

| 項目 | 内容 |
|---|---|
| 会話履歴の永続化 | 現状はローカル `useState` のみ。ページリロードで消去される。必要に応じて Delta Table への保存を検討 |
| Genie ポーリングタイムアウト | `start_conversation_and_wait` / `create_message_and_wait` のタイムアウトは SDK デフォルト。Lambda の 30 秒制限（API Gateway）との兼ね合いで長い応答は失敗する可能性がある |
| Space ID 管理 UI | 現状は環境変数で管理。カタログオーナーが管理画面から Space ID を登録できるようにすることを将来的に検討 |
| ストリーミング応答 | 現状は同期的に完了後に返す。Genie の実行が長い場合の UX 改善としてストリーミングを検討 |
