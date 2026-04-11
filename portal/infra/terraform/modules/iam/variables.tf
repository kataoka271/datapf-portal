variable "prefix" {
  description = "リソース名のプレフィックス (例: portal-dev)"
  type        = string
}

variable "aws_region" {
  description = "AWS リージョン"
  type        = string
}

variable "aws_account_id" {
  description = "AWS アカウント ID"
  type        = string
}

variable "video_bucket_arn" {
  description = "車載動画 S3 バケットの ARN"
  type        = string
}

variable "frontend_bucket_arn" {
  description = "フロントエンド静的サイト S3 バケットの ARN"
  type        = string
}

variable "databricks_secret_arn" {
  description = "Databricks 認証情報 Secrets Manager シークレットの ARN"
  type        = string
}

variable "cloudfront_distribution_arn" {
  description = "CloudFront ディストリビューションの ARN（OAC 用）"
  type        = string
}

variable "ses_sender_email" {
  description = "SES 送信元メールアドレス"
  type        = string
}

variable "enable_vpc" {
  description = "Lambda を VPC 内に配置するか"
  type        = bool
  default     = false
}

variable "tags" {
  description = "共通タグ"
  type        = map(string)
  default     = {}
}
