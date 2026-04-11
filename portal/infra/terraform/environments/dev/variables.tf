variable "project" {
  description = "プロジェクト識別子（リソース名プレフィックスに使用）"
  type        = string
  default     = "portal"
}

variable "aws_region" {
  description = "デプロイ先 AWS リージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "owner" {
  description = "タグ用オーナー識別子"
  type        = string
  default     = "platform-team"
}

# ── デプロイパッケージ ──────────────────────────────────────────────────────────
variable "lambda_zip_path" {
  description = "Lambda アプリケーションコードの ZIP パス"
  type        = string
  default     = "../../backend/lambda.zip"
}

variable "layer_zip_path" {
  description = "Lambda 依存関係レイヤーの ZIP パス"
  type        = string
  default     = "../../backend/layer.zip"
}

# ── Databricks ─────────────────────────────────────────────────────────────────
variable "databricks_host" {
  type      = string
  sensitive = true
}

variable "databricks_sp_client_id" {
  type      = string
  sensitive = true
}

variable "databricks_sp_client_secret" {
  type      = string
  sensitive = true
}

variable "databricks_sql_warehouse_id" {
  type = string
}

# ── 認証（IAM Identity Center）─────────────────────────────────────────────────
variable "oidc_issuer" {
  description = "IAM Identity Center OIDC issuer URL"
  type        = string
}

variable "oidc_jwks_uri" {
  description = "IAM Identity Center JWKS エンドポイント"
  type        = string
}

variable "oidc_audience" {
  description = "OIDC audience（クライアント ID）"
  type        = string
}

variable "idc_client_id" {
  description = "IAM Identity Center アプリケーションのクライアント ID"
  type        = string
  sensitive   = true
}

variable "idc_client_secret" {
  description = "IAM Identity Center アプリケーションのクライアントシークレット"
  type        = string
  sensitive   = true
}

# ── メール・ドメイン ────────────────────────────────────────────────────────────
variable "ses_sender_email" {
  description = "SES 送信元メールアドレス"
  type        = string
}

variable "ses_sender_domain" {
  description = "SES 送信元ドメイン（空の場合はメールアドレスで検証）"
  type        = string
  default     = ""
}

variable "custom_domain" {
  description = "カスタムドメイン（空の場合は CloudFront デフォルトドメインを使用）"
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "CloudFront 用 ACM 証明書 ARN（us-east-1）"
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route 53 ホストゾーン ID"
  type        = string
  default     = ""
}

# ── 監視 ───────────────────────────────────────────────────────────────────────
variable "alarm_sns_arn" {
  description = "CloudWatch アラーム通知先 SNS トピック ARN"
  type        = string
  default     = ""
}

variable "github_org" {
  description = "GitHub 組織名（GitHub Actions OIDC 認証の制限に使用）"
  type        = string
}

variable "github_repo" {
  description = "GitHub リポジトリ名"
  type        = string
  default     = "portal"
}
