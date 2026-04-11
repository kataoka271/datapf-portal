# インフラ (Terraform) — Claude Code 指示書

## 構成概要

```
infra/terraform/
├── modules/              再利用可能モジュール（環境非依存）
│   ├── lambda/           Lambda 関数・レイヤー・CloudWatch Logs・アラーム
│   ├── api_gateway/      API Gateway v2 HTTP API・JWT オーソライザー・カスタムドメイン
│   ├── s3_cloudfront/    S3 静的サイト + CloudFront（OAC）+ 動画バケット
│   ├── iam/              Lambda 実行ロール・S3/SES/Secrets Manager ポリシー
│   ├── ses/              SES メール送信設定・ドメイン検証
│   ├── cognito/          Cognito User Pool・IAM Identity Center OIDC フェデレーション
│   └── secrets/          Secrets Manager（Databricks 認証情報）
├── environments/
│   ├── dev/              開発環境（DEV_MODE=true, 低スロットリング, 短期ログ保持）
│   └── prod/             本番環境（WAF, DLQ, プロビジョニング済み同時実行, 削除保護）
└── README.md
```

---

## アーキテクチャ決定事項

| 決定 | 理由 |
|---|---|
| API Gateway v2 HTTP API（REST API ではない） | コスト約 70% 削減、Lambda プロキシ統合がシンプル |
| JWT オーソライザー（Lambda オーソライザーではない） | IAM Identity Center の JWKS を直接検証、レイテンシゼロ |
| `$default` キャッチオールルート | FastAPI/Mangum がルーティングを担当するため API Gateway 側は不要 |
| CloudFront OAC（OAI ではない） | 2022年以降の推奨方式。S3 パブリックアクセス不要 |
| Lambda レイヤー分離 | 依存関係（〜200MB）を別レイヤーに分離しデプロイサイズを削減 |
| Secrets Manager（環境変数直接設定ではない） | 機密情報をコードとインフラ定義から完全分離 |
| S3 バックエンド + DynamoDB ロック | チームでの Terraform 状態管理の標準構成 |

---

## 環境ごとの差分

| 設定項目 | dev | prod |
|---|---|---|
| `DEV_MODE` | `true` | `false` |
| Lambda メモリ | 512 MB | 1024 MB |
| プロビジョニング済み同時実行 | 0 | 設定可能 |
| X-Ray トレーシング | 無効 | 有効 |
| WAF | なし | あり（レートリミット・マネージドルール） |
| Lambda DLQ | なし | あり（SQS） |
| Secrets Manager 削除保護 | なし（即時削除可能） | あり（30日） |
| ログ保持期間 | 14日 | 90日 |
| CloudFront 料金クラス | PriceClass_200 | PriceClass_200 |
| 動画保持期間 | 180日 | 730日 |
| Cognito 削除保護 | なし | あり |
| Cognito MFA | 無効 | 有効 |

---

## モジュールへの変更ルール

### 1. 変数には必ず `description` を書く

```hcl
variable "throttle_burst_limit" {
  description = "スロットリングのバースト上限（リクエスト数）"  # 必須
  type        = number
  default     = 500
}
```

### 2. 全リソースに `tags = var.tags` を付ける

```hcl
resource "aws_lambda_function" "api" {
  # ...
  tags = var.tags   # 必須
}
```

### 3. 条件付きリソースは `count` で制御する

```hcl
resource "aws_lambda_provisioned_concurrency_config" "api" {
  count = var.provisioned_concurrency > 0 ? 1 : 0
  # ...
}
```

### 4. センシティブな変数には `sensitive = true` を付ける

```hcl
variable "databricks_sp_client_secret" {
  type      = string
  sensitive = true  # terraform plan/apply で値がマスクされる
}
```

### 5. outputs は全モジュールの `main.tf` 末尾に定義する

```hcl
output "function_arn" {
  value       = aws_lambda_function.api.arn
  description = "Lambda 関数の ARN"
}
```

---

## よく使うコマンド

