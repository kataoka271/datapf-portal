variable "prefix" { type = string }
variable "aws_region" { type = string }
variable "lambda_exec_role_arn" { type = string }
variable "lambda_zip_path" { type = string }
variable "layer_zip_path" { type = string }
variable "api_gateway_execution_arn" { type = string }

variable "portal_catalog" {
  type    = string
  default = "portal"
}

variable "ses_sender_email" { type = string }
variable "video_bucket_name" { type = string }
variable "databricks_secret_name" { type = string }

variable "dev_mode" {
  type    = bool
  default = false
}

variable "allowed_origins" {
  type    = list(string)
  default = []
}

variable "timeout" {
  type    = number
  default = 30
}

variable "memory_size" {
  type    = number
  default = 512
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "log_level" {
  type    = string
  default = "INFO"
}

variable "enable_xray" {
  type    = bool
  default = true
}

variable "provisioned_concurrency" {
  type    = number
  default = 0
}

variable "error_rate_threshold" {
  description = "エラー率アラーム閾値（%）"
  type        = number
  default     = 5
}

variable "p99_duration_threshold" {
  description = "P99 レイテンシアラーム閾値（ms）"
  type        = number
  default     = 5000
}

variable "alarm_sns_arn" {
  type    = string
  default = ""
}

variable "dlq_arn" {
  type    = string
  default = ""
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

variable "tags" {
  type    = map(string)
  default = {}
}
