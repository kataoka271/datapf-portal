variable "project" {
  type    = string
  default = "portal"
}

variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}

variable "owner" {
  type    = string
  default = "platform-team"
}

variable "lambda_zip_path" {
  type    = string
  default = "../../backend/lambda.zip"
}

variable "layer_zip_path" {
  type    = string
  default = "../../backend/layer.zip"
}

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

variable "oidc_issuer" {
  type = string
}

variable "oidc_jwks_uri" {
  type = string
}

variable "oidc_audience" {
  type = string
}

variable "ses_sender_email" {
  type = string
}

variable "ses_sender_domain" {
  type    = string
  default = ""
}

variable "custom_domain" {
  description = "prod では必須（例: portal.example.com）"
  type        = string
}

variable "acm_certificate_arn" {
  description = "CloudFront 用 ACM 証明書 ARN（us-east-1 リージョン）"
  type        = string
}

variable "route53_zone_id" {
  type = string
}

variable "enable_vpc" {
  type    = bool
  default = false
}

variable "vpc_id" {
  type    = string
  default = ""
}

variable "vpc_subnet_ids" {
  type    = list(string)
  default = []
}

variable "alarm_sns_arn" {
  description = "CloudWatch アラーム通知先 SNS ARN（prod では必須）"
  type        = string
  default     = ""
}

# ── prod 固有 ───────────────────────────────────────────────────────────────────

variable "additional_allowed_origins" {
  description = "許可する追加オリジン（カスタムドメイン以外）"
  type        = list(string)
  default     = []
}

variable "api_custom_domain" {
  description = "API Gateway カスタムドメイン（例: api.portal.example.com）"
  type        = string
  default     = ""
}

variable "provisioned_concurrency" {
  description = "Lambda プロビジョニング済み同時実行数（コールドスタート対策）"
  type        = number
  default     = 2
}

variable "waf_blocked_countries" {
  description = "WAF で遮断する国コードリスト（ISO 3166-1 alpha-2）"
  type        = list(string)
  default     = []
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

variable "github_org" {
  description = "GitHub 組織名（GitHub Actions OIDC 認証の制限に使用）"
  type        = string
}

variable "github_repo" {
  description = "GitHub リポジトリ名（GitHub Actions OIDC 認証の制限に使用）"
  type        = string
  default     = "portal"
}