```bash
# Terraform 状態バックエンドの初期作成（初回のみ）
make bootstrap-state-bucket ENV=dev
make bootstrap-state-bucket ENV=prod

# 開発ワークフロー
make plan ENV=dev        # 変更計画を確認
make apply ENV=dev       # インフラを適用
make outputs ENV=dev     # 出力値を確認

# 高速デプロイ（Lambda コードのみ変更した場合）
make lambda-update ENV=dev

# フロントエンドのみ更新（Terraform 不要）
make frontend-deploy ENV=dev

# フルデプロイ（ビルド → apply → S3 sync → CF 無効化）
make deploy ENV=dev

# フォーマット
terraform fmt -recursive infra/terraform/
```

---

## Terraform plan の見方（重要な変更の確認ポイント）

`~` = 更新（インプレース）
`-/+` = 再作成（ダウンタイム注意）
`+` = 新規作成
`-` = 削除

**再作成を伴う代表的な変更（注意が必要）:**
- `aws_lambda_function`: `handler`, `runtime`, `role` の変更
- `aws_apigatewayv2_api`: `cors_configuration` の変更（ステージの再デプロイが必要）
- `aws_cloudfront_distribution`: ほぼ全ての変更（数分かかる）
- `aws_cognito_user_pool`: `schema` の変更（削除→再作成になる場合あり）

---

## GitHub Actions シークレット設定

`Settings → Secrets and variables → Actions` に以下を登録すること。

### dev 環境（`AWS_DEPLOY_ROLE_ARN_DEV` など）

| シークレット名 | 内容 |
|---|---|
| `AWS_DEPLOY_ROLE_ARN_DEV` | GitHub Actions 用 IAM ロール ARN (dev) |
| `DATABRICKS_HOST` | Databricks ワークスペース URL |
| `DATABRICKS_SP_CLIENT_ID` | サービスプリンシパル Client ID |
| `DATABRICKS_SP_CLIENT_SECRET` | サービスプリンシパル Client Secret |
| `DATABRICKS_SQL_WAREHOUSE_ID` | SQL Warehouse ID |
| `OIDC_ISSUER` | IAM Identity Center issuer URL |
| `OIDC_JWKS_URI` | JWKS エンドポイント |
| `OIDC_AUDIENCE` | OIDC audience |
| `IDC_CLIENT_ID` | IAM Identity Center クライアント ID |
| `IDC_CLIENT_SECRET` | IAM Identity Center クライアントシークレット |
| `SES_SENDER_EMAIL` | SES 送信元メールアドレス |

prod 環境は上記の `_PROD` サフィックス版を追加する。

---

## 新しい AWS リソースを追加する手順

1. 適切なモジュール (`modules/`) の `main.tf` にリソースを追加
2. `variables.tf` に必要な変数を追加（`description` 必須）
3. `main.tf` 末尾の `output` ブロックに必要な出力を追加
4. 環境ファイル (`environments/dev/main.tf`) でモジュール呼び出しに変数を追加
5. `environments/dev/variables.tf` に変数定義を追加
6. `environments/prod/main.tf` と `prod/variables.tf` にも同様に追加
7. `terraform fmt -recursive infra/terraform/` でフォーマット
8. `terraform validate` で構文検証
9. `make plan ENV=dev` で変更内容を確認

---

## 既知の TODO

| 項目 | 内容 |
|---|---|
| GitHub Actions IAM ロール | OIDC 連携の IAM ロール定義を Terraform で管理する（現状は手動設定が必要） |
| WAF ログ | prod WAF のログを S3 / CloudWatch Logs に送信する設定が未実装 |
| Lambda 同時実行数の上限設定 | `reserved_concurrent_executions` で Lambda の最大同時実行数を制限する |
| API Gateway Access Log の KMS 暗号化 | CloudWatch Logs グループの KMS 暗号化が未設定 |
| Secrets Manager ローテーション | `enable_rotation = true` のローテーション Lambda が未実装 |
| prod Cognito バックアップ | User Pool のエクスポート・バックアップ戦略が未定義 |
