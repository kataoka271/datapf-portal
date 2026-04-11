variable "prefix" { type = string }
variable "lambda_invoke_arn" { type = string }

variable "allowed_origins" {
  type    = list(string)
  default = []
}

variable "oidc_audience" {
  description = "JWT オーソライザーの audience (IAM Identity Center のクライアント ID)"
  type        = string
}

variable "oidc_issuer" {
  description = "JWT オーソライザーの issuer URL (IAM Identity Center)"
  type        = string
}

variable "throttle_burst_limit" {
  description = "スロットリングのバースト上限（リクエスト数）"
  type        = number
  default     = 500
}

variable "throttle_rate_limit" {
  description = "スロットリングのレート上限（リクエスト/秒）"
  type        = number
  default     = 100
}

variable "integration_timeout_ms" {
  description = "Lambda 統合タイムアウト（ms）。Lambda timeout より短くする"
  type        = number
  default     = 29000
}

variable "enable_detailed_metrics" {
  type    = bool
  default = false
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "custom_domain" {
  type    = string
  default = ""
}

variable "acm_certificate_arn" {
  type    = string
  default = ""
}

variable "route53_zone_id" {
  type    = string
  default = ""
}

variable "alarm_5xx_threshold" {
  description = "5xx エラーアラーム閾値（件数）"
  type        = number
  default     = 10
}

variable "alarm_latency_threshold" {
  description = "P99 レイテンシアラーム閾値（ms）"
  type        = number
  default     = 5000
}

variable "alarm_sns_arn" {
  type    = string
  default = ""
}

variable "tags" {
  type    = map(string)
  default = {}
}
